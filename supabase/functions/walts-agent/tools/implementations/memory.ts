import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../../types.ts';

// ============================================================================
// Types
// ============================================================================

type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

type ToolContext = {
  userId: UserId;
  supabase: SupabaseClient;
};

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Busca memórias relevantes do usuário.
 *
 * Nota: Esta é uma implementação simplificada usando busca textual.
 * Na Fase 2, será substituída por busca vetorial com pgvector.
 */
export async function searchMemory(
  params: { query: string; limit?: number },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const limit = Math.min(params.limit || 5, 10);

  try {
    const searchTerms = params.query
      .toLowerCase()
      .split(' ')
      .filter((term) => term.length > 2);

    const { data: memories, error } = await supabase
      .from('walts_memory')
      .select('id, memory_type, key, value, created_at, use_count')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[memory.searchMemory] DB Error:', error);
      return { success: false, error: 'Erro ao buscar memórias' };
    }

    if (!memories || memories.length === 0) {
      return {
        success: true,
        data: {
          memories: [],
          message: 'Nenhuma memória encontrada para sua busca.',
        },
      };
    }

    const scoredMemories = memories
      .map((m: any) => {
        const content = `${m.key} ${JSON.stringify(m.value)}`.toLowerCase();
        let score = 0;

        for (const term of searchTerms) {
          if (content.includes(term)) {
            score += 1;
          }
        }

        if (m.memory_type === 'preference') score += 0.5;

        return { ...m, relevanceScore: score };
      })
      .filter((m: any) => m.relevanceScore > 0)
      .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    if (scoredMemories.length > 0) {
      const memoryIds = scoredMemories.map((m: any) => m.id);
      await supabase
        .from('walts_memory')
        .update({
          use_count: supabase.rpc('increment_use_count'),
          last_used_at: new Date().toISOString(),
        })
        .in('id', memoryIds);
    }

    return {
      success: true,
      data: {
        memories: scoredMemories.map((m: any) => ({
          type: m.memory_type,
          key: m.key,
          value: m.value,
          createdAt: m.created_at,
          relevance: m.relevanceScore,
        })),
        query: params.query,
        totalFound: scoredMemories.length,
      },
    };
  } catch (error) {
    console.error('[memory.searchMemory] Error:', error);
    return {
      success: false,
      error: 'Erro ao buscar memórias',
    };
  }
}

/**
 * Salva uma preferência ou informação do usuário.
 */
export async function saveUserPreference(
  params: { key: string; value: string; confidence?: number },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const normalizedKey = params.key
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    if (!normalizedKey) {
      return { success: false, error: 'Chave inválida' };
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(params.value);
    } catch {
      parsedValue = params.value;
    }

    const confidence = Math.min(Math.max(params.confidence || 1.0, 0), 1);

    const { data: existing } = await supabase
      .from('walts_memory')
      .select('id')
      .eq('user_id', userId)
      .eq('memory_type', 'preference')
      .eq('key', normalizedKey)
      .single();

    let result;

    if (existing) {
      result = await supabase
        .from('walts_memory')
        .update({
          value: parsedValue,
          confidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id, key, value')
        .single();
    } else {
      result = await supabase
        .from('walts_memory')
        .insert({
          user_id: userId,
          memory_type: 'preference',
          key: normalizedKey,
          value: parsedValue,
          confidence,
          source: 'agent_conversation',
        })
        .select('id, key, value')
        .single();
    }

    if (result.error) {
      console.error('[memory.saveUserPreference] DB Error:', result.error);
      return {
        success: false,
        error: `Erro ao salvar preferência: ${result.error.message}`,
      };
    }

    return {
      success: true,
      data: {
        preference_id: result.data.id,
        key: result.data.key,
        value: result.data.value,
        confidence,
        action: existing ? 'updated' : 'created',
        message: `Preferência "${normalizedKey}" ${existing ? 'atualizada' : 'salva'} com sucesso!`,
      },
    };
  } catch (error) {
    console.error('[memory.saveUserPreference] Error:', error);
    return {
      success: false,
      error: 'Erro ao salvar preferência',
    };
  }
}

/**
 * Salva o resumo de uma conversa na memória (para referência futura).
 */
export async function saveConversationMemory(
  summary: string,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const { data, error } = await supabase
      .from('walts_memory')
      .insert({
        user_id: userId,
        memory_type: 'context',
        key: `conversation_${Date.now()}`,
        value: { summary, timestamp: new Date().toISOString() },
        confidence: 0.8,
        source: 'conversation_summary',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[memory.saveConversationMemory] DB Error:', error);
      return { success: false, error: 'Erro ao salvar conversa na memória' };
    }

    return {
      success: true,
      data: { memory_id: data.id },
    };
  } catch (error) {
    console.error('[memory.saveConversationMemory] Error:', error);
    return { success: false, error: 'Erro ao salvar conversa na memória' };
  }
}
