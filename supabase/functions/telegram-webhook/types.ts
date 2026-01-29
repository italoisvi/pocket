declare const brand: unique symbol;
type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type TelegramUserId = Brand<number, 'TelegramUserId'>;
export type UserId = Brand<string, 'UserId'>;
export type TelegramAccountId = Brand<string, 'TelegramAccountId'>;

export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramVoice = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
};

export type TelegramAudio = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  document?: TelegramDocument;
  caption?: string;
  reply_to_message?: TelegramMessage;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

export type SendMessageParams = {
  chat_id: number;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
};

export type AnswerCallbackQueryParams = {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
};

export type TelegramAccountRow = {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  user_id: string;
  is_primary_channel: boolean;
  onboarding_completed: boolean;
  onboarding_step: string;
  created_at: string;
  updated_at: string;
};

export type TelegramConversationRow = {
  id: string;
  telegram_account_id: string;
  messages: ConversationMessage[];
  created_at: string;
  updated_at: string;
};

export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  imageUrls?: string[];
  timestamp: number;
};

export type LinkCodeRow = {
  id: string;
  code: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export type OnboardingStep =
  | 'welcome'
  | 'name'
  | 'income'
  | 'income_source'
  | 'payment_day'
  | 'confirm'
  | 'completed';

export type OnboardingData = {
  name?: string;
  income?: number;
  incomeSource?: string;
  paymentDay?: number;
};

export type WebhookContext = {
  telegramUserId: TelegramUserId;
  chatId: number;
  telegramAccount: TelegramAccountRow | null;
  userId: UserId | null;
};
