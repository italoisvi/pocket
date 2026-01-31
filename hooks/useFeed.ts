import { useState, useEffect, useCallback } from 'react';
import { getFinanceNews } from '@/lib/news-service';
import type { FeedItem } from '@/types/feed';

const REFRESH_INTERVAL = 300000; // 5 minutos para notícias

export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      console.log('[useFeed] Fetching news...');
      const news = await getFinanceNews();
      console.log(`[useFeed] Received ${news.length} news items`);

      const feedItems: FeedItem[] = news.map((newsItem, index) => ({
        id: newsItem.id,
        type: 'news',
        data: newsItem,
        timestamp: newsItem.publishedAt,
        priority: 10 - index * 0.1,
      }));

      setItems(feedItems);
      setError(null);
      console.log('[useFeed] Feed updated successfully');
    } catch (err) {
      setError('Erro ao carregar notícias');
      console.error('[useFeed] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh automático
  useEffect(() => {
    fetchFeed();
    const interval = setInterval(() => fetchFeed(true), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  return {
    items,
    loading,
    refreshing,
    error,
    refresh: () => fetchFeed(true),
  };
}
