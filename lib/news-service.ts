import type { NewsItem } from '@/types/feed';

// NewsAPI - requer chave gratuita (https://newsapi.org/)
const NEWS_API_KEY = '85147733ecf54ebab10d0a3bfe86a2ff';
const NEWS_API_BASE = 'https://newsapi.org/v2';

// Buscar notícias de finanças do Brasil via NewsAPI
export async function getFinanceNews(): Promise<NewsItem[]> {
  // Usar /everything para ter mais resultados
  // Buscar notícias em português sobre finanças/economia do Brasil
  const query = 'economia OR finanças OR "mercado financeiro" OR bolsa';
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromDate = weekAgo.toISOString().split('T')[0];

  const response = await fetch(
    `${NEWS_API_BASE}/everything?q=${encodeURIComponent(query)}&language=pt&sortBy=publishedAt&from=${fromDate}&pageSize=20&apiKey=${NEWS_API_KEY}`
  );

  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.articles || !Array.isArray(data.articles)) {
    throw new Error('Invalid response from NewsAPI');
  }

  return data.articles.slice(0, 20).map(
    (article: any): NewsItem => ({
      id: article.url || `news-${Date.now()}-${Math.random()}`,
      title: article.title || 'Sem título',
      summary: article.description || undefined,
      source: article.source?.name || 'Fonte desconhecida',
      url: article.url || '#',
      imageUrl: article.urlToImage || undefined,
      publishedAt: article.publishedAt
        ? new Date(article.publishedAt)
        : new Date(),
    })
  );
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
