import { useState, useEffect, useCallback, useRef } from 'react';
import { getFinanceNews } from '@/lib/news-service';
import type { FeedItem } from '@/types/feed';

const REFRESH_INTERVAL = 300000; // 5 minutos para notícias
const PAGE_SIZE = 50;

export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Usar REF para page - não causa re-render nem recria callbacks
  const pageRef = useRef(1);

  // Fetch inicial ou refresh - sempre página 1
  const fetchFeed = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      console.log('[useFeed] Fetching news (page 1)...');
      const news = await getFinanceNews(1);
      console.log(`[useFeed] Received ${news.length} news items (page 1)`);

      const feedItems: FeedItem[] = news.map((newsItem, index) => ({
        id: newsItem.id,
        type: 'news',
        data: newsItem,
        timestamp: newsItem.publishedAt,
        priority: 10 - index * 0.1,
      }));

      setItems(feedItems);
      pageRef.current = 1; // Reset page
      setHasMore(news.length >= PAGE_SIZE);
      setError(null);
      console.log('[useFeed] Feed updated successfully');
    } catch (err) {
      setError('Erro ao carregar notícias');
      console.error('[useFeed] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // SEM dependências - função estável

  // Carregar mais itens (infinite scroll)
  const fetchMore = useCallback(async () => {
    if (loadingMore || refreshing || !hasMore) {
      console.log('[useFeed] Skipping fetchMore:', {
        loadingMore,
        refreshing,
        hasMore,
      });
      return;
    }

    setLoadingMore(true);

    try {
      const nextPage = pageRef.current + 1;
      console.log(`[useFeed] Fetching more news (page ${nextPage})...`);

      const news = await getFinanceNews(nextPage);
      console.log(
        `[useFeed] Received ${news.length} news items (page ${nextPage})`
      );

      if (news.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      const moreFeedItems: FeedItem[] = news.map((newsItem, index) => ({
        id: newsItem.id,
        type: 'news',
        data: newsItem,
        timestamp: newsItem.publishedAt,
        priority: 10 - (nextPage * PAGE_SIZE + index) * 0.1,
      }));

      // Adiciona ao final, filtrando duplicatas
      setItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const newItems = moreFeedItems.filter(
          (item) => !existingIds.has(item.id)
        );
        console.log(`[useFeed] Adding ${newItems.length} new items`);
        return [...prev, ...newItems];
      });

      pageRef.current = nextPage;
      setHasMore(news.length >= PAGE_SIZE);
      setError(null);
    } catch (err) {
      // Se for erro de limite da API, apenas para de carregar mais
      const errorMsg = String(err);
      if (
        errorMsg.includes('maximumResultsReached') ||
        errorMsg.includes('426')
      ) {
        console.log('[useFeed] API limit reached, stopping pagination');
        setHasMore(false);
      } else {
        setError('Erro ao carregar mais notícias');
        console.error('[useFeed] Error loading more:', err);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, refreshing, hasMore]);

  // Load inicial - roda UMA vez
  useEffect(() => {
    fetchFeed();
  }, []); // Array vazio = só no mount

  // Refresh automático a cada 5 minutos
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[useFeed] Auto-refreshing...');
      fetchFeed(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []); // Array vazio = só no mount

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh: () => fetchFeed(true),
    loadMore: fetchMore,
  };
}
