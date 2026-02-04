import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type MarketIndicator = {
  symbol: string;
  displaySymbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  updatedAt: string;
};

const REFRESH_INTERVAL = 60000; // 60 segundos

// Dados mock para exibir enquanto a Edge Function não está deployada
const MOCK_DATA: MarketIndicator[] = [
  {
    symbol: '^BVSP',
    displaySymbol: 'IBOV',
    name: 'Ibovespa',
    price: 126543,
    change: -1089,
    changePercent: -0.85,
    updatedAt: new Date().toISOString(),
  },
  {
    symbol: 'SPY',
    displaySymbol: 'S&P 500',
    name: 'S&P 500',
    price: 4987.32,
    change: 15.67,
    changePercent: 0.32,
    updatedAt: new Date().toISOString(),
  },
  {
    symbol: 'QQQ',
    displaySymbol: 'NASDAQ',
    name: 'Nasdaq 100',
    price: 17234.56,
    change: 89.12,
    changePercent: 0.52,
    updatedAt: new Date().toISOString(),
  },
  {
    symbol: 'USDBRL',
    displaySymbol: 'USD/BRL',
    name: 'Dólar',
    price: 5.02,
    change: -0.03,
    changePercent: -0.59,
    updatedAt: new Date().toISOString(),
  },
  {
    symbol: 'BTCUSDT',
    displaySymbol: 'BTC',
    name: 'Bitcoin',
    price: 42987,
    change: 812,
    changePercent: 1.93,
    updatedAt: new Date().toISOString(),
  },
];

// Singleton para cache global
let globalCache: {
  data: MarketIndicator[];
  lastFetch: number;
  fetching: boolean;
  failCount: number;
  listeners: Set<() => void>;
  intervalId: ReturnType<typeof setInterval> | null;
} = {
  data: MOCK_DATA,
  lastFetch: 0,
  fetching: false,
  failCount: 0,
  listeners: new Set(),
  intervalId: null,
};

async function fetchMarketDataGlobal() {
  // Evita chamadas simultâneas
  if (globalCache.fetching) {
    return;
  }

  // Se falhou 3 vezes, para de tentar
  if (globalCache.failCount >= 3) {
    return;
  }

  // Se buscou há menos de 30 segundos, não busca de novo
  if (Date.now() - globalCache.lastFetch < 30000) {
    return;
  }

  globalCache.fetching = true;

  try {
    console.log('[useMarketData] Fetching market data...');

    const { data: response, error: fnError } =
      await supabase.functions.invoke('get-market-data');

    if (fnError) {
      throw fnError;
    }

    if (
      response?.data &&
      Array.isArray(response.data) &&
      response.data.length > 0
    ) {
      globalCache.data = response.data;
      globalCache.failCount = 0;
      globalCache.lastFetch = Date.now();
      console.log(
        `[useMarketData] Received ${response.data.length} indicators (cached: ${response.cached})`
      );

      // Notifica todos os listeners
      globalCache.listeners.forEach((listener) => listener());
    }
  } catch (err) {
    console.error('[useMarketData] Error:', err);
    globalCache.failCount += 1;
  } finally {
    globalCache.fetching = false;
  }
}

function startGlobalInterval() {
  if (globalCache.intervalId) return;

  globalCache.intervalId = setInterval(() => {
    if (globalCache.failCount < 3) {
      fetchMarketDataGlobal();
    }
  }, REFRESH_INTERVAL);
}

function stopGlobalInterval() {
  if (globalCache.intervalId && globalCache.listeners.size === 0) {
    clearInterval(globalCache.intervalId);
    globalCache.intervalId = null;
  }
}

export function useMarketData() {
  const [data, setData] = useState<MarketIndicator[]>(globalCache.data);
  const [loading] = useState(false);

  const refresh = useCallback(() => {
    globalCache.lastFetch = 0; // Força refresh
    fetchMarketDataGlobal();
  }, []);

  useEffect(() => {
    // Registra listener
    const listener = () => {
      setData([...globalCache.data]);
    };
    globalCache.listeners.add(listener);

    // Busca inicial
    fetchMarketDataGlobal();
    startGlobalInterval();

    // Atualiza com dados atuais
    setData([...globalCache.data]);

    return () => {
      globalCache.listeners.delete(listener);
      stopGlobalInterval();
    };
  }, []);

  return {
    data,
    loading,
    error: null,
    usingMock: globalCache.data === MOCK_DATA,
    refresh,
  };
}
