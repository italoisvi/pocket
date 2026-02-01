import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../../types.ts';

type ToolContext = {
  userId: UserId;
  supabase: SupabaseClient;
};

type NewsArticle = {
  title: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string;
  timeAgo: string;
};

type MarketIndicator = {
  symbol: string;
  displaySymbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
};

// NewsAPI configuration
const NEWS_API_KEY = '85147733ecf54ebab10d0a3bfe86a2ff';
const NEWS_API_BASE = 'https://newsapi.org/v2';

/**
 * Busca notícias financeiras recentes que podem impactar as finanças do usuário
 */
export async function getFinancialNews(
  params: { limit?: number; focus?: string },
  _context: ToolContext
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const limit = Math.min(params.limit || 10, 20);

    // Query focada em notícias de impacto financeiro pessoal
    const query =
      '(Selic OR "taxa de juros" OR inflação OR IPCA OR dólar OR "salário mínimo" OR FGTS OR "imposto de renda" OR PIX OR "cartão de crédito" OR financiamento OR empréstimo OR investimento OR poupança OR Tesouro Direto OR CDB OR "renda fixa" OR Ibovespa OR "bolsa de valores" OR Bitcoin OR gasolina OR combustível OR energia OR "conta de luz" OR aluguel OR IPTU OR INSS OR aposentadoria)';

    const today = new Date();
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fromDate = threeDaysAgo.toISOString().split('T')[0];

    const response = await fetch(
      `${NEWS_API_BASE}/everything?q=${encodeURIComponent(query)}&language=pt&sortBy=publishedAt&from=${fromDate}&pageSize=${limit * 2}&apiKey=${NEWS_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.articles || !Array.isArray(data.articles)) {
      return {
        success: true,
        data: {
          news: [],
          message:
            'Nenhuma notícia financeira relevante encontrada no momento.',
        },
      };
    }

    // Filtrar e processar artigos
    const articles: NewsArticle[] = data.articles
      .filter((article: any) => {
        const title = article.title || '';
        if (
          title === '[Removed]' ||
          title.toLowerCase() === '[removed]' ||
          title.trim().length < 10
        ) {
          return false;
        }
        if (!article.url || article.url === '[Removed]') {
          return false;
        }
        return true;
      })
      .slice(0, limit)
      .map((article: any): NewsArticle => {
        const publishedAt = article.publishedAt
          ? new Date(article.publishedAt)
          : new Date();

        return {
          title: cleanTitle(article.title),
          summary: article.description?.trim() || null,
          source: article.source?.name || 'Fonte desconhecida',
          url: article.url,
          publishedAt: publishedAt.toISOString(),
          timeAgo: getTimeAgo(publishedAt),
        };
      });

    // Categorizar notícias por impacto potencial
    const categorizedNews = categorizeNews(articles);

    return {
      success: true,
      data: {
        news: categorizedNews,
        totalFound: articles.length,
        fetchedAt: new Date().toISOString(),
        tip: 'Use essas notícias para contextualizar suas respostas sobre finanças pessoais do usuário.',
      },
    };
  } catch (error) {
    console.error('[getFinancialNews] Error:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao buscar notícias financeiras',
    };
  }
}

function cleanTitle(title: string): string {
  if (!title) return 'Sem título';

  let cleaned = title.trim();

  // Remove sufixos de fonte
  const suffixPatterns = [
    / - [A-Za-zÀ-ú\s]+$/,
    / \| [A-Za-zÀ-ú\s]+$/,
    / – [A-Za-zÀ-ú\s]+$/,
  ];

  for (const pattern of suffixPatterns) {
    if (pattern.test(cleaned) && cleaned.replace(pattern, '').length > 10) {
      cleaned = cleaned.replace(pattern, '');
      break;
    }
  }

  return cleaned;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'agora';
  } else if (diffMinutes < 60) {
    return `há ${diffMinutes} min`;
  } else if (diffHours < 24) {
    return `há ${diffHours}h`;
  } else if (diffDays === 1) {
    return 'ontem';
  } else {
    return `há ${diffDays} dias`;
  }
}

type CategorizedNews = NewsArticle & {
  category:
    | 'taxas_juros'
    | 'inflacao'
    | 'investimentos'
    | 'economia'
    | 'custos_vida'
    | 'geral';
  potentialImpact: 'alto' | 'medio' | 'baixo';
};

function categorizeNews(articles: NewsArticle[]): CategorizedNews[] {
  return articles.map((article) => {
    const titleLower = article.title.toLowerCase();
    const summaryLower = (article.summary || '').toLowerCase();
    const text = titleLower + ' ' + summaryLower;

    let category: CategorizedNews['category'] = 'geral';
    let potentialImpact: CategorizedNews['potentialImpact'] = 'baixo';

    // Taxas de juros e Selic
    if (
      text.includes('selic') ||
      text.includes('taxa de juros') ||
      text.includes('copom')
    ) {
      category = 'taxas_juros';
      potentialImpact = 'alto';
    }
    // Inflação
    else if (
      text.includes('inflação') ||
      text.includes('ipca') ||
      text.includes('igpm')
    ) {
      category = 'inflacao';
      potentialImpact = 'alto';
    }
    // Investimentos
    else if (
      text.includes('ibovespa') ||
      text.includes('bolsa') ||
      text.includes('ações') ||
      text.includes('bitcoin') ||
      text.includes('tesouro') ||
      text.includes('cdb') ||
      text.includes('poupança')
    ) {
      category = 'investimentos';
      potentialImpact = 'medio';
    }
    // Custos de vida
    else if (
      text.includes('gasolina') ||
      text.includes('energia') ||
      text.includes('aluguel') ||
      text.includes('combustível') ||
      text.includes('conta de luz') ||
      text.includes('gás')
    ) {
      category = 'custos_vida';
      potentialImpact = 'alto';
    }
    // Economia geral
    else if (
      text.includes('dólar') ||
      text.includes('pib') ||
      text.includes('emprego') ||
      text.includes('salário')
    ) {
      category = 'economia';
      potentialImpact = 'medio';
    }

    return {
      ...article,
      category,
      potentialImpact,
    };
  });
}

/**
 * Busca indicadores de mercado (bolsas, crypto, ações) do cache
 */
export async function getMarketIndicators(
  _params: Record<string, unknown>,
  context: ToolContext
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Buscar dados do cache no Supabase
    const { data: cacheData, error } = await context.supabase
      .from('market_data_cache')
      .select('data, cached_at')
      .eq('id', 'market_indicators')
      .single();

    if (error || !cacheData) {
      return {
        success: true,
        data: {
          indicators: [],
          message:
            'Dados de mercado não disponíveis no momento. Tente novamente mais tarde.',
        },
      };
    }

    const indicators: MarketIndicator[] = (cacheData.data || []).map(
      (item: any) => ({
        symbol: item.symbol,
        displaySymbol: item.displaySymbol,
        name: item.name,
        price: item.price,
        change: item.change,
        changePercent: item.changePercent,
        trend:
          item.changePercent > 0.5
            ? 'up'
            : item.changePercent < -0.5
              ? 'down'
              : 'stable',
      })
    );

    // Separar por tipo
    const indices = indicators.filter((i) =>
      ['S&P 500', 'NASDAQ', 'DOW', 'IBOV'].includes(i.displaySymbol)
    );
    const stocks = indicators.filter((i) =>
      ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA'].includes(
        i.displaySymbol
      )
    );
    const crypto = indicators.filter((i) =>
      ['BTC', 'ETH'].includes(i.displaySymbol)
    );

    // Gerar resumo do mercado
    const marketSummary = generateMarketSummary(indices, crypto);

    const cacheAge = Math.floor(
      (Date.now() - new Date(cacheData.cached_at).getTime()) / 1000
    );

    return {
      success: true,
      data: {
        summary: marketSummary,
        indices,
        stocks,
        crypto,
        updatedAt: cacheData.cached_at,
        cacheAgeSeconds: cacheAge,
        tip: 'Use esses dados para contextualizar conversas sobre investimentos e economia.',
      },
    };
  } catch (error) {
    console.error('[getMarketIndicators] Error:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao buscar indicadores de mercado',
    };
  }
}

function generateMarketSummary(
  indices: MarketIndicator[],
  crypto: MarketIndicator[]
): string {
  const parts: string[] = [];

  // Resumo dos índices
  const sp500 = indices.find((i) => i.displaySymbol === 'S&P 500');
  const ibov = indices.find((i) => i.displaySymbol === 'IBOV');
  const btc = crypto.find((i) => i.displaySymbol === 'BTC');

  if (sp500) {
    const trend = sp500.changePercent >= 0 ? 'alta' : 'queda';
    parts.push(
      `S&P 500 em ${trend} de ${Math.abs(sp500.changePercent).toFixed(2)}%`
    );
  }

  if (ibov) {
    const trend = ibov.changePercent >= 0 ? 'alta' : 'queda';
    parts.push(
      `Brasil (EWZ) em ${trend} de ${Math.abs(ibov.changePercent).toFixed(2)}%`
    );
  }

  if (btc) {
    const trend = btc.changePercent >= 0 ? 'alta' : 'queda';
    parts.push(
      `Bitcoin em ${trend} de ${Math.abs(btc.changePercent).toFixed(2)}%`
    );
  }

  if (parts.length === 0) {
    return 'Dados de mercado indisponíveis no momento.';
  }

  return parts.join('. ') + '.';
}
