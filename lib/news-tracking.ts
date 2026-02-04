import { supabase } from './supabase';

export type InteractionType =
  | 'view'
  | 'click'
  | 'read_complete'
  | 'share'
  | 'save';

export type TrackNewsInteractionParams = {
  articleUrl: string;
  articleTitle?: string;
  articleSource?: string;
  articleTopic?: string;
  interactionType: InteractionType;
  timeSpentSeconds?: number;
  scrollDepthPercent?: number;
};

/**
 * Rastreia uma interação do usuário com uma notícia
 * @param params Parâmetros da interação
 * @returns Promise com o resultado do tracking
 */
export async function trackNewsInteraction(
  params: TrackNewsInteractionParams
): Promise<{ success: boolean; detectedTopic?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'track-news-interaction',
      {
        body: params,
      }
    );

    if (error) {
      console.error('[news-tracking] Error tracking interaction:', error);
      return { success: false };
    }

    return {
      success: true,
      detectedTopic: data?.detectedTopic,
    };
  } catch (error) {
    console.error('[news-tracking] Error:', error);
    return { success: false };
  }
}

/**
 * Rastreia um clique em uma notícia
 */
export function trackNewsClick(
  articleUrl: string,
  articleTitle?: string,
  articleSource?: string
) {
  // Fire and forget - não bloquear a UI
  trackNewsInteraction({
    articleUrl,
    articleTitle,
    articleSource,
    interactionType: 'click',
  }).catch(() => {
    // Silently ignore tracking errors
  });
}

/**
 * Rastreia visualização completa de uma notícia
 */
export function trackNewsReadComplete(
  articleUrl: string,
  articleTitle?: string,
  articleSource?: string,
  timeSpentSeconds?: number,
  scrollDepthPercent?: number
) {
  trackNewsInteraction({
    articleUrl,
    articleTitle,
    articleSource,
    interactionType: 'read_complete',
    timeSpentSeconds,
    scrollDepthPercent,
  }).catch(() => {
    // Silently ignore tracking errors
  });
}

/**
 * Busca as preferências de conteúdo do usuário
 * @returns Array de tópicos ordenados por score
 */
export async function getUserContentPreferences(): Promise<
  Array<{
    topic: string;
    score: number;
    interactionCount: number;
  }>
> {
  try {
    const { data, error } = await supabase
      .from('user_content_preferences')
      .select('topic, score, interaction_count')
      .order('score', { ascending: false });

    if (error) {
      console.error(
        '[news-tracking] Error fetching content preferences:',
        error
      );
      return [];
    }

    return (data || []).map((row: any) => ({
      topic: row.topic,
      score: row.score,
      interactionCount: row.interaction_count,
    }));
  } catch (error) {
    console.error('[news-tracking] Error:', error);
    return [];
  }
}

/**
 * Obtém os tópicos de interesse do usuário (score > 0.5)
 * @returns Array de tópicos de interesse
 */
export async function getUserInterestTopics(): Promise<string[]> {
  const preferences = await getUserContentPreferences();
  return preferences.filter((p) => p.score > 0.5).map((p) => p.topic);
}
