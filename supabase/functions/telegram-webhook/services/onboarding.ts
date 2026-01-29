import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { TelegramAccountRow, OnboardingStep } from '../types.ts';
import { sendMessage, sendMessageWithKeyboard } from '../utils/telegram-api.ts';
import {
  INCOME_SOURCE_KEYBOARD,
  PAYMENT_DAY_KEYBOARD,
  CONFIRM_ONBOARDING_KEYBOARD,
  EDIT_FIELD_KEYBOARD,
  MAIN_MENU_KEYBOARD,
} from '../utils/keyboard.ts';
import { updateTelegramAccount } from './auth.ts';
import { formatCurrency } from '../utils/format.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

type OnboardingData = {
  name?: string;
  income?: number;
  incomeSource?: string;
  paymentDay?: number;
};

// Store onboarding data in telegram_conversations table (messages field)
async function getOnboardingData(accountId: string): Promise<OnboardingData> {
  try {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('telegram_conversations')
      .select('messages')
      .eq('telegram_account_id', accountId)
      .single();

    if (error) {
      console.error('[onboarding] Error getting onboarding data:', error);
      return {};
    }

    // Use messages field to store onboarding data temporarily
    const messages = data?.messages as any;
    if (messages && messages._onboarding) {
      return messages._onboarding as OnboardingData;
    }
    return {};
  } catch (error) {
    console.error('[onboarding] Exception getting onboarding data:', error);
    return {};
  }
}

async function setOnboardingData(
  accountId: string,
  newData: Partial<OnboardingData>
): Promise<void> {
  try {
    const supabase = getServiceClient();

    const existing = await getOnboardingData(accountId);
    const merged = { ...existing, ...newData };

    const { error } = await supabase
      .from('telegram_conversations')
      .update({ messages: { _onboarding: merged } })
      .eq('telegram_account_id', accountId);

    if (error) {
      console.error('[onboarding] Error setting onboarding data:', error);
    }
  } catch (error) {
    console.error('[onboarding] Exception setting onboarding data:', error);
  }
}

async function clearOnboardingData(accountId: string): Promise<void> {
  try {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('telegram_conversations')
      .update({ messages: [] })
      .eq('telegram_account_id', accountId);

    if (error) {
      console.error('[onboarding] Error clearing onboarding data:', error);
    }
  } catch (error) {
    console.error('[onboarding] Exception clearing onboarding data:', error);
  }
}

// ============================================================================
// Main Handlers
// ============================================================================

export async function handleOnboardingMessage(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  message: string
): Promise<boolean> {
  const step = telegramAccount.onboarding_step as OnboardingStep;

  if (step === 'completed' || telegramAccount.onboarding_completed) {
    return false;
  }

  switch (step) {
    case 'name':
      await handleNameInput(chatId, telegramAccount, message);
      return true;

    case 'income':
      await handleIncomeInput(chatId, telegramAccount, message);
      return true;

    case 'payment_day':
      await handlePaymentDayTextInput(chatId, telegramAccount, message);
      return true;

    default:
      return false;
  }
}

export async function handleOnboardingCallback(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  callbackData: string
): Promise<boolean> {
  const step = telegramAccount.onboarding_step as OnboardingStep;

  if (step === 'completed' || telegramAccount.onboarding_completed) {
    return false;
  }

  if (!callbackData.startsWith('onboard:')) {
    return false;
  }

  const parts = callbackData.split(':');
  const action = parts[1];
  const value = parts[2];

  switch (action) {
    case 'source':
      await handleIncomeSourceSelection(chatId, telegramAccount, value);
      return true;

    case 'day':
      if (value === 'other') {
        await sendMessage({
          chat_id: chatId,
          text: '📅 Digite o dia do mês em que você recebe (1-31):',
        });
        await updateTelegramAccount(telegramAccount.id, {
          onboarding_step: 'payment_day',
        });
      } else {
        await handlePaymentDaySelection(
          chatId,
          telegramAccount,
          parseInt(value, 10)
        );
      }
      return true;

    case 'confirm':
      if (value === 'yes') {
        await finalizeOnboarding(chatId, telegramAccount);
      } else if (value === 'edit') {
        await showEditOptions(chatId, telegramAccount);
      }
      return true;

    case 'edit':
      await handleEditSelection(chatId, telegramAccount, value);
      return true;

    default:
      return false;
  }
}

