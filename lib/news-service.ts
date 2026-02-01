import type { NewsItem } from '@/types/feed';

// NewsAPI - requer chave gratuita (https://newsapi.org/)
const NEWS_API_KEY = '85147733ecf54ebab10d0a3bfe86a2ff';
const NEWS_API_BASE = 'https://newsapi.org/v2';

// Buscar notícias de finanças do Brasil via NewsAPI
// Suporta paginação via parâmetro page (página atual)
export async function getFinanceNews(page: number = 1): Promise<NewsItem[]> {
  // Buscar notícias em português focadas em finanças/economia/mercado
  const query =
    '(Ibovespa OR Selic OR "taxa de juros" OR "mercado financeiro" OR "bolsa de valores" OR "Wall Street" OR "Faria Lima" OR "banco central" OR "ações" OR "investimento" OR "dólar" OR "inflação" OR Bitcoin OR "renda fixa" OR "fundos imobiliários" OR B3 OR Nasdaq OR "S&P 500" OR "Dow Jones" OR Nikkei OR FTSE OR DAX OR "Hang Seng" OR NYSE OR Bovespa OR commodities OR petróleo OR ouro OR "Vale do Silício" OR "Silicon Valley")';
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromDate = weekAgo.toISOString().split('T')[0];

  // Tamanho de página padrão (maior para compensar artigos filtrados)
  const PAGE_SIZE = 50;

  const response = await fetch(
    `${NEWS_API_BASE}/everything?q=${encodeURIComponent(query)}&language=pt&sortBy=publishedAt&from=${fromDate}&pageSize=${PAGE_SIZE}&page=${page}&apiKey=${NEWS_API_KEY}`
  );

  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.articles || !Array.isArray(data.articles)) {
    throw new Error('Invalid response from NewsAPI');
  }

  // Filtrar e mapear artigos válidos
  const articles = data.articles
    .filter((article: any) => {
      // Filtrar artigos com título inválido
      const title = article.title || '';

      // NewsAPI retorna "[Removed]" quando o conteúdo foi removido
      if (title === '[Removed]' || title.toLowerCase() === '[removed]') {
        return false;
      }

      // Filtrar títulos vazios ou muito curtos
      if (title.trim().length < 5) {
        return false;
      }

      // Filtrar artigos sem URL válida
      if (!article.url || article.url === '[Removed]') {
        return false;
      }

      // Filtrar descrições removidas também (opcional, mas melhora qualidade)
      const description = article.description || '';
      if (description === '[Removed]') {
        return false;
      }

      return true;
    })
    .map(
      (article: any): NewsItem => ({
        id: article.url || `news-${Date.now()}-${Math.random()}`,
        title: cleanTitle(article.title),
        summary: cleanSummary(article.description),
        source: article.source?.name || 'Fonte desconhecida',
        url: article.url || '#',
        imageUrl: article.urlToImage || undefined,
        publishedAt: article.publishedAt
          ? new Date(article.publishedAt)
          : new Date(),
      })
    );

  // Intercala notícias para evitar sequências da mesma fonte
  return interleaveBySource(articles);
}

// Limpa o título removendo sufixos comuns de fonte
function cleanTitle(title: string | null | undefined): string {
  if (!title || title.trim().length === 0) {
    return 'Sem título';
  }

  let cleaned = title.trim();

  // Remove sufixos comuns tipo " - Fonte" ou " | Fonte"
  // Exemplo: "Título da notícia - UOL Economia" -> "Título da notícia"
  const suffixPatterns = [
    / - [A-Za-zÀ-ú\s]+$/, // " - Nome da Fonte"
    / \| [A-Za-zÀ-ú\s]+$/, // " | Nome da Fonte"
    / – [A-Za-zÀ-ú\s]+$/, // " – Nome da Fonte" (en-dash)
  ];

  for (const pattern of suffixPatterns) {
    if (pattern.test(cleaned) && cleaned.replace(pattern, '').length > 10) {
      cleaned = cleaned.replace(pattern, '');
      break;
    }
  }

  return cleaned;
}

// Limpa o resumo
function cleanSummary(
  description: string | null | undefined
): string | undefined {
  if (!description || description.trim().length === 0) {
    return undefined;
  }

  const cleaned = description.trim();

  // Se for muito curto, não vale mostrar
  if (cleaned.length < 20) {
    return undefined;
  }

  return cleaned;
}

// Intercala notícias de diferentes fontes para evitar sequências da mesma fonte
function interleaveBySource(news: NewsItem[]): NewsItem[] {
  if (news.length <= 1) return news;

  // Agrupa por fonte
  const bySource = new Map<string, NewsItem[]>();
  for (const item of news) {
    const list = bySource.get(item.source) || [];
    list.push(item);
    bySource.set(item.source, list);
  }

  // Intercala usando round-robin
  const result: NewsItem[] = [];
  const sources = Array.from(bySource.keys());
  let lastSource = '';

  while (result.length < news.length) {
    // Encontra próxima fonte diferente da última
    let added = false;
    for (const source of sources) {
      if (source !== lastSource) {
        const list = bySource.get(source);
        if (list && list.length > 0) {
          result.push(list.shift()!);
          lastSource = source;
          added = true;
          break;
        }
      }
    }

    // Se não conseguiu (só sobrou uma fonte), adiciona dela mesmo
    if (!added) {
      for (const source of sources) {
        const list = bySource.get(source);
        if (list && list.length > 0) {
          result.push(list.shift()!);
          lastSource = source;
          break;
        }
      }
    }
  }

  return result;
}

// Função auxiliar para calcular "há X horas/minutos"
export function getTimeAgo(date: Date): string {
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
