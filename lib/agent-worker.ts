import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Dynamic imports for native modules (may not be available in Expo Go)
let BackgroundFetch: typeof import('expo-background-fetch') | null = null;
let TaskManager: typeof import('expo-task-manager') | null = null;
let Notifications: typeof import('expo-notifications') | null = null;

// Track if native modules are available
let nativeModulesAvailable = false;

// Try to import native modules
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  BackgroundFetch = require('expo-background-fetch');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  TaskManager = require('expo-task-manager');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  nativeModulesAvailable = true;
  console.log('[agent-worker] Native modules loaded successfully');
} catch (error) {
  console.log('[agent-worker] Native modules not available (Expo Go mode)');
  nativeModulesAvailable = false;
}

export const AGENT_BACKGROUND_TASK = 'WALTS_AGENT_PROACTIVE_CHECK';
export const ACTION_CARDS_STORAGE_KEY = 'walts_action_cards';

export type ActionCardAction = {
  label: string;
  action: 'navigate' | 'sync_open_finance' | 'call_tool';
  target?: string;
  params?: Record<string, unknown>;
};

export type ActionCard = {
  id: string;
  type:
    | 'budget_alert'
    | 'anomaly'
    | 'sync_suggestion'
    | 'insight'
    | 'goal_progress';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  actions: ActionCardAction[];
  dismissible: boolean;
  createdAt: string;
  expiresAt?: string;
};

type ProactiveCheckResponse = {
  actions: ActionCard[];
  alerts?: Array<{
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }>;
};

// Configure notification handler (only if available)
if (nativeModulesAvailable && Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Define the background task (only if TaskManager available)
if (nativeModulesAvailable && TaskManager && BackgroundFetch) {
  TaskManager.defineTask(AGENT_BACKGROUND_TASK, async () => {
    try {
      console.log('[agent-worker] Background task started');

      // Check if user is authenticated
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        console.log('[agent-worker] No session, skipping');
        return BackgroundFetch!.BackgroundFetchResult.NoData;
      }

      // Call proactive check edge function
      const { data, error } =
        await supabase.functions.invoke<ProactiveCheckResponse>(
          'walts-proactive-check'
        );

      if (error) {
        console.error('[agent-worker] Error calling proactive check:', error);
        return BackgroundFetch!.BackgroundFetchResult.Failed;
      }

      if (!data) {
        console.log('[agent-worker] No data from proactive check');
        return BackgroundFetch!.BackgroundFetchResult.NoData;
      }

      // Save action cards to AsyncStorage
      if (data.actions && data.actions.length > 0) {
        // Get existing cards
        const existingCardsJson = await AsyncStorage.getItem(
          ACTION_CARDS_STORAGE_KEY
        );
        const existingCards: ActionCard[] = existingCardsJson
          ? JSON.parse(existingCardsJson)
          : [];

        // Merge new cards (avoid duplicates by id)
        const existingIds = new Set(existingCards.map((c) => c.id));
        const newCards = data.actions.filter((c) => !existingIds.has(c.id));

        // Remove expired cards
        const now = new Date().toISOString();
        const validCards = [...existingCards, ...newCards].filter(
          (c) => !c.expiresAt || c.expiresAt > now
        );

        // Keep max 10 cards
        const finalCards = validCards.slice(0, 10);

        await AsyncStorage.setItem(
          ACTION_CARDS_STORAGE_KEY,
          JSON.stringify(finalCards)
        );

        console.log('[agent-worker] Saved', finalCards.length, 'action cards');
      }

      // Send notifications if there are alerts
      if (data.alerts && data.alerts.length > 0) {
        for (const alert of data.alerts) {
          await sendNotification(alert.title, alert.body, alert.data);
        }
      }

      console.log('[agent-worker] Background task completed successfully');
      return BackgroundFetch!.BackgroundFetchResult.NewData;
    } catch (error) {
      console.error('[agent-worker] Background task error:', error);
      return BackgroundFetch!.BackgroundFetchResult.Failed;
    }
  });
}

