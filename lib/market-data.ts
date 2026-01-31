import type {
  StockQuote,
  IndexQuote,
  CryptoQuote,
  EconomicIndicator,
  CurrencyQuote,
} from '@/types/feed';

const BRAPI_BASE = 'https://brapi.dev/api';
const BRAPI_TOKEN = ''; // Deixar vazio - usuário deve adicionar sua própria chave
const BCB_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Mock data para desenvolvimento e fallback
function getMockStocks(): StockQuote[] {
  return [
    {
      symbol: 'PETR4',
      name: 'Petrobras PN',
      price: 38.52,
      change: 0.45,
      changePercent: 1.18,
      updatedAt: new Date(),
    },
    {
      symbol: 'VALE3',
      name: 'Vale ON',
      price: 62.15,
      change: -0.32,
      changePercent: -0.51,
      updatedAt: new Date(),
    },
    {
      symbol: 'ITUB4',
      name: 'Itaú Unibanco PN',
      price: 28.93,
      change: 0.18,
      changePercent: 0.63,
      updatedAt: new Date(),
    },
    {
      symbol: 'BBDC4',
      name: 'Bradesco PN',
      price: 13.45,
      change: 0.12,
      changePercent: 0.9,
      updatedAt: new Date(),
    },
    {
      symbol: 'ABEV3',
      name: 'Ambev ON',
      price: 11.28,
      change: -0.08,
      changePercent: -0.7,
      updatedAt: new Date(),
    },
  ];
}

function getMockIndices(): IndexQuote[] {
  return [
    {
      symbol: 'IBOV',
      name: 'Ibovespa',
      points: 127450,
      change: 1523,
      changePercent: 1.21,
      updatedAt: new Date(),
    },
  ];
}

// Mapper para converter resposta do Brapi em StockQuote
function mapBrapiToStockQuote(brapiData: any): StockQuote {
  return {
    symbol: brapiData.symbol,
    name: brapiData.longName || brapiData.shortName || brapiData.symbol,
    price: brapiData.regularMarketPrice || 0,
    change: brapiData.regularMarketChange || 0,
    changePercent: brapiData.regularMarketChangePercent || 0,
    volume: brapiData.regularMarketVolume,
    marketCap: brapiData.marketCap,
    updatedAt: new Date(),
  };
}

// Ações brasileiras via Brapi (gratuita)
export async function getBrazilianStocks(
  symbols: string[]
): Promise<StockQuote[]> {
  // Se não tem token, retornar mock data
  if (!BRAPI_TOKEN) {
    return getMockStocks();
  }

  try {
    const response = await fetch(
      `${BRAPI_BASE}/quote/${symbols.join(',')}?token=${BRAPI_TOKEN}`
    );

    if (!response.ok) {
      console.warn(
        `[market-data] Brapi API error: ${response.status}, usando dados mock`
      );
      return getMockStocks();
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      return getMockStocks();
    }

    return data.results.map(mapBrapiToStockQuote);
  } catch (error) {
    console.warn(
      '[market-data] Error fetching Brazilian stocks, usando mock:',
      error
    );
    return getMockStocks();
  }
}

// Índices via Brapi
export async function getIndexQuotes(symbols: string[]): Promise<IndexQuote[]> {
  // Se não tem token, retornar mock data
  if (!BRAPI_TOKEN) {
    return getMockIndices();
  }

  try {
    const response = await fetch(
      `${BRAPI_BASE}/quote/${symbols.join(',')}?token=${BRAPI_TOKEN}`
    );

    if (!response.ok) {
      console.warn(
        `[market-data] Brapi API error: ${response.status}, usando dados mock`
      );
      return getMockIndices();
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      return getMockIndices();
    }

    return data.results.map(
      (item: any): IndexQuote => ({
        symbol: item.symbol,
        name: item.longName || item.shortName || item.symbol,
        points: item.regularMarketPrice || 0,
        change: item.regularMarketChange || 0,
        changePercent: item.regularMarketChangePercent || 0,
        updatedAt: new Date(),
      })
    );
  } catch (error) {
    console.warn(
      '[market-data] Error fetching index quotes, usando mock:',
      error
    );
    return getMockIndices();
  }
}

// Selic via BCB (série 432 = Selic Meta)
export async function getSelic(): Promise<EconomicIndicator | null> {
  // API do BCB temporariamente desabilitada devido a erros
  return null;
}

// CDI via BCB (série 4389 = CDI Acumulado Mês)
export async function getCDI(): Promise<EconomicIndicator | null> {
  // API do BCB temporariamente desabilitada devido a erros
  return null;
}

// Dólar e Euro via BCB
export async function getCurrencyRates(): Promise<CurrencyQuote[]> {
  // API do BCB temporariamente desabilitada devido a erros
  return [];
}

// Mock data para criptomoedas
function getMockCryptos(): CryptoQuote[] {
  return [
    {
      id: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 245000,
      change24h: -2.5,
      updatedAt: new Date(),
    },
    {
      id: 'ethereum',
      symbol: 'ETH',
      name: 'Ethereum',
      price: 8500,
      change24h: 1.8,
      updatedAt: new Date(),
    },
  ];
}

// Criptomoedas via CoinGecko (gratuita)
export async function getCryptoQuotes(ids: string[]): Promise<CryptoQuote[]> {
  try {
    const response = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${ids.join(',')}&vs_currencies=brl&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`
    );

    if (!response.ok) {
      console.warn(
        `[market-data] CoinGecko API error: ${response.status}, usando dados mock`
      );
      return getMockCryptos();
    }

    const data = await response.json();

    const cryptos: CryptoQuote[] = [];

    for (const id of ids) {
      if (data[id]) {
        cryptos.push({
          id,
          symbol: id.toUpperCase().substring(0, 3), // BTC, ETH, etc
          name: id.charAt(0).toUpperCase() + id.slice(1),
          price: data[id].brl || 0,
          change24h: data[id].brl_24h_change || 0,
          marketCap: data[id].brl_market_cap,
          volume24h: data[id].brl_24h_vol,
          updatedAt: new Date(),
        });
      }
    }

    return cryptos.length > 0 ? cryptos : getMockCryptos();
  } catch (error) {
    console.warn(
      '[market-data] Error fetching crypto quotes, usando mock:',
      error
    );
    return getMockCryptos();
  }
}
