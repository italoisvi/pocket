import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

type InteractionType = 'view' | 'click' | 'read_complete' | 'share' | 'save';

interface TrackInteractionRequest {
  articleUrl: string;
  articleTitle?: string;
  articleSource?: string;
  articleTopic?: string;
  interactionType: InteractionType;
  timeSpentSeconds?: number;
  scrollDepthPercent?: number;
}

serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers,
      });
    }

    // Ler body
    const body: TrackInteractionRequest = await req.json();

    const {
      articleUrl,
      articleTitle,
      articleSource,
      articleTopic,
      interactionType,
      timeSpentSeconds = 0,
      scrollDepthPercent = 0,
    } = body;

    if (!articleUrl || !interactionType) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: articleUrl and interactionType',
        }),
        { status: 400, headers }
      );
    }

    // Validar interactionType
    const validTypes: InteractionType[] = [
      'view',
      'click',
      'read_complete',
      'share',
      'save',
    ];
    if (!validTypes.includes(interactionType)) {
      return new Response(
        JSON.stringify({
          error: `Invalid interactionType. Must be one of: ${validTypes.join(', ')}`,
        }),
        { status: 400, headers }
      );
    }

    console.log(
      `[track-news-interaction] User ${user.id} - ${interactionType} - ${articleUrl}`
    );

    // Detectar tópico automaticamente se não fornecido
    let detectedTopic = articleTopic;
    if (!detectedTopic && articleTitle) {
      detectedTopic = detectTopicFromTitle(articleTitle);
    }

    // Inserir interação
    const { data: interaction, error: insertError } = await supabase
      .from('news_interactions')
      .insert({
        user_id: user.id,
        article_url: articleUrl,
        article_title: articleTitle,
        article_source: articleSource,
        article_topic: detectedTopic,
        interaction_type: interactionType,
        time_spent_seconds: timeSpentSeconds,
        scroll_depth_percent: Math.min(100, Math.max(0, scrollDepthPercent)),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(
        '[track-news-interaction] Failed to save interaction:',
        insertError
      );
      return new Response(
        JSON.stringify({ error: 'Failed to save interaction' }),
        { status: 500, headers }
      );
    }

    // Se for read_complete ou passou tempo significativo, atualizar preferências imediatamente
    if (
      interactionType === 'read_complete' ||
      (interactionType === 'click' && timeSpentSeconds > 30)
    ) {
      await updateContentPreferences(supabase, user.id, detectedTopic);
    }

    return new Response(
      JSON.stringify({
        success: true,
        interactionId: interaction.id,
        detectedTopic,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[track-news-interaction] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});

/**
 * Detecta o tópico da notícia baseado no título
 */
function detectTopicFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase();

  // Crypto / Bitcoin
  if (
    lowerTitle.includes('bitcoin') ||
    lowerTitle.includes('btc') ||
    lowerTitle.includes('ethereum') ||
    lowerTitle.includes('eth') ||
    lowerTitle.includes('cripto') ||
    lowerTitle.includes('crypto') ||
    lowerTitle.includes('blockchain')
  ) {
    return 'crypto';
  }

  // Ações / Bolsa
  if (
    lowerTitle.includes('ibovespa') ||
    lowerTitle.includes('b3') ||
    lowerTitle.includes('ações') ||
    lowerTitle.includes('acoes') ||
    lowerTitle.includes('bolsa') ||
    lowerTitle.includes('dividendo') ||
    lowerTitle.includes('fiis') ||
    lowerTitle.includes('fundo imobiliário')
  ) {
    return 'acoes';
  }

  // Economia / Indicadores
  if (
    lowerTitle.includes('selic') ||
    lowerTitle.includes('inflação') ||
    lowerTitle.includes('inflacao') ||
    lowerTitle.includes('ipca') ||
    lowerTitle.includes('pib') ||
    lowerTitle.includes('juros') ||
    lowerTitle.includes('copom') ||
    lowerTitle.includes('banco central')
  ) {
    return 'economia';
  }

  // Dólar / Câmbio
  if (
    lowerTitle.includes('dólar') ||
    lowerTitle.includes('dolar') ||
    lowerTitle.includes('câmbio') ||
    lowerTitle.includes('cambio') ||
    lowerTitle.includes('euro') ||
    lowerTitle.includes('moeda')
  ) {
    return 'cambio';
  }

  // Investimentos
  if (
    lowerTitle.includes('investimento') ||
    lowerTitle.includes('renda fixa') ||
    lowerTitle.includes('tesouro direto') ||
    lowerTitle.includes('cdb') ||
    lowerTitle.includes('lci') ||
    lowerTitle.includes('lca') ||
    lowerTitle.includes('poupança') ||
    lowerTitle.includes('poupanca')
  ) {
    return 'investimentos';
  }

  // Finanças pessoais
  if (
    lowerTitle.includes('orçamento') ||
    lowerTitle.includes('orcamento') ||
    lowerTitle.includes('dívida') ||
    lowerTitle.includes('divida') ||
    lowerTitle.includes('crédito') ||
    lowerTitle.includes('credito') ||
    lowerTitle.includes('financiamento') ||
    lowerTitle.includes('empréstimo') ||
    lowerTitle.includes('emprestimo')
  ) {
    return 'financas_pessoais';
  }

  // Empresas / Negócios
  if (
    lowerTitle.includes('petrobras') ||
    lowerTitle.includes('vale') ||
    lowerTitle.includes('itaú') ||
    lowerTitle.includes('itau') ||
    lowerTitle.includes('bradesco') ||
    lowerTitle.includes('nubank') ||
    lowerTitle.includes('empresa') ||
    lowerTitle.includes('lucro') ||
    lowerTitle.includes('receita')
  ) {
    return 'empresas';
  }

  // Política econômica
  if (
    lowerTitle.includes('governo') ||
    lowerTitle.includes('lula') ||
    lowerTitle.includes('haddad') ||
    lowerTitle.includes('ministro') ||
    lowerTitle.includes('reforma') ||
    lowerTitle.includes('fiscal')
  ) {
    return 'politica_economica';
  }

  // Default
  return 'mercado';
}

/**
 * Atualiza as preferências de conteúdo do usuário para um tópico específico
 */
async function updateContentPreferences(
  supabase: any,
  userId: string,
  topic: string | null | undefined
) {
  if (!topic) return;

  try {
    // Buscar todas as interações do usuário para este tópico nos últimos 30 dias
    const { data: interactions, error: fetchError } = await supabase
      .from('news_interactions')
      .select('time_spent_seconds, scroll_depth_percent')
      .eq('user_id', userId)
      .eq('article_topic', topic)
      .gte(
        'created_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );

    if (fetchError) {
      console.error(
        '[track-news-interaction] Error fetching interactions:',
        fetchError
      );
      return;
    }

    const interactionCount = interactions?.length || 0;
    if (interactionCount === 0) return;

    const avgTimeSpent =
      interactions.reduce(
        (sum: number, i: any) => sum + (i.time_spent_seconds || 0),
        0
      ) / interactionCount;
    const avgScrollDepth =
      interactions.reduce(
        (sum: number, i: any) => sum + (i.scroll_depth_percent || 0),
        0
      ) / interactionCount;

    // Calcular score baseado em engajamento
    // Formula: base(0.3) + interaction_weight(0.3) + time_weight(0.2) + scroll_weight(0.2)
    const score = Math.min(
      1.0,
      0.3 +
        (Math.min(interactionCount, 20) / 20) * 0.3 +
        (Math.min(avgTimeSpent, 300) / 300) * 0.2 +
        (avgScrollDepth / 100) * 0.2
    );

    // Upsert preferência
    const { error: upsertError } = await supabase
      .from('user_content_preferences')
      .upsert(
        {
          user_id: userId,
          topic,
          score,
          interaction_count: interactionCount,
          avg_time_spent_seconds: avgTimeSpent,
          avg_scroll_depth: avgScrollDepth,
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,topic',
        }
      );

    if (upsertError) {
      console.error(
        '[track-news-interaction] Error upserting preferences:',
        upsertError
      );
    } else {
      console.log(
        `[track-news-interaction] Updated preference for topic "${topic}": score=${score.toFixed(2)}`
      );
    }
  } catch (error) {
    console.error(
      '[track-news-interaction] Error updating preferences:',
      error
    );
  }
}
