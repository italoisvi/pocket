/**
 * Walts Agent - Placeholder
 * O agente está sendo reconstruído do zero.
 */

export interface WaltsMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<{
    type: 'image' | 'audio';
    url: string;
  }>;
}

export interface WaltsResponse {
  message: string;
  action?: {
    type: string;
    data?: any;
  };
}

export async function sendMessageToWaltsAgent(
  messages: WaltsMessage[]
): Promise<WaltsResponse> {
  // Placeholder - retorna mensagem informando que está em manutenção
  return {
    message:
      'Oi! Estou passando por uma atualização e volto em breve com novidades. Por enquanto, você pode usar as outras funcionalidades do app normalmente.',
  };
}