export async function startOnboarding(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  await clearOnboardingData(telegramAccount.id);

  const welcomeMessage = `🎉 <b>Bem-vindo ao Pocket!</b>

Sou o <b>Walts</b>, seu assistente financeiro pessoal. Vou te ajudar a organizar suas finanças de forma simples e prática.

📱 <b>O que posso fazer por você:</b>
• Registrar gastos por texto, foto ou áudio
• Acompanhar seu saldo e orçamentos
• Gerar relatórios e análises
• Conectar suas contas bancárias

Vamos começar com algumas informações básicas.

<b>Qual é o seu nome?</b>`;

  await sendMessage({
    chat_id: chatId,
    text: welcomeMessage,
    parse_mode: 'HTML',
  });

  await updateTelegramAccount(telegramAccount.id, {
    onboarding_step: 'name',
  });
}

// ============================================================================
// Step Handlers
// ============================================================================

async function handleNameInput(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  name: string
): Promise<void> {
  const cleanName = name.trim();

  if (cleanName.length < 2 || cleanName.length > 50) {
    await sendMessage({
      chat_id: chatId,
      text: '❌ Por favor, digite um nome válido (entre 2 e 50 caracteres).',
    });
    return;
  }

  // Check if it looks like a name (not numbers or special chars only)
  if (!/[a-zA-ZÀ-ú]/.test(cleanName)) {
    await sendMessage({
      chat_id: chatId,
      text: '❌ Por favor, digite um nome válido.',
    });
    return;
  }

  await setOnboardingData(telegramAccount.id, { name: cleanName });

  await updateTelegramAccount(telegramAccount.id, {
    onboarding_step: 'income',
  });

  await sendMessage({
    chat_id: chatId,
    text: `Prazer em conhecer você, <b>${cleanName}</b>! 😊

💰 <b>Qual é sua renda mensal?</b>

Digite o valor (ex: <code>5000</code> ou <code>R$ 5.000,00</code>)`,
    parse_mode: 'HTML',
  });
}

async function handleIncomeInput(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  incomeText: string
): Promise<void> {
  const income = parseIncomeValue(incomeText);

  if (income === null || income <= 0) {
    await sendMessage({
      chat_id: chatId,
      text: `❌ Não entendi o valor. Por favor, digite apenas números.

<b>Exemplos válidos:</b>
• 5000
• R$ 5.000
• 5000,00`,
      parse_mode: 'HTML',
    });
    return;
  }

  if (income > 1000000) {
    await sendMessage({
      chat_id: chatId,
      text: '❌ O valor parece muito alto. Por favor, verifique e digite novamente.',
    });
    return;
  }

  await setOnboardingData(telegramAccount.id, { income });

  await updateTelegramAccount(telegramAccount.id, {
    onboarding_step: 'income_source',
  });

  await sendMessageWithKeyboard(
    chatId,
    `💰 Ótimo! <b>${formatCurrency(income)}</b> por mês.

💼 <b>De onde vem essa renda?</b>`,
    INCOME_SOURCE_KEYBOARD,
    'HTML'
  );
}

async function handleIncomeSourceSelection(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  incomeSource: string
): Promise<void> {
  await setOnboardingData(telegramAccount.id, { incomeSource });

  await updateTelegramAccount(telegramAccount.id, {
    onboarding_step: 'payment_day',
  });

  await sendMessageWithKeyboard(
    chatId,
    `💼 ${incomeSource}, entendi!

📅 <b>Qual dia do mês você recebe?</b>`,
    PAYMENT_DAY_KEYBOARD,
    'HTML'
  );
}

async function handlePaymentDaySelection(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  paymentDay: number
): Promise<void> {
  await setOnboardingData(telegramAccount.id, { paymentDay });

  await updateTelegramAccount(telegramAccount.id, {
    onboarding_step: 'confirm',
  });

  await showConfirmation(chatId, telegramAccount);
}

async function handlePaymentDayTextInput(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  dayText: string
): Promise<void> {
  const day = parseInt(dayText.trim(), 10);

  if (isNaN(day) || day < 1 || day > 31) {
    await sendMessage({
      chat_id: chatId,
      text: '❌ Por favor, digite um dia válido entre 1 e 31.',
    });
    return;
  }

  await handlePaymentDaySelection(chatId, telegramAccount, day);
}

// ============================================================================
// Confirmation & Edit
// ============================================================================

