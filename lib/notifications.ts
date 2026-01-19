import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configurar como as notificações serão exibidas
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Chave para armazenar o estado das notificações já enviadas
const NOTIFICATION_STATE_KEY = '@pocket_notification_state';

type NotificationState = {
  budgets: { [budgetId: string]: number }; // Último percentual notificado
  bills: { [billId: string]: boolean }; // Se já foi notificado
  creditCards: { [cardId: string]: number }; // Último percentual notificado
  leaks?: { [leakKey: string]: boolean }; // Vazamentos notificados (categoria_mês)
};

async function getNotificationState(): Promise<NotificationState> {
  try {
    const state = await AsyncStorage.getItem(NOTIFICATION_STATE_KEY);
    if (state) {
      return JSON.parse(state);
    }
  } catch (error) {
    console.error('Erro ao carregar estado de notificações:', error);
  }
  return { budgets: {}, bills: {}, creditCards: {} };
}

async function saveNotificationState(state: NotificationState): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Erro ao salvar estado de notificações:', error);
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('pocket-alerts', {
      name: 'Alertas Financeiros',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return true;
}

// ============ NOTIFICAÇÕES DE ORÇAMENTO ============

export async function notifyBudgetStatus(
  budgetId: string,
  budgetName: string,
  spent: number,
  limit: number,
  notificationsEnabled: boolean
): Promise<void> {
  if (!notificationsEnabled) return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const percentage = (spent / limit) * 100;
  const state = await getNotificationState();
  const lastNotified = state.budgets[budgetId] || 0;

  let title = '';
  let body = '';
  let shouldNotify = false;

  if (percentage >= 100 && lastNotified < 100) {
    title = `Orcamento ${budgetName} excedido`;
    body = `Voce gastou R$ ${spent.toFixed(2)} de R$ ${limit.toFixed(2)} - ${(percentage - 100).toFixed(0)}% acima do limite`;
    state.budgets[budgetId] = 100;
    shouldNotify = true;
  } else if (percentage >= 90 && lastNotified < 90) {
    title = `90% do orcamento ${budgetName}`;
    body = `Voce ja gastou R$ ${spent.toFixed(2)} de R$ ${limit.toFixed(2)} - resta R$ ${(limit - spent).toFixed(2)}`;
    state.budgets[budgetId] = 90;
    shouldNotify = true;
  } else if (percentage >= 80 && lastNotified < 80) {
    title = `80% do orcamento ${budgetName}`;
    body = `Voce ja gastou R$ ${spent.toFixed(2)} de R$ ${limit.toFixed(2)} - resta R$ ${(limit - spent).toFixed(2)}`;
    state.budgets[budgetId] = 80;
    shouldNotify = true;
  }

  if (shouldNotify) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'budget',
          budgetId,
          budgetName,
          percentage,
          spent,
          limit,
        },
      },
      trigger: null,
    });
    await saveNotificationState(state);
  }
}

// ============ NOTIFICAÇÕES DE BOLETOS/CONTAS ============

export async function notifyOverdueBill(
  billId: string,
  description: string,
  amount: number,
  daysOverdue: number
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const state = await getNotificationState();

  // Só notifica uma vez por boleto
  if (state.bills[billId]) return;

  const title = 'Conta vencida';
  const body =
    daysOverdue === 1
      ? `${description} - R$ ${amount.toFixed(2)} venceu ha 1 dia`
      : `${description} - R$ ${amount.toFixed(2)} venceu ha ${daysOverdue} dias`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'overdue_bill', billId, description, amount, daysOverdue },
    },
    trigger: null,
  });

  state.bills[billId] = true;
  await saveNotificationState(state);
}

export async function notifyUpcomingBill(
  billId: string,
  description: string,
  amount: number,
  daysUntilDue: number
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const state = await getNotificationState();

  // Só notifica uma vez por boleto
  if (state.bills[billId]) return;

  let title = '';
  let body = '';

  if (daysUntilDue === 0) {
    title = 'Conta vence hoje';
    body = `${description} - R$ ${amount.toFixed(2)} vence hoje`;
  } else if (daysUntilDue === 1) {
    title = 'Conta vence amanha';
    body = `${description} - R$ ${amount.toFixed(2)} vence amanha`;
  } else {
    title = `Conta vence em ${daysUntilDue} dias`;
    body = `${description} - R$ ${amount.toFixed(2)}`;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        type: 'upcoming_bill',
        billId,
        description,
        amount,
        daysUntilDue,
      },
    },
    trigger: null,
  });

  state.bills[billId] = true;
  await saveNotificationState(state);
}

// ============ NOTIFICAÇÕES DE CARTÃO DE CRÉDITO ============

