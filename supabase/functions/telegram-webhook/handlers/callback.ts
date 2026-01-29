import type {
  TelegramCallbackQuery,
  TelegramAccountRow,
  UserId,
} from '../types.ts';
import {
  answerCallbackQuery,
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
import { findTelegramAccount } from '../services/auth.ts';
import { handleOnboardingCallback } from '../services/onboarding.ts';
import { callWaltsAgentWithHistory } from '../services/agent.ts';
import { getProfileSummary, getUserBanks } from '../services/profile.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

export async function handleCallback(
  callbackQuery: TelegramCallbackQuery
): Promise<void> {
  const chatId = callbackQuery.message?.chat.id;
  const callbackData = callbackQuery.data || '';
  const telegramUserId = callbackQuery.from.id;

  if (!chatId) {
    await answerCallbackQuery({ callback_query_id: callbackQuery.id });
    return;
  }

  const telegramAccount = await findTelegramAccount(telegramUserId as any);

  if (!telegramAccount) {
    await answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Conta não encontrada. Use /start para começar.',
      show_alert: true,
    });
    return;
  }

  // Handle onboarding callbacks first
  const onboardingHandled = await handleOnboardingCallback(
    chatId,
    telegramAccount,
    callbackData
  );

  if (onboardingHandled) {
    await answerCallbackQuery({ callback_query_id: callbackQuery.id });
    return;
  }

  // Parse callback data
  const parts = callbackData.split(':');
  const category = parts[0];
  const action = parts[1];
  const value = parts[2];

  await answerCallbackQuery({ callback_query_id: callbackQuery.id });

  // Check if onboarding is complete for non-onboarding actions
  if (!telegramAccount.onboarding_completed && category !== 'onboard') {
    await sendMessage({
      chat_id: chatId,
      text: '⚠️ Complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  switch (category) {
    case 'menu':
      await handleMenuCallback(chatId, telegramAccount, action);
      break;

    case 'profile':
      await handleProfileCallback(chatId, telegramAccount, action, value);
      break;

    case 'banks':
      await handleBanksCallback(chatId, telegramAccount, action);
      break;

    case 'report':
      await handleReportCallback(chatId, telegramAccount, action, value);
      break;

    case 'goals':
      await handleGoalsCallback(chatId, telegramAccount, action);
      break;

    case 'budgets':
      await handleBudgetsCallback(chatId, telegramAccount, action);
      break;

    default:
      console.log('[callback] Unknown category:', category);
  }
}

// ============================================================================
// Menu Handlers
// ============================================================================

async function handleMenuCallback(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  action: string
): Promise<void> {
  await sendTypingAction(chatId);

  switch (action) {
    case 'main':
      await sendMessageWithKeyboard(
        chatId,
        '🏠 <b>Menu Principal</b>\n\nO que você gostaria de fazer?',
        MAIN_MENU_KEYBOARD,
        'HTML'
      );
      break;

    case 'balance':
      await handleBalanceMenu(chatId, telegramAccount);
      break;

    case 'expenses':
      await handleExpensesMenu(chatId, telegramAccount);
      break;

    case 'report':
      await sendMessageWithKeyboard(
        chatId,
        '📈 <b>Relatórios</b>\n\nEscolha o período do relatório:',
        REPORT_PERIOD_KEYBOARD,
        'HTML'
      );
      break;

    case 'goals':
      await sendMessageWithKeyboard(
        chatId,
        '🎯 <b>Metas Financeiras</b>\n\nGerencie suas metas de economia e investimento:',
        GOALS_MENU_KEYBOARD,
        'HTML'
      );
      break;

    case 'budgets':
      await sendMessageWithKeyboard(
        chatId,
        '💳 <b>Orçamentos</b>\n\nControle seus gastos por categoria:',
        BUDGETS_MENU_KEYBOARD,
        'HTML'
      );
      break;

    case 'banks':
      await handleBanksMenu(chatId, telegramAccount);
      break;

    case 'profile':
      await handleProfileMenu(chatId, telegramAccount);
      break;

    case 'help':
      await handleHelpMenu(chatId);
      break;

    default:
      await sendMessage({
        chat_id: chatId,
        text: '❓ Opção não reconhecida.',
      });
  }
}

// ============================================================================
// Balance & Expenses
// ============================================================================

async function handleBalanceMenu(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  try {
    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      'Me dê um resumo do meu saldo atual, quanto já gastei este mês, e quanto ainda posso gastar. Seja direto e use emojis para deixar mais visual.'
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BACK_TO_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[callback] Balance error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Desculpe, não consegui verificar seu saldo. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

async function handleExpensesMenu(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  try {
    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      'Me mostre meus últimos 10 gastos com data, valor e categoria. Formate de forma clara e organizada.'
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BACK_TO_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[callback] Expenses error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Desculpe, não consegui buscar seus gastos. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

// ============================================================================
// Profile
// ============================================================================

async function handleProfileMenu(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
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
    console.error('[callback] Profile error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Erro ao carregar perfil. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

async function handleProfileCallback(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  action: string,
  value: string
): Promise<void> {
  if (action === 'edit') {
    // TODO: Implement profile editing
    await sendMessageWithKeyboard(
      chatId,
      `✏️ Para editar seu ${value}, envie o novo valor como mensagem.`,
      BACK_TO_MENU_KEYBOARD
    );
  }
}

// ============================================================================
// Banks
// ============================================================================

async function handleBanksMenu(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  try {
    const banks = await getUserBanks(telegramAccount.user_id);

    let banksText = '🏦 <b>Contas Bancárias</b>\n\n';

    if (banks.length === 0) {
      banksText += 'Você ainda não conectou nenhuma conta bancária.\n\n';
      banksText +=
        'Conecte sua conta para importar transações automaticamente!';
    } else {
      banksText += '<b>Contas conectadas:</b>\n\n';
      for (const bank of banks) {
        banksText += `• ${bank.name}\n`;
        banksText += `  Saldo: ${bank.balance}\n`;
        banksText += `  Última sync: ${bank.lastSync}\n\n`;
      }
    }

    await sendMessageWithKeyboard(
      chatId,
      banksText,
      BANKS_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[callback] Banks error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Erro ao carregar contas. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

async function handleBanksCallback(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  action: string
): Promise<void> {
  switch (action) {
    case 'connect':
      const connectUrl = `${SUPABASE_URL}/functions/v1/connect-bank?user_id=${telegramAccount.user_id}&source=telegram`;
      const keyboard = createInlineKeyboard([
        [createUrlButton('🏦 Conectar Banco', connectUrl)],
        [{ text: '⬅️ Voltar', callback_data: 'menu:banks' }],
      ]);

      await sendMessageWithKeyboard(
        chatId,
        `🔗 <b>Conectar Conta Bancária</b>

Clique no botão abaixo para conectar sua conta via Open Finance.

<b>Benefícios:</b>
• Importação automática de transações
• Saldo atualizado em tempo real
• Análises mais precisas`,
        keyboard,
        'HTML'
      );
      break;

    case 'list':
      await handleBanksMenu(chatId, telegramAccount);
      break;

    case 'balances':
      await handleBankBalances(chatId, telegramAccount);
      break;

    case 'transactions':
      await handleBankTransactions(chatId, telegramAccount);
      break;

    case 'sync':
      await handleBankSync(chatId, telegramAccount);
      break;
  }
}

async function handleBankBalances(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  await sendTypingAction(chatId);

  try {
    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      'Mostre os saldos de todas as minhas contas bancárias conectadas. Inclua o nome do banco, tipo de conta (corrente ou cartão), saldo atual, e se for cartão, mostre o limite e crédito disponível. Formate de forma clara.'
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BANKS_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[callback] Bank balances error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Erro ao buscar saldos. Tente novamente.',
      BANKS_MENU_KEYBOARD
    );
  }
}

async function handleBankTransactions(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  await sendTypingAction(chatId);

  try {
    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      'Mostre minhas últimas 15 transações bancárias (extrato). Inclua data, descrição, valor, e se é débito ou crédito. Agrupe por dia se possível.'
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BANKS_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[callback] Bank transactions error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Erro ao buscar extrato. Tente novamente.',
      BANKS_MENU_KEYBOARD
    );
  }
}

async function handleBankSync(
  chatId: number,
  telegramAccount: TelegramAccountRow
): Promise<void> {
  try {
    await sendMessage({
      chat_id: chatId,
      text: '🔄 Sincronizando dados bancários...',
    });

    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      'Sincronize meus dados bancários e me informe o status. Diga quando foi a última sincronização de cada banco e se há algum erro ou pendência.'
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BANKS_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[callback] Bank sync error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Erro ao sincronizar. Tente novamente.',
      BANKS_MENU_KEYBOARD
    );
  }
}

// ============================================================================
// Reports
// ============================================================================

async function handleReportCallback(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  action: string,
  value: string
): Promise<void> {
  if (action !== 'period') return;

  await sendTypingAction(chatId);

  const periodMap: Record<string, string> = {
    month: 'deste mês',
    week: 'desta semana',
    '3months': 'dos últimos 3 meses',
    year: 'deste ano',
  };

  const period = periodMap[value] || 'deste mês';

  try {
    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      `Gere um relatório completo dos meus gastos ${period}. Inclua: total gasto, gastos por categoria, maiores gastos, e uma análise breve. Use emojis e formate bem.`
    );

    await sendMessageWithKeyboard(
      chatId,
      markdownToTelegramHtml(response),
      BACK_TO_MENU_KEYBOARD,
      'HTML'
    );
  } catch (error) {
    console.error('[callback] Report error:', error);
    await sendMessageWithKeyboard(
      chatId,
      '❌ Erro ao gerar relatório. Tente novamente.',
      BACK_TO_MENU_KEYBOARD
    );
  }
}

// ============================================================================
// Goals
// ============================================================================

async function handleGoalsCallback(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  action: string
): Promise<void> {
  await sendTypingAction(chatId);

  switch (action) {
    case 'list':
      try {
        const response = await callWaltsAgentWithHistory(
          telegramAccount.user_id as UserId,
          telegramAccount.id,
          'Mostre minhas metas financeiras atuais com progresso. Se não tiver metas, sugira algumas.'
        );

        await sendMessageWithKeyboard(
          chatId,
          markdownToTelegramHtml(response),
          GOALS_MENU_KEYBOARD,
          'HTML'
        );
      } catch (error) {
        console.error('[callback] Goals list error:', error);
        await sendMessageWithKeyboard(
          chatId,
          '❌ Erro ao carregar metas. Tente novamente.',
          BACK_TO_MENU_KEYBOARD
        );
      }
      break;

    case 'create':
      await sendMessageWithKeyboard(
        chatId,
        `🎯 <b>Criar Nova Meta</b>

Para criar uma meta, me envie uma mensagem descrevendo:
• O objetivo (ex: "Economizar para viagem")
• O valor alvo (ex: "R$ 5.000")
• O prazo (ex: "até dezembro")

<b>Exemplo:</b>
"Quero criar uma meta de economizar R$ 3.000 para uma viagem até junho"`,
        BACK_TO_MENU_KEYBOARD,
        'HTML'
      );
      break;
  }
}

// ============================================================================
// Budgets
// ============================================================================

async function handleBudgetsCallback(
  chatId: number,
  telegramAccount: TelegramAccountRow,
  action: string
): Promise<void> {
  await sendTypingAction(chatId);

  switch (action) {
    case 'list':
      try {
        const response = await callWaltsAgentWithHistory(
          telegramAccount.user_id as UserId,
          telegramAccount.id,
          'Mostre meus orçamentos por categoria com quanto já gastei em cada um e quanto ainda posso gastar. Use barras de progresso visuais.'
        );

        await sendMessageWithKeyboard(
          chatId,
          markdownToTelegramHtml(response),
          BUDGETS_MENU_KEYBOARD,
          'HTML'
        );
      } catch (error) {
        console.error('[callback] Budgets list error:', error);
        await sendMessageWithKeyboard(
          chatId,
          '❌ Erro ao carregar orçamentos. Tente novamente.',
          BACK_TO_MENU_KEYBOARD
        );
      }
      break;

    case 'create':
      await sendMessageWithKeyboard(
        chatId,
        `💳 <b>Criar Novo Orçamento</b>

Para criar um orçamento, me envie uma mensagem com:
• A categoria (ex: "Alimentação")
• O valor limite mensal (ex: "R$ 800")

<b>Exemplo:</b>
"Quero criar um orçamento de R$ 500 para transporte"`,
        BACK_TO_MENU_KEYBOARD,
        'HTML'
      );
      break;
  }
}

// ============================================================================
// Help
// ============================================================================

async function handleHelpMenu(chatId: number): Promise<void> {
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
