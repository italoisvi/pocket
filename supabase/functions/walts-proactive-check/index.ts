import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type ActionCard = {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  actions: Array<{
    label: string;
    action: string;
    target?: string;
    params?: Record<string, unknown>;
  }>;
  dismissible: boolean;
  createdAt: string;
  expiresAt?: string;
};

type Alert = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// ============================================================================
// Helper Functions
// ============================================================================

function getMonthDateRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month, 1).toISOString().split('T')[0];
  const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

  return { start, end };
}

function getDayExpenses(
  expenses: Array<{ amount: number; date: string }>,
  dateStr: string
): number {
  return expenses
    .filter((e) => e.date === dateStr)
    .reduce((sum, e) => sum + e.amount, 0);
}

function getAverageDaily(
  expenses: Array<{ amount: number; date: string }>,
  days: number
): number {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const startStr = startDate.toISOString().split('T')[0];

  const filtered = expenses.filter((e) => e.date >= startStr);
  if (filtered.length === 0) return 0;

  const total = filtered.reduce((sum, e) => sum + e.amount, 0);
  return total / days;
}

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Proactive Checks
// ============================================================================

async function checkBudgets(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ActionCard[]> {
  const actions: ActionCard[] = [];
  const { start, end } = getMonthDateRange();

  // Get budgets
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id, category_id, amount, period_type')
    .eq('user_id', userId);

  if (!budgets || budgets.length === 0) return actions;

  // Get month expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount, category')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end);

  if (!expenses) return actions;

  for (const budget of budgets) {
    const categoryExpenses = expenses.filter(
      (e) => e.category === budget.category_id
    );
    const spent = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
    const limit = parseFloat(budget.amount);

    if (limit <= 0) continue;

    const percentage = (spent / limit) * 100;
    const remaining = limit - spent;

    // Alert at 80%+ usage
    if (percentage >= 80 && percentage < 100) {
      actions.push({
        id: `budget-warning-${budget.id}-${Date.now()}`,
        type: 'budget_alert',
        priority: 'high',
        title: `Orcamento de ${budget.category_id}`,
        message: `Voce ja usou ${percentage.toFixed(0)}% do orcamento. Restam R$ ${remaining.toFixed(2)}.`,
        actions: [
          {
            label: 'Ver orcamentos',
            action: 'navigate',
            target: '/orcamentos',
          },
          {
            label: 'Ajustar',
            action: 'navigate',
            target: `/budget/${budget.id}`,
          },
        ],
        dismissible: true,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Critical alert at 100%+
    if (percentage >= 100) {
      actions.push({
        id: `budget-exceeded-${budget.id}-${Date.now()}`,
        type: 'budget_alert',
        priority: 'high',
        title: `Orcamento estourado: ${budget.category_id}`,
        message: `Voce gastou R$ ${spent.toFixed(2)} de R$ ${limit.toFixed(2)} (${percentage.toFixed(0)}%).`,
        actions: [
          {
            label: 'Ver detalhes',
            action: 'navigate',
            target: '/orcamentos',
          },
        ],
        dismissible: true,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  return actions;
}

async function checkAnomalies(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ActionCard[]> {
  const actions: ActionCard[] = [];

  // Get expenses from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount, date')
    .eq('user_id', userId)
    .gte('date', thirtyDaysAgo);

  if (!expenses || expenses.length < 7) return actions; // Need at least a week of data

  const todaySpending = getDayExpenses(expenses, today);
  const avgDaily = getAverageDaily(expenses, 30);

  // Alert if spending is more than 2x average
  if (todaySpending > avgDaily * 2 && avgDaily > 0) {
    actions.push({
      id: `anomaly-high-${Date.now()}`,
      type: 'anomaly',
      priority: 'medium',
      title: 'Gasto acima do normal',
      message: `Hoje voce gastou R$ ${todaySpending.toFixed(2)}, o dobro da sua media diaria (R$ ${avgDaily.toFixed(2)}).`,
      actions: [
        {
          label: 'Ver gastos de hoje',
          action: 'navigate',
          target: '/(tabs)/home',
        },
      ],
      dismissible: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return actions;
}

async function checkOpenFinanceSync(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ActionCard[]> {
  const actions: ActionCard[] = [];

  // Get last sync date
  const { data: items } = await supabase
    .from('pluggy_items')
    .select('id, last_updated')
    .eq('user_id', userId)
    .order('last_updated', { ascending: false })
    .limit(1);

  if (!items || items.length === 0) return actions;

  const lastSync = items[0].last_updated;
  if (!lastSync) return actions;

  const days = daysSince(lastSync);

  // Suggest sync if more than 3 days
  if (days >= 3) {
    actions.push({
      id: `sync-suggestion-${Date.now()}`,
      type: 'sync_suggestion',
      priority: 'low',
      title: 'Sincronizar bancos',
      message: `Faz ${days} dias sem sincronizar. Quer atualizar seus dados bancarios?`,
      actions: [
        {
          label: 'Sincronizar agora',
          action: 'sync_open_finance',
          params: { days: 7 },
        },
        {
          label: 'Ver contas',
          action: 'navigate',
          target: '/(tabs)/open-finance',
        },
      ],
      dismissible: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return actions;
}

async function checkInsights(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ActionCard[]> {
  const actions: ActionCard[] = [];

  // Get insights from walts_memory
  const { data: insights } = await supabase
    .from('walts_memory')
    .select('key, value')
    .eq('user_id', userId)
    .eq('memory_type', 'insight')
    .order('confidence', { ascending: false })
    .limit(3);

  if (!insights || insights.length === 0) return actions;

  // Create action card for top insight if it hasn't been shown recently
  const topInsight = insights[0];
  if (topInsight && topInsight.value) {
    const insightValue =
      typeof topInsight.value === 'string'
        ? JSON.parse(topInsight.value)
        : topInsight.value;

    if (insightValue.message) {
      actions.push({
        id: `insight-${topInsight.key}-${Date.now()}`,
        type: 'insight',
        priority: 'low',
        title: 'Walts descobriu algo',
        message: insightValue.message,
        actions: [
          {
            label: 'Conversar com Walts',
            action: 'navigate',
            target: '/(tabs)/chat',
          },
        ],
        dismissible: true,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  return actions;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    console.log('[walts-proactive-check] Request received');

    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    console.log('[walts-proactive-check] Running checks for user:', user.id);

    // Check agent state to avoid running too frequently
    const { data: agentState } = await supabase
      .from('agent_state')
      .select('last_proactive_check')
      .eq('user_id', user.id)
      .single();

    if (agentState?.last_proactive_check) {
      const lastCheck = new Date(agentState.last_proactive_check);
      const minutesSince = (Date.now() - lastCheck.getTime()) / (1000 * 60);

      // Skip if checked less than 15 minutes ago
      if (minutesSince < 15) {
        console.log(
          '[walts-proactive-check] Skipping, last check was',
          minutesSince.toFixed(1),
          'minutes ago'
        );

        // Return empty but not error
        return new Response(
          JSON.stringify({ actions: [], alerts: [], cached: true }),
          { headers: CORS_HEADERS }
        );
      }
    }

    // Run all checks in parallel
    const [budgetActions, anomalyActions, syncActions, insightActions] =
      await Promise.all([
        checkBudgets(supabase, user.id),
        checkAnomalies(supabase, user.id),
        checkOpenFinanceSync(supabase, user.id),
        checkInsights(supabase, user.id),
      ]);

    const allActions = [
      ...budgetActions,
      ...anomalyActions,
      ...syncActions,
      ...insightActions,
    ];

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    allActions.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    // Limit to 5 actions
    const actions = allActions.slice(0, 5);

    // Generate alerts for high priority items
    const alerts: Alert[] = [];
    for (const action of actions.filter((a) => a.priority === 'high')) {
      alerts.push({
        title: action.title,
        body: action.message,
        data: { cardId: action.id, type: action.type },
      });
    }

    // Update last proactive check timestamp
    await supabase.from('agent_state').upsert(
      {
        user_id: user.id,
        last_proactive_check: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    console.log('[walts-proactive-check] Returning', actions.length, 'actions');

    return new Response(JSON.stringify({ actions, alerts }), {
      headers: CORS_HEADERS,
    });
  } catch (error) {
    console.error('[walts-proactive-check] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
