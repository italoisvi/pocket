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
  return { budgets: {}, bills: {} };
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
  // Resetar orçamentos no início do mês
  state.budgets = {};
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

// ============ NOTIFICAÇÕES DE SINCRONIZAÇÃO ============

export async function notifySyncCompleted(
  accountName: string,
  newTransactionsCount: number
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  let title = 'Conta sincronizada';
  let body =
    newTransactionsCount > 0
      ? `${accountName}: ${newTransactionsCount} nova(s) transação(ões) encontrada(s)`
      : `${accountName}: Saldo atualizado com sucesso`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'sync', accountName, newTransactionsCount },
    },
    trigger: null,
  });
}

// ============ NOTIFICAÇÕES MOTIVACIONAIS (A CADA 6H) ============

const MOTIVATIONAL_MESSAGES = [
  {
    title: 'Controle seus gastos',
    body: 'Já registrou seus gastos de hoje? Pequenos gastos somam grandes valores!',
  },
  {
    title: 'Dica de economia',
    body: 'Que tal revisar seus gastos do mês? Identificar padrões ajuda a economizar.',
  },
  {
    title: 'Momento de organização',
    body: 'Reserve 5 minutos para organizar suas finanças. Seu futuro agradece!',
  },
  {
    title: 'Fique no controle',
    body: 'Verifique se está dentro do orçamento. Prevenir é melhor que remediar!',
  },
  {
    title: 'Hora do check-in',
    body: 'Como estão suas finanças hoje? Abra o app e confira seu saldo.',
  },
  {
    title: 'Cuide do seu dinheiro',
    body: 'Gastos pequenos passam despercebidos. Registre tudo para ter controle total!',
  },
  {
    title: 'Meta do dia',
    body: 'Tente não fazer gastos desnecessários hoje. Cada economia conta!',
  },
  {
    title: 'Lembrete financeiro',
    body: 'Confira se todas as suas contas estão em dia. Evite juros e multas!',
  },
];

const SCHEDULED_NOTIFICATIONS_KEY = '@pocket_scheduled_notifications';

export async function scheduleMotivationalNotifications(): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  try {
    // Cancelar notificações motivacionais antigas
    const existingScheduled = await AsyncStorage.getItem(
      SCHEDULED_NOTIFICATIONS_KEY
    );
    if (existingScheduled) {
      const ids = JSON.parse(existingScheduled) as string[];
      for (const id of ids) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }

    const scheduledIds: string[] = [];

    // Agendar notificações para as próximas 24 horas (4 notificações de 6 em 6 horas)
    for (let i = 1; i <= 4; i++) {
      const message =
        MOTIVATIONAL_MESSAGES[
          Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)
        ];

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: message.title,
          body: message.body,
          data: { type: 'motivational' },
        },
        trigger: {
          seconds: i * 6 * 60 * 60, // 6, 12, 18, 24 horas
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
      });

      scheduledIds.push(id);
    }

    await AsyncStorage.setItem(
      SCHEDULED_NOTIFICATIONS_KEY,
      JSON.stringify(scheduledIds)
    );

    console.log(
      '[notifications] Scheduled',
      scheduledIds.length,
      'motivational notifications'
    );
  } catch (error) {
    console.error('[notifications] Error scheduling motivational:', error);
  }
}

// ============ INICIALIZAR NOTIFICAÇÕES PERIÓDICAS ============

export async function initializePeriodicNotifications(): Promise<void> {
  await scheduleMotivationalNotifications();
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
}