async function showConfirmation(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  const data = await getOnboardingData(telegramAccount.id);

  const summaryMessage = `📋 <b>Confirme seus dados:</b>

👤 <b>Nome:</b> ${data.name || 'Não informado'}
💰 <b>Renda:</b> ${data.income ? formatCurrency(data.income) : 'Não informada'}
💼 <b>Fonte:</b> ${data.incomeSource || 'Não informada'}
📅 <b>Dia do pagamento:</b> ${data.paymentDay || 'Não informado'}

Está tudo certo?`;

  await sendMessageWithKeyboard(
    chatId,
    summaryMessage,
    CONFIRM_ONBOARDING_KEYBOARD,
    'HTML'
  );
}

async function showEditOptions(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  await sendMessageWithKeyboard(
    chatId,
    '✏️ <b>O que você gostaria de editar?</b>',
    EDIT_FIELD_KEYBOARD,
    'HTML'
  );
}

async function handleEditSelection(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  field: string
): Promise<void> {
  switch (field) {
    case 'name':
      await updateTelegramAccount(telegramAccount.id, {
        onboarding_step: 'name',
      });
      await sendMessage({
        chat_id: chatId,
        text: '👤 <b>Digite seu novo nome:</b>',
        parse_mode: 'HTML',
      });
      break;

    case 'income':
      await updateTelegramAccount(telegramAccount.id, {
        onboarding_step: 'income',
      });
      await sendMessage({
        chat_id: chatId,
        text: '💰 <b>Digite sua renda mensal:</b>',
        parse_mode: 'HTML',
      });
      break;

    case 'source':
      await updateTelegramAccount(telegramAccount.id, {
        onboarding_step: 'income_source',
      });
      await sendMessageWithKeyboard(
        chatId,
        '💼 <b>De onde vem sua renda?</b>',
        INCOME_SOURCE_KEYBOARD,
        'HTML'
      );
      break;

    case 'day':
      await updateTelegramAccount(telegramAccount.id, {
        onboarding_step: 'payment_day',
      });
      await sendMessageWithKeyboard(
        chatId,
        '📅 <b>Qual dia do mês você recebe?</b>',
        PAYMENT_DAY_KEYBOARD,
        'HTML'
      );
      break;

    case 'back':
      await updateTelegramAccount(telegramAccount.id, {
        onboarding_step: 'confirm',
      });
      await showConfirmation(chatId, telegramAccount);
      break;
  }
}

// ============================================================================
// Finalize Onboarding
// ============================================================================

async function finalizeOnboarding(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  const data = await getOnboardingData(telegramAccount.id);
  const supabase = getServiceClient();

  // Save profile name
  if (data.name) {
    await supabase
      .from('profiles')
      .update({ name: data.name })
      .eq('id', telegramAccount.user_id);
  }

  // Save income card
  if (data.income && data.incomeSource && data.paymentDay) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('income_cards')
      .eq('id', telegramAccount.user_id)
      .single();

    const existingCards = profile?.income_cards || [];

    const newCard = {
      id: crypto.randomUUID(),
      salary: data.income.toString(),
      paymentDay: data.paymentDay.toString(),
      incomeSource: data.incomeSource,
    };

    await supabase
      .from('profiles')
      .update({ income_cards: [...existingCards, newCard] })
      .eq('id', telegramAccount.user_id);
  }

  // Mark onboarding as complete
  await updateTelegramAccount(telegramAccount.id, {
    onboarding_step: 'completed',
    onboarding_completed: true,
  });

  // Clear temporary data
  await clearOnboardingData(telegramAccount.id);

  const successMessage = `🎊 <b>Cadastro concluído com sucesso!</b>

Agora você pode:

📸 <b>Enviar fotos</b> de comprovantes
🎤 <b>Enviar áudios</b> dizendo seus gastos
✍️ <b>Digitar</b> mensagens como "Gastei 50 no mercado"

<b>Dica:</b> Experimente me mandar uma foto de um comprovante agora!

Use o menu abaixo para explorar todas as funcionalidades:`;

  await sendMessageWithKeyboard(
    chatId,
    successMessage,
    MAIN_MENU_KEYBOARD,
    'HTML'
  );
}

// ============================================================================
// Utils
// ============================================================================

function parseIncomeValue(text: string): number | null {
  // Remove R$, spaces, dots (thousand separator) and convert comma to dot
  const cleaned = text
    .replace(/[rR]\$?\s*/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/\s/g, '')
    .trim();

  const value = parseFloat(cleaned);

  if (isNaN(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}
