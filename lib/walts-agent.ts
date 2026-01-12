import { supabase } from './supabase';
import type { MessageAttachment } from './chat-attachments';

export type WaltsMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
};

/**
 * Envia mensagens para o Walts Agent (com function calling)
 * Diferente do sendMessageToDeepSeek, este usa o agente que pode executar ações
 */
export async function sendMessageToWaltsAgent(
  messages: WaltsMessage[]
): Promise<string> {
  try {
    console.log('[walts-agent] Sending messages to agent...');

    // Formatar mensagens para o formato que a Edge Function espera
    // Incluir attachments para processamento de áudio/imagem
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      attachments: msg.attachments,
    }));

    // Log para debug
    const lastMessage = formattedMessages[formattedMessages.length - 1];
    console.log('[walts-agent] Last message:', {
      role: lastMessage?.role,
      contentLength: lastMessage?.content?.length || 0,
      hasAttachments: !!lastMessage?.attachments,
      attachmentsCount: lastMessage?.attachments?.length || 0,
      attachmentTypes: lastMessage?.attachments?.map((a: any) => a.type) || [],
    });

    const { data, error } = await supabase.functions.invoke('walts-agent', {
      body: { messages: formattedMessages },
    });

    if (error) {
      console.error('[walts-agent] Error:', error);
      throw new Error(error.message || 'Falha ao comunicar com o Walts Agent');
    }

    if (!data?.response) {
      console.error('[walts-agent] Invalid response data:', data);
      throw new Error('Resposta inválida do Walts Agent');
    }

    // Log detalhado para diagnóstico
    console.log('[walts-agent] Response received:', {
      toolCallsExecuted: data.tool_calls_executed || 0,
      hasError: !!data.error,
      error: data.error,
      toolsCalled: data.toolsCalled,
      responseLength: data.response?.length || 0,
    });

    return data.response;
  } catch (error) {
    console.error('[walts-agent] Exception:', error);
    throw error;
  }
}

/**
 * Verifica se o Walts Agent está disponível
 */
export async function isWaltsAgentAvailable(): Promise<boolean> {
  try {
    // Fazer uma chamada simples para testar
    const testMessages: WaltsMessage[] = [
      {
        id: 'test',
        role: 'user',
        content: 'Olá',
        timestamp: Date.now(),
      },
    ];

    await sendMessageToWaltsAgent(testMessages);
    return true;
  } catch (error) {
    console.error('[walts-agent] Agent not available:', error);
    return false;
  }
}
