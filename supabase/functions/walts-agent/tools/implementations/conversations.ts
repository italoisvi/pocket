import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../../types.ts';

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
// list_conversations - Lista conversas anteriores
// ============================================================================

type ListConversationsParams = {
  limit?: number;
  search?: string;
};

export async function listConversations(
  params: ListConversationsParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const limit = Math.min(params.limit || 10, 50);

  try {
    let query = supabase
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (params.search) {
      query = query.ilike('title', `%${params.search}%`);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error('[conversations.listConversations] DB Error:', error);
      return { success: false, error: 'Erro ao buscar conversas' };
    }

    if (!conversations || conversations.length === 0) {
      return {
        success: true,
        data: {
          conversations: [],
          message: 'Nenhuma conversa encontrada.',
        },
      };
    }

    const formattedConversations = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: new Date(c.created_at).toLocaleDateString('pt-BR'),
      updatedAt: new Date(c.updated_at).toLocaleDateString('pt-BR'),
      daysAgo: Math.floor((Date.now() - c.updated_at) / (1000 * 60 * 60 * 24)),
    }));

    return {
      success: true,
      data: {
        conversations: formattedConversations,
        total: formattedConversations.length,
      },
    };
  } catch (error) {
    console.error('[conversations.listConversations] Error:', error);
    return { success: false, error: 'Erro ao buscar conversas' };
  }
}

// ============================================================================
// get_conversation - Busca conversa especifica
// ============================================================================

type GetConversationParams = {
  conversation_id: string;
  include_messages?: boolean;
};

export async function getConversation(
  params: GetConversationParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', params.conversation_id)
      .eq('user_id', userId)
      .single();

    if (error || !conversation) {
      return {
        success: false,
        error: 'Conversa nao encontrada',
      };
    }

    const result: Record<string, unknown> = {
      id: conversation.id,
      title: conversation.title,
      createdAt: new Date(conversation.created_at).toLocaleDateString('pt-BR'),
      updatedAt: new Date(conversation.updated_at).toLocaleDateString('pt-BR'),
    };

    if (params.include_messages) {
      const messages = conversation.messages || [];
      result.messageCount = messages.length;
      result.messages = messages
        .slice(-10)
        .map((m: { role: string; content: string }) => ({
          role: m.role,
          content:
            m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
        }));
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('[conversations.getConversation] Error:', error);
    return { success: false, error: 'Erro ao buscar conversa' };
  }
}

// ============================================================================
// update_conversation_title - Renomear conversa
// ============================================================================

type UpdateConversationTitleParams = {
  conversation_id: string;
  title: string;
};

export async function updateConversationTitle(
  params: UpdateConversationTitleParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('id, title')
      .eq('id', params.conversation_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: 'Conversa nao encontrada',
      };
    }

    const { error } = await supabase
      .from('conversations')
      .update({
        title: params.title,
        updated_at: Date.now(),
      })
      .eq('id', params.conversation_id);

    if (error) {
      console.error('[conversations.updateConversationTitle] DB Error:', error);
      return {
        success: false,
        error: `Erro ao renomear conversa: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        conversation_id: params.conversation_id,
        old_title: existing.title,
        new_title: params.title,
        message: `Conversa renomeada de "${existing.title}" para "${params.title}"`,
      },
    };
  } catch (error) {
    console.error('[conversations.updateConversationTitle] Error:', error);
    return { success: false, error: 'Erro ao renomear conversa' };
  }
}

// ============================================================================
// delete_conversation - Deletar conversa
// ============================================================================

type DeleteConversationParams = {
  conversation_id: string;
};

export async function deleteConversation(
  params: DeleteConversationParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Verify ownership and get details
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('id, title')
      .eq('id', params.conversation_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: 'Conversa nao encontrada',
      };
    }

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', params.conversation_id);

    if (error) {
      console.error('[conversations.deleteConversation] DB Error:', error);
      return {
        success: false,
        error: `Erro ao deletar conversa: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        deleted_conversation_id: existing.id,
        title: existing.title,
        message: `Conversa "${existing.title}" removida com sucesso`,
      },
    };
  } catch (error) {
    console.error('[conversations.deleteConversation] Error:', error);
    return { success: false, error: 'Erro ao deletar conversa' };
  }
}
