import type { InlineKeyboardMarkup, InlineKeyboardButton } from '../types.ts';

export function createInlineKeyboard(
  buttons: InlineKeyboardButton[][]
): InlineKeyboardMarkup {
  return { inline_keyboard: buttons };
}

export function createButton(
  text: string,
  callbackData: string
): InlineKeyboardButton {
  return { text, callback_data: callbackData };
}

export function createUrlButton(
  text: string,
  url: string
): InlineKeyboardButton {
  return { text, url };
}

// ============================================================================
// Onboarding Keyboards
// ============================================================================

export const INCOME_SOURCE_KEYBOARD = createInlineKeyboard([
  [
    createButton('💼 CLT', 'onboard:source:CLT'),
    createButton('🏢 PJ', 'onboard:source:PJ'),
  ],
  [
    createButton('👤 Autônomo', 'onboard:source:Autônomo'),
    createButton('💻 Freelancer', 'onboard:source:Freelancer'),
  ],
  [
    createButton('🏪 Empresário', 'onboard:source:Empresário'),
    createButton('🧓 Aposentado', 'onboard:source:Aposentado'),
  ],
  [
    createButton('📈 Investimentos', 'onboard:source:Investimentos'),
    createButton('📦 Outros', 'onboard:source:Outros'),
  ],
]);

export const PAYMENT_DAY_KEYBOARD = createInlineKeyboard([
  [
    createButton('1', 'onboard:day:1'),
    createButton('5', 'onboard:day:5'),
    createButton('10', 'onboard:day:10'),
    createButton('15', 'onboard:day:15'),
  ],
  [
    createButton('20', 'onboard:day:20'),
    createButton('25', 'onboard:day:25'),
    createButton('28', 'onboard:day:28'),
    createButton('30', 'onboard:day:30'),
  ],
  [createButton('📝 Outro dia', 'onboard:day:other')],
]);

export const CONFIRM_ONBOARDING_KEYBOARD = createInlineKeyboard([
  [
    createButton('✅ Confirmar', 'onboard:confirm:yes'),
    createButton('✏️ Editar', 'onboard:confirm:edit'),
  ],
]);

export const EDIT_FIELD_KEYBOARD = createInlineKeyboard([
  [createButton('👤 Nome', 'onboard:edit:name')],
  [createButton('💰 Renda', 'onboard:edit:income')],
  [createButton('💼 Fonte de renda', 'onboard:edit:source')],
  [createButton('📅 Dia de pagamento', 'onboard:edit:day')],
  [createButton('⬅️ Voltar', 'onboard:edit:back')],
]);

// ============================================================================
// Main Menu Keyboards
// ============================================================================

export const MAIN_MENU_KEYBOARD = createInlineKeyboard([
  [
    createButton('💰 Saldo', 'menu:balance'),
    createButton('📊 Gastos', 'menu:expenses'),
  ],
  [
    createButton('📈 Relatório', 'menu:report'),
    createButton('🎯 Metas', 'menu:goals'),
  ],
  [
    createButton('💳 Orçamentos', 'menu:budgets'),
    createButton('🏦 Bancos', 'menu:banks'),
  ],
  [
    createButton('👤 Perfil', 'menu:profile'),
    createButton('❓ Ajuda', 'menu:help'),
  ],
]);

export const PROFILE_MENU_KEYBOARD = createInlineKeyboard([
  [createButton('✏️ Editar nome', 'profile:edit:name')],
  [createButton('💰 Editar renda', 'profile:edit:income')],
  [createButton('💼 Editar fonte de renda', 'profile:edit:source')],
  [createButton('📅 Editar dia de pagamento', 'profile:edit:day')],
  [createButton('⬅️ Voltar ao menu', 'menu:main')],
]);

export const BANKS_MENU_KEYBOARD = createInlineKeyboard([
  [createButton('💰 Ver saldos', 'banks:balances')],
  [createButton('📋 Ver extrato', 'banks:transactions')],
  [createButton('🔄 Atualizar dados', 'banks:sync')],
  [createButton('➕ Conectar novo banco', 'banks:connect')],
  [createButton('⬅️ Voltar ao menu', 'menu:main')],
]);

export const BACK_TO_MENU_KEYBOARD = createInlineKeyboard([
  [createButton('⬅️ Voltar ao menu', 'menu:main')],
]);

export const REPORT_PERIOD_KEYBOARD = createInlineKeyboard([
  [
    createButton('📅 Este mês', 'report:period:month'),
    createButton('📆 Semana', 'report:period:week'),
  ],
  [
    createButton('📊 Últimos 3 meses', 'report:period:3months'),
    createButton('📈 Este ano', 'report:period:year'),
  ],
  [createButton('⬅️ Voltar ao menu', 'menu:main')],
]);

export const GOALS_MENU_KEYBOARD = createInlineKeyboard([
  [createButton('📋 Ver minhas metas', 'goals:list')],
  [createButton('➕ Criar nova meta', 'goals:create')],
  [createButton('⬅️ Voltar ao menu', 'menu:main')],
]);

export const BUDGETS_MENU_KEYBOARD = createInlineKeyboard([
  [createButton('📋 Ver orçamentos', 'budgets:list')],
  [createButton('➕ Criar orçamento', 'budgets:create')],
  [createButton('⬅️ Voltar ao menu', 'menu:main')],
]);
