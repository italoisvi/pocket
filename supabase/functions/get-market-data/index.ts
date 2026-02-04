import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY')!;

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CACHE_TTL_SECONDS = 60;

// Indicadores que vamos buscar
// Free tier funciona bem com: ações US, ETFs, alguns índices
const MARKET_INDICATORS = [
  // ETFs que rastreiam índices (funcionam no free tier)
  {
    symbol: 'SPY',
    displaySymbol: 'S&P 500',
    name: 'S&P 500 ETF',
    type: 'quote',
  },
  {
    symbol: 'QQQ',
    displaySymbol: 'NASDAQ',
    name: 'Nasdaq 100 ETF',
    type: 'quote',
  },
  { symbol: 'DIA', displaySymbol: 'DOW', name: 'Dow Jones ETF', type: 'quote' },
  { symbol: 'EWZ', displaySymbol: 'IBOV', name: 'Brazil ETF', type: 'quote' }, // ETF Brasil
  // Ações populares
  { symbol: 'AAPL', displaySymbol: 'AAPL', name: 'Apple', type: 'quote' },
  { symbol: 'MSFT', displaySymbol: 'MSFT', name: 'Microsoft', type: 'quote' },
  { symbol: 'GOOGL', displaySymbol: 'GOOGL', name: 'Google', type: 'quote' },
  { symbol: 'AMZN', displaySymbol: 'AMZN', name: 'Amazon', type: 'quote' },
  { symbol: 'TSLA', displaySymbol: 'TSLA', name: 'Tesla', type: 'quote' },
  { symbol: 'NVDA', displaySymbol: 'NVDA', name: 'Nvidia', type: 'quote' },
  // Crypto via Coinbase (disponível no free tier)
  {
    symbol: 'COINBASE:BTC-USD',
    displaySymbol: 'BTC',
    name: 'Bitcoin',
    type: 'crypto',
  },
  {
    symbol: 'COINBASE:ETH-USD',
    displaySymbol: 'ETH',
    name: 'Ethereum',
    type: 'crypto',
  },
];

type MarketData = {
  symbol: string;
  displaySymbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  updatedAt: string;
};

type CacheEntry = {
  data: MarketData[];
  cachedAt: number;
};

let memoryCache: CacheEntry | null = null;

serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const now = Date.now();
    if (memoryCache && now - memoryCache.cachedAt < CACHE_TTL_SECONDS * 1000) {
      console.log('[get-market-data] Returning from memory cache');
      return new Response(
        JSON.stringify({
          data: memoryCache.data,
          cached: true,
          cacheAge: Math.floor((now - memoryCache.cachedAt) / 1000),
        }),
        { headers }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: cacheData } = await supabase
      .from('market_data_cache')
      .select('data, cached_at')
      .eq('id', 'market_indicators')
      .single();

    if (cacheData) {
      const cacheAge = (now - new Date(cacheData.cached_at).getTime()) / 1000;
      if (cacheAge < CACHE_TTL_SECONDS) {
        console.log(
          `[get-market-data] Returning from DB cache (age: ${Math.floor(cacheAge)}s)`
        );
        memoryCache = {
          data: cacheData.data,
          cachedAt: new Date(cacheData.cached_at).getTime(),
        };
        return new Response(
          JSON.stringify({
            data: cacheData.data,
            cached: true,
            cacheAge: Math.floor(cacheAge),
          }),
          { headers }
        );
      }
    }

    console.log('[get-market-data] Fetching fresh data from Finnhub...');
    const marketData = await fetchAllMarketData();

    if (marketData.length > 0) {
      await supabase.from('market_data_cache').upsert({
        id: 'market_indicators',
        data: marketData,
        cached_at: new Date().toISOString(),
      });

      memoryCache = {
        data: marketData,
        cachedAt: now,
      };
    }

    return new Response(
      JSON.stringify({
        data: marketData,
        cached: false,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[get-market-data] Error:', error);

    if (memoryCache) {
      return new Response(
        JSON.stringify({
          data: memoryCache.data,
          cached: true,
          stale: true,
          error: 'Using stale cache due to API error',
        }),
        { headers }
      );
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to fetch market data' }),
      { status: 500, headers }
    );
  }
});

async function fetchAllMarketData(): Promise<MarketData[]> {
  const results: MarketData[] = [];

  // Buscar em paralelo para ser mais rápido
  const promises = MARKET_INDICATORS.map(async (indicator) => {
    try {
      const data = await fetchIndicator(indicator);
      if (data) {
        return data;
      }
    } catch (error) {
      console.error(
        `[get-market-data] Error fetching ${indicator.symbol}:`,
        error.message
      );
    }
    return null;
  });

  const resolved = await Promise.all(promises);
  for (const data of resolved) {
    if (data) {
      results.push(data);
    }
  }

  console.log(
    `[get-market-data] Successfully fetched ${results.length} indicators`
  );
  return results;
}

async function fetchIndicator(
  indicator: (typeof MARKET_INDICATORS)[0]
): Promise<MarketData | null> {
  let url: string;

  if (indicator.type === 'quote') {
    // Endpoint de quote para ações e ETFs
    url = `${FINNHUB_BASE}/quote?symbol=${indicator.symbol}&token=${FINNHUB_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `[get-market-data] Quote API error for ${indicator.symbol}: ${response.status}`
      );
      return null;
    }

    const data = await response.json();

    // c = current price, d = change, dp = change percent
    if (!data.c || data.c === 0) {
      console.warn(`[get-market-data] No quote data for ${indicator.symbol}`);
      return null;
    }

    return {
      symbol: indicator.symbol,
      displaySymbol: indicator.displaySymbol,
      name: indicator.name,
      price: data.c,
      change: data.d || 0,
      changePercent: data.dp || 0,
      updatedAt: new Date().toISOString(),
    };
  } else if (indicator.type === 'crypto') {
    // Endpoint de crypto candle
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;
    url = `${FINNHUB_BASE}/crypto/candle?symbol=${indicator.symbol}&resolution=D&from=${dayAgo}&to=${now}&token=${FINNHUB_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `[get-market-data] Crypto API error for ${indicator.symbol}: ${response.status}`
      );
      return null;
    }

    const data = await response.json();

    if (data.s === 'no_data' || !data.c || !data.c.length) {
      console.warn(`[get-market-data] No crypto data for ${indicator.symbol}`);
      return null;
    }

    const currentPrice = data.c[data.c.length - 1];
    const openPrice = data.o ? data.o[0] : currentPrice;
    const change = currentPrice - openPrice;
    const changePercent = openPrice > 0 ? (change / openPrice) * 100 : 0;

    return {
      symbol: indicator.symbol,
      displaySymbol: indicator.displaySymbol,
      name: indicator.name,
      price: currentPrice,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
}