export async function notifyCreditCardLimit(
  cardId: string,
  cardName: string,
  usedCredit: number,
  creditLimit: number
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const usedPercent = (usedCredit / creditLimit) * 100;
  const state = await getNotificationState();
  const lastNotified = state.creditCards[cardId] || 0;

  let title = '';
  let body = '';
  let shouldNotify = false;

  if (usedPercent >= 95 && lastNotified < 95) {
    title = `Cartao ${cardName} quase no limite`;
    body = `${usedPercent.toFixed(0)}% do limite utilizado - disponivel: R$ ${(creditLimit - usedCredit).toFixed(2)}`;
    state.creditCards[cardId] = 95;
    shouldNotify = true;
  } else if (usedPercent >= 90 && lastNotified < 90) {
    title = `90% do limite do cartao ${cardName}`;
    body = `Utilizado: R$ ${usedCredit.toFixed(2)} de R$ ${creditLimit.toFixed(2)}`;
    state.creditCards[cardId] = 90;
    shouldNotify = true;
  } else if (usedPercent >= 80 && lastNotified < 80) {
    title = `80% do limite do cartao ${cardName}`;
    body = `Utilizado: R$ ${usedCredit.toFixed(2)} de R$ ${creditLimit.toFixed(2)}`;
    state.creditCards[cardId] = 80;
    shouldNotify = true;
  }

  if (shouldNotify) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'credit_limit',
          cardId,
          cardName,
          usedCredit,
          creditLimit,
        },
      },
      trigger: null,
    });
    await saveNotificationState(state);
  }
}

// ============ NOTIFICAÇÕES DE VAZAMENTO ============

export async function notifyLeakDetected(
  category: string,
  total: number,
  count: number,
  avgPerTransaction: number
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const state = await getNotificationState();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const leakKey = `${category}_${currentMonth}`;

  if (state.leaks?.[leakKey]) return;

  const title = 'Vazamento detectado';
  const body = `${category}: ${count} gastos pequenos somaram R$ ${total.toFixed(2)} (média R$ ${avgPerTransaction.toFixed(2)})`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'leak', category, total, count, avgPerTransaction },
    },
    trigger: null,
  });

  if (!state.leaks) state.leaks = {};
  state.leaks[leakKey] = true;
  await saveNotificationState(state);
}

// ============ RESETAR ESTADO (para novo mês) ============

export async function resetMonthlyNotificationState(): Promise<void> {
  const state = await getNotificationState();
  // Resetar orçamentos e cartões no início do mês
  state.budgets = {};
  state.creditCards = {};
  // Manter bills pois são específicos por transação
  await saveNotificationState(state);
}

// ============ VERIFICAR VAZAMENTO APÓS ADICIONAR GASTO ============

export async function checkLeakAfterExpense(
  supabase: { from: (table: string) => unknown },
  userId: string,
  category: string
): Promise<void> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  const { data: expenses, error } = await (
    supabase.from('expenses') as {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string
        ) => {
          eq: (
            col: string,
            val: string
          ) => {
            gte: (
              col: string,
              val: string
            ) => {
              lte: (
                col: string,
                val: string
              ) => Promise<{
                data: Array<{ amount: number }> | null;
                error: unknown;
              }>;
            };
          };
        };
      };
    }
  )
    .select('amount')
    .eq('user_id', userId)
    .eq('category', category)
    .gte('date', startOfMonth)
    .lte('date', endOfMonth);

  if (error || !expenses) return;

  const count = expenses.length;
  if (count < 3) return;

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const avgPerTransaction = total / count;

  if (avgPerTransaction < 100) {
    await notifyLeakDetected(category, total, count, avgPerTransaction);
  }
}

// ============ VERIFICAR E NOTIFICAR TODOS OS ALERTAS ============

export async function checkAndNotifyAlerts(
  budgets: Array<{
    id: string;
    name: string;
    spent: number;
    limit: number;
    notificationsEnabled: boolean;
  }>,
  overdueBills: Array<{
    id: string;
    description: string;
    amount: number;
    daysOverdue: number;
  }>,
  upcomingBills: Array<{
    id: string;
    description: string;
    amount: number;
    daysUntilDue: number;
  }>,
  creditCards: Array<{
    id: string;
    name: string;
    usedCredit: number;
    creditLimit: number;
  }>
): Promise<void> {
  // Verificar orçamentos
  for (const budget of budgets) {
    await notifyBudgetStatus(
      budget.id,
      budget.name,
      budget.spent,
      budget.limit,
      budget.notificationsEnabled
    );
  }

  // Verificar boletos vencidos
  for (const bill of overdueBills) {
    await notifyOverdueBill(
      bill.id,
      bill.description,
      bill.amount,
      bill.daysOverdue
    );
  }

  // Verificar boletos próximos do vencimento (até 2 dias)
  for (const bill of upcomingBills) {
    if (bill.daysUntilDue <= 2) {
      await notifyUpcomingBill(
        bill.id,
        bill.description,
        bill.amount,
        bill.daysUntilDue
      );
    }
  }

  // Verificar cartões de crédito
  for (const card of creditCards) {
    await notifyCreditCardLimit(
      card.id,
      card.name,
      card.usedCredit,
      card.creditLimit
    );
  }
}
