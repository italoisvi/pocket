/**
 * Walts Agent Client
 * Cliente para comunicação com a Edge Function walts-agent
 */

import { supabase } from './supabase';
import type { MessageAttachment } from './chat-attachments';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
  sessionId?: string;
};

export type WaltsAgentResponse = {
  response: string;
  conversationId: string;
  thoughts?: Array<{
    tool: string;
    input: unknown;
    output: {
      success: boolean;
      data?: unknown;
      error?: string;
    };
    executionTimeMs: number;
  }>;
  toolsUsed?: string[];
};

export type AgentResult = {
  response: string;
  sessionId: string;
};

export type SendMessageOptions = {
  isVoiceMode?: boolean;
};

/**
 * Envia mensagem para o Walts Agent
 */
export async function sendMessageToWaltsAgent(
  messages: Message[],
  options?: SendMessageOptions
): Promise<AgentResult> {
  try {
    const session = await supabase.auth.getSession();

    if (!session.data.session?.access_token) {
      throw new Error('Usuário não autenticado');
    }

    const lastMessage = messages[messages.length - 1];

    // Construir histórico incluindo imagens das mensagens anteriores
    const history = messages.slice(0, -1).map((m) => {
      const historyItem: {
        role: 'user' | 'assistant';
        content: string;
        imageUrls?: string[];
      } = {
        role: m.role,
        content: m.content,
      };

      // Incluir imagens do histórico
      if (m.attachments && m.attachments.length > 0) {
        const images = m.attachments
          .filter((a) => a.type === 'image' && a.url)
          .map((a) => a.url!);
        if (images.length > 0) {
          historyItem.imageUrls = images;
        }
      }

      return historyItem;
    });

    // Extract media URLs from current message attachments
    const imageUrls: string[] = [];
    const audioUrls: string[] = [];
    if (lastMessage.attachments) {
      for (const attachment of lastMessage.attachments) {
        if (attachment.type === 'image' && attachment.url) {
          imageUrls.push(attachment.url);
        } else if (attachment.type === 'audio' && attachment.url) {
          audioUrls.push(attachment.url);
        }
      }
    }

    // Contar imagens no histórico
    const historyImageCount = history.reduce(
      (count, h) => count + (h.imageUrls?.length || 0),
      0
    );

    console.log('[walts-agent-client] Sending message:', {
      messageLength: lastMessage.content.length,
      historyLength: history.length,
      historyImageCount,
      currentImageCount: imageUrls.length,
      audioCount: audioUrls.length,
    });

    const { data, error } = await supabase.functions.invoke<WaltsAgentResponse>(
      'walts-agent',
      {
        body: {
          message: lastMessage.content,
          history,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          audioUrls: audioUrls.length > 0 ? audioUrls : undefined,
          isVoiceMode: options?.isVoiceMode ?? false,
        },
      }
    );

    if (error) {
      console.error('[walts-agent-client] Error:', error);
      throw new Error(error.message || 'Erro ao comunicar com o assistente');
    }

    if (!data?.response) {
      throw new Error('Resposta inválida do assistente');
    }

    console.log('[walts-agent-client] Response received:', {
      responseLength: data.response.length,
      toolsUsed: data.toolsUsed || [],
      sessionId: data.conversationId,
    });

    return {
      response: data.response,
      sessionId: data.conversationId,
    };
  } catch (error) {
    console.error('[walts-agent-client] Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('não autenticado')) {
        throw error;
      }
      if (error.message.includes('API key')) {
        throw new Error(
          'O assistente está temporariamente indisponível. Tente novamente mais tarde.'
        );
      }
    }

    throw new Error(
      'Não foi possível conectar ao assistente. Verifique sua conexão e tente novamente.'
    );
  }
}
