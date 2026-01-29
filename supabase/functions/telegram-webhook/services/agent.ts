import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  UserId,
  TelegramAccountRow,
  ConversationMessage,
} from '../types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_CONVERSATION_MESSAGES = 50;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function callWaltsAgent(
  userId: UserId,
  message: string,
  imageUrls?: string[],
  audioUrls?: string[]
): Promise<string> {
  const waltsAgentUrl = `${SUPABASE_URL}/functions/v1/walts-agent`;

  const response = await fetch(waltsAgentUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'X-User-Id': userId,
    },
    body: JSON.stringify({
      message,
      imageUrls,
      audioUrls,
      history: [],
      isVoiceMode: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[agent] walts-agent error:', errorText);
    throw new Error('Erro ao processar mensagem');
  }

  const data = await response.json();
  return data.response;
}

export async function callWaltsAgentWithHistory(
  userId: UserId,
  telegramAccountId: string,
  message: string,
  imageUrls?: string[],
  audioUrls?: string[]
): Promise<string> {
  const supabase = getServiceClient();

  const { data: conversation } = await supabase
    .from('telegram_conversations')
    .select('messages')
    .eq('telegram_account_id', telegramAccountId)
    .single();

  const history = (conversation?.messages || []) as ConversationMessage[];

  const formattedHistory = history.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
    imageUrls: m.imageUrls,
  }));

  const waltsAgentUrl = `${SUPABASE_URL}/functions/v1/walts-agent`;

  const response = await fetch(waltsAgentUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'X-User-Id': userId,
    },
    body: JSON.stringify({
      message,
      imageUrls,
      audioUrls,
      history: formattedHistory,
      isVoiceMode: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[agent] walts-agent error:', errorText);
    throw new Error('Erro ao processar mensagem');
  }

  const data = await response.json();
  const agentResponse = data.response;

  await saveConversationMessages(
    telegramAccountId,
    history,
    message,
    agentResponse,
    imageUrls
  );

  return agentResponse;
}

async function saveConversationMessages(
  telegramAccountId: string,
  existingMessages: ConversationMessage[],
  userMessage: string,
  assistantResponse: string,
  imageUrls?: string[]
): Promise<void> {
  const supabase = getServiceClient();

  const newMessages: ConversationMessage[] = [
    ...existingMessages,
    {
      role: 'user',
      content: userMessage,
      imageUrls,
      timestamp: Date.now(),
    },
    {
      role: 'assistant',
      content: assistantResponse,
      timestamp: Date.now(),
    },
  ];

  const trimmedMessages = newMessages.slice(-MAX_CONVERSATION_MESSAGES);

  await supabase
    .from('telegram_conversations')
    .update({ messages: trimmedMessages })
    .eq('telegram_account_id', telegramAccountId);
}
