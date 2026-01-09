import { supabase } from './supabase';

export type WaltsMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
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
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const { data, error } = await supabase.functions.invoke('walts-agent', {
      body: { messages: formattedMessages },
    });

    if (error) {
      console.error('[walts-agent] Error:', error);
      throw new Error(error.message || 'Falha ao comunicar com o Walts Agent');
    }

    if (!data?.response) {
      throw new Error('Resposta inválida do Walts Agent');
    }

    console.log(
      '[walts-agent] Response received. Tool calls executed:',
      data.tool_calls_executed || 0
    );

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