async function sendNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (!nativeModulesAvailable || !Notifications) {
    console.log('[agent-worker] Notifications not available, skipping:', title);
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Send immediately
    });
    console.log('[agent-worker] Notification sent:', title);
  } catch (error) {
    console.error('[agent-worker] Error sending notification:', error);
  }
}

export async function registerAgentWorker(): Promise<boolean> {
  if (
    !nativeModulesAvailable ||
    !TaskManager ||
    !BackgroundFetch ||
    !Notifications
  ) {
    console.log(
      '[agent-worker] Native modules not available, skipping registration'
    );
    return false;
  }

  try {
    // Check if already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      AGENT_BACKGROUND_TASK
    );

    if (isRegistered) {
      console.log('[agent-worker] Task already registered');
      return true;
    }

    // Request notification permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('[agent-worker] Notification permission not granted');
    }

    // Register background fetch task
    await BackgroundFetch.registerTaskAsync(AGENT_BACKGROUND_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('[agent-worker] Background task registered successfully');
    return true;
  } catch (error) {
    console.error('[agent-worker] Error registering task:', error);
    return false;
  }
}

export async function unregisterAgentWorker(): Promise<void> {
  if (!nativeModulesAvailable || !TaskManager || !BackgroundFetch) {
    return;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      AGENT_BACKGROUND_TASK
    );

    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(AGENT_BACKGROUND_TASK);
      console.log('[agent-worker] Background task unregistered');
    }
  } catch (error) {
    console.error('[agent-worker] Error unregistering task:', error);
  }
}

export async function runProactiveCheckNow(): Promise<ActionCard[]> {
  try {
    console.log('[agent-worker] Running proactive check manually');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      console.log('[agent-worker] No session');
      return [];
    }

    const { data, error } =
      await supabase.functions.invoke<ProactiveCheckResponse>(
        'walts-proactive-check'
      );

    if (error) {
      console.error('[agent-worker] Error:', error);
      return [];
    }

    if (data?.actions) {
      // Save to storage
      const existingCardsJson = await AsyncStorage.getItem(
        ACTION_CARDS_STORAGE_KEY
      );
      const existingCards: ActionCard[] = existingCardsJson
        ? JSON.parse(existingCardsJson)
        : [];

      const existingIds = new Set(existingCards.map((c) => c.id));
      const newCards = data.actions.filter((c) => !existingIds.has(c.id));

      const now = new Date().toISOString();
      const validCards = [...existingCards, ...newCards].filter(
        (c) => !c.expiresAt || c.expiresAt > now
      );

      const finalCards = validCards.slice(0, 10);

      await AsyncStorage.setItem(
        ACTION_CARDS_STORAGE_KEY,
        JSON.stringify(finalCards)
      );

      return finalCards;
    }

    return [];
  } catch (error) {
    console.error('[agent-worker] Manual check error:', error);
    return [];
  }
}

export async function getStoredActionCards(): Promise<ActionCard[]> {
  try {
    const cardsJson = await AsyncStorage.getItem(ACTION_CARDS_STORAGE_KEY);
    if (!cardsJson) return [];

    const cards: ActionCard[] = JSON.parse(cardsJson);

    // Filter out expired cards
    const now = new Date().toISOString();
    return cards.filter((c) => !c.expiresAt || c.expiresAt > now);
  } catch (error) {
    console.error('[agent-worker] Error getting stored cards:', error);
    return [];
  }
}

export async function dismissActionCard(cardId: string): Promise<void> {
  try {
    const cardsJson = await AsyncStorage.getItem(ACTION_CARDS_STORAGE_KEY);
    if (!cardsJson) return;

    const cards: ActionCard[] = JSON.parse(cardsJson);
    const updatedCards = cards.filter((c) => c.id !== cardId);

    await AsyncStorage.setItem(
      ACTION_CARDS_STORAGE_KEY,
      JSON.stringify(updatedCards)
    );

    console.log('[agent-worker] Dismissed card:', cardId);
  } catch (error) {
    console.error('[agent-worker] Error dismissing card:', error);
  }
}
