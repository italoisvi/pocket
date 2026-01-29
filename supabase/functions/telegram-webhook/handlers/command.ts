import type { TelegramMessage, TelegramAccountRow, UserId } from '../types.ts';
import {
  sendMessage,
  sendMessageWithKeyboard,
  sendTypingAction,
} from '../utils/telegram-api.ts';
import {
  MAIN_MENU_KEYBOARD,
  PROFILE_MENU_KEYBOARD,
  BANKS_MENU_KEYBOARD,
  BACK_TO_MENU_KEYBOARD,
  REPORT_PERIOD_KEYBOARD,
  GOALS_MENU_KEYBOARD,
  BUDGETS_MENU_KEYBOARD,
  createInlineKeyboard,
  createUrlButton,
} from '../utils/keyboard.ts';
import { markdownToTelegramHtml } from '../utils/format.ts';
import {
  findTelegramAccount,
  createTelegramUser,
  linkTelegramToExistingUser,
} from '../services/auth.ts';
import { startOnboarding } from '../services/onboarding.ts';
import { callWaltsAgentWithHistory } from '../services/agent.ts';
import { getProfileSummary, getUserBanks } from '../services/profile.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

export async function handleCommand(
  message: TelegramMessage,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text || '';
  const command = text.split(' ')[0].toLowerCase();
  const args = text.slice(command.length).trim();

  switch (command) {
    case '/start':
      await handleStartCommand(message, telegramAccount, args);
      break;

    case '/help':
    case '/ajuda':
      await handleHelpCommand(chatId);
      break;

    case '/saldo':
      await handleBalanceCommand(chatId, telegramAccount);
      break;

    case '/gastos':
      await handleExpensesCommand(chatId, telegramAccount);
      break;

    case '/relatorio':
      await handleReportCommand(chatId, telegramAccount);
      break;

    case '/perfil':
      await handleProfileCommand(chatId, telegramAccount);
      break;

    case '/metas':
      await handleGoalsCommand(chatId, telegramAccount);
      break;

    case '/orcamento':
    case '/orcamentos':
      await handleBudgetsCommand(chatId, telegramAccount);
      break;

    case '/conectar':
    case '/banco':
    case '/bancos':
      await handleConnectCommand(chatId, telegramAccount);
      break;

    case '/menu':
      await handleMenuCommand(chatId, telegramAccount);
      break;

    default:
      await sendMessage({
        chat_id: chatId,
        text: '❓ Comando não reconhecido. Use /ajuda para ver os comandos disponíveis.',
      });
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleStartCommand(
  message: TelegramMessage,
  telegramAccount: TelegramAccountRow | null,
  args: string
): Promise<void> {
  const chatId = message.chat.id;
  const telegramUser = message.from!;

  // Check if it's a link code (6 characters)
  if (args && args.length === 6) {
    const result = await linkTelegramToExistingUser(telegramUser, args);

    await sendMessage({
      chat_id: chatId,
      text: result.message,
      parse_mode: 'HTML',
    });

    if (result.success && result.telegramAccount) {
      await sendMessageWithKeyboard(
        chatId,
        '🎉 O que você gostaria de fazer?',
        MAIN_MENU_KEYBOARD
      );
    }
    return;
  }

  // Existing user
  if (telegramAccount) {
    if (telegramAccount.onboarding_completed) {
      await sendMessageWithKeyboard(
        chatId,
        `👋 Olá, <b>${telegramUser.first_name}</b>!

Sou o <b>Walts</b>, seu assistente financeiro. Como posso te ajudar hoje?

Use os botões abaixo ou me envie uma mensagem.`,
        MAIN_MENU_KEYBOARD,
        'HTML'
      );
    } else {
      await startOnboarding(chatId, telegramAccount);
    }
    return;
  }

  // New user
  const { telegramAccount: newAccount } =
    await createTelegramUser(telegramUser);
  await startOnboarding(chatId, newAccount);
}

async function handleMenuCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  await sendMessageWithKeyboard(
    chatId,
    '🏠 <b>Menu Principal</b>\n\nO que você gostaria de fazer?',
    MAIN_MENU_KEYBOARD,
    'HTML'
  );
}

async function handleHelpCommand(chatId: number): Promise<void> {
  const helpText = `❓ <b>Central de Ajuda</b>

<b>📝 Registrar Gastos:</b>
• Envie uma <b>foto</b> do comprovante
• Envie um <b>áudio</b> descrevendo o gasto
• Digite: "Gastei 50 no mercado"

<b>💬 Comandos Disponíveis:</b>
/start - Menu principal
/saldo - Ver saldo atual
/gastos - Últimos gastos
/relatorio - Relatório mensal
/perfil - Ver/editar perfil
/metas - Suas metas
/orcamento - Seus orçamentos
/conectar - Conectar banco
/ajuda - Esta mensagem

<b>💡 Dicas:</b>
• Use o menu de botões para navegação rápida
• Envie fotos de recibos para registro automático
• Pergunte qualquer coisa sobre suas finanças!

<b>📊 Exemplos de Perguntas:</b>
• "Quanto gastei hoje?"
• "Qual meu maior gasto do mês?"
• "Me ajuda a economizar"`;

  await sendMessageWithKeyboard(
    chatId,
    helpText,
    BACK_TO_MENU_KEYBOARD,
    'HTML'
  );
}

async function handleBalanceCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  await sendTypingAction(chatId);

  try {
    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      'Me dê um resumo do meu saldo atual, quanto já gastei este mês, e quanto ainda posso gastar. Seja direto e use emojis.'
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BACK_TO_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[command] Balance error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Desculpe, não consegui verificar seu saldo. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

async function handleExpensesCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  await sendTypingAction(chatId);

  try {
    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      'Me mostre meus últimos 10 gastos com data, valor e categoria. Formate de forma clara.'
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BACK_TO_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[command] Expenses error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Desculpe, não consegui buscar seus gastos. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

async function handleReportCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  await sendMessageWithKeyboard(
    chatId,
    '📈 <b>Relatórios</b>\n\nEscolha o período do relatório:',
    REPORT_PERIOD_KEYBOARD,
    'HTML'
  );
}

async function handleProfileCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  try {
    const profile = await getProfileSummary(telegramAccount.user_id);

    const profileText = `👤 <b>Seu Perfil</b>

<b>Nome:</b> ${profile.name || 'Não informado'}
<b>Renda:</b> ${profile.income || 'Não informada'}
<b>Fonte:</b> ${profile.incomeSource || 'Não informada'}
<b>Dia de pagamento:</b> ${profile.paymentDay || 'Não informado'}
<b>Contas conectadas:</b> ${profile.connectedBanks}

Selecione uma opção para editar:`;

    await sendMessageWithKeyboard(
      chatId,
      profileText,
      PROFILE_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[command] Profile error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Erro ao carregar perfil. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

async function handleGoalsCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  await sendMessageWithKeyboard(
    chatId,
    '🎯 <b>Metas Financeiras</b>\n\nGerencie suas metas de economia e investimento:',
    GOALS_MENU_KEYBOARD,
    'HTML'
  );
}

async function handleBudgetsCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  await sendMessageWithKeyboard(
    chatId,
    '💳 <b>Orçamentos</b>\n\nControle seus gastos por categoria:',
    BUDGETS_MENU_KEYBOARD,
    'HTML'
  );
}

async function handleConnectCommand(
  chatId: number,
  telegramAccount: TelegramAccountRow | null
): Promise<void> {
  if (!telegramAccount?.onboarding_completed) {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  try {
    const banks = await getUserBanks(telegramAccount.user_id);

    let text = '🏦 <b>Contas Bancárias</b>\n\n';

    if (banks.length > 0) {
      text += '<b>Contas conectadas:</b>\n\n';
      for (const bank of banks) {
        text += `• ${bank.name}\n`;
        text += `  Saldo: ${bank.balance}\n`;
        text += `  Última sync: ${bank.lastSync}\n\n`;
      }
    } else {
      text += 'Você ainda não conectou nenhuma conta bancária.\n\n';
      text += 'Conecte sua conta para importar transações automaticamente!';
    }

    await sendMessageWithKeyboard(chatId, text, BANKS_MENU_KEYBOARD, 'HTML');
  } catch (error) {
    console.error('[command] Connect error:', error);

    const connectUrl = `${SUPABASE_URL}/functions/v1/connect-bank?user_id=${telegramAccount.user_id}&source=telegram`;
    const keyboard = createInlineKeyboard([
      [createUrlButton('🏦 Conectar Banco', connectUrl)],
      [{ text: '⬅️ Voltar ao menu', callback_data: 'menu:main' }],
    ]);

    await sendMessageWithKeyboard(
      chatId,
      `🏦 <b>Conectar Conta Bancária</b>

Clique no botão abaixo para conectar sua conta via Open Finance.`,
      keyboard,
      'HTML'
    );
  }
}
