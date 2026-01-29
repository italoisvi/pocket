import type {
  SendMessageParams,
  AnswerCallbackQueryParams,
  InlineKeyboardMarkup,
} from '../types.ts';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function callTelegramApi<T>(
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${TELEGRAM_API_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[telegram-api] ${method} failed:`, errorText);
    throw new Error(`Telegram API error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok) {
    console.error(`[telegram-api] ${method} returned not ok:`, data);
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return data.result;
}

export async function sendMessage(params: SendMessageParams): Promise<void> {
  await callTelegramApi('sendMessage', params);
}

export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: InlineKeyboardMarkup,
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML'
): Promise<void> {
  await sendMessage({
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
}

export async function answerCallbackQuery(
  params: AnswerCallbackQueryParams
): Promise<void> {
  await callTelegramApi('answerCallbackQuery', params);
}

export async function sendTypingAction(chatId: number): Promise<void> {
  await callTelegramApi('sendChatAction', {
    chat_id: chatId,
    action: 'typing',
  });
}

export async function getFileUrl(fileId: string): Promise<string> {
  const file = await callTelegramApi<{ file_path: string }>('getFile', {
    file_id: fileId,
  });
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
}

export async function downloadFile(fileId: string): Promise<Blob> {
  const fileUrl = await getFileUrl(fileId);
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  return response.blob();
}
