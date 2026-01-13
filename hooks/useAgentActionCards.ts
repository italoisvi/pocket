import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import {
  getStoredActionCards,
  dismissActionCard,
  runProactiveCheckNow,
  type ActionCard,
  type ActionCardAction,
} from '@/lib/agent-worker';
import { supabase } from '@/lib/supabase';

export function useAgentActionCards() {
  const [actionCards, setActionCards] = useState<ActionCard[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCards = useCallback(async () => {
    try {
      const cards = await getStoredActionCards();
      setActionCards(cards);
    } catch (error) {
      console.error('[useAgentActionCards] Error loading cards:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCards = useCallback(async () => {
    setLoading(true);
    try {
      const cards = await runProactiveCheckNow();
      setActionCards(cards);
    } catch (error) {
      console.error('[useAgentActionCards] Error refreshing cards:', error);
      // Fall back to stored cards
      const storedCards = await getStoredActionCards();
      setActionCards(storedCards);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDismiss = useCallback(async (cardId: string) => {
    try {
      await dismissActionCard(cardId);
      setActionCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (error) {
      console.error('[useAgentActionCards] Error dismissing card:', error);
    }
  }, []);

  const handleAction = useCallback(async (action: ActionCardAction) => {
    try {
      switch (action.action) {
        case 'navigate':
          if (action.target) {
            router.push(action.target as any);
          }
          break;

        case 'sync_open_finance':
          // Trigger Open Finance sync
          const { error } = await supabase.functions.invoke(
            'pluggy-sync-cron',
            {
              body: action.params || {},
            }
          );
          if (error) {
            console.error('[useAgentActionCards] Sync error:', error);
          }
          break;

        case 'call_tool':
          // Navigate to chat to interact with Walts
          router.push('/(tabs)/chat');
          break;

        default:
          console.log('[useAgentActionCards] Unknown action:', action);
      }
    } catch (error) {
      console.error('[useAgentActionCards] Action error:', error);
    }
  }, []);

  // Load cards on mount
  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Refresh when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        loadCards();
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [loadCards]);

  return {
    actionCards,
    loading,
    refreshCards,
    dismissCard: handleDismiss,
    executeAction: handleAction,
  };
}
