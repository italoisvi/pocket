import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type ActionLog = {
  id: string;
  user_id: string;
  session_id: string;
  tool_name: string;
  input_params: Record<string, unknown>;
  output_result: Record<string, unknown>;
  user_feedback: 'positive' | 'negative' | null;
  created_at: string;
};

type Pattern = {
  key: string;
  value: Record<string, unknown>;
  confidence: number;
};

// ============================================================================
// Pattern Extraction Functions
// ============================================================================

function extractCategorizationPatterns(actions: ActionLog[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Filter expense creation actions with positive feedback
  const expenseActions = actions.filter(
    (a) =>
      a.tool_name === 'create_expense' &&
      a.user_feedback === 'positive' &&
      a.input_params?.establishment_name &&
      a.output_result?.category
  );

  // Group by establishment name
  const establishmentCategories: Record<string, Record<string, number>> = {};

  for (const action of expenseActions) {
    const establishment = String(
      action.input_params.establishment_name
    ).toLowerCase();
    const category = String(action.output_result.category);

    if (!establishmentCategories[establishment]) {
      establishmentCategories[establishment] = {};
    }
    establishmentCategories[establishment][category] =
      (establishmentCategories[establishment][category] || 0) + 1;
  }

  // Create patterns for consistent categorizations
  for (const [establishment, categories] of Object.entries(
    establishmentCategories
  )) {
    const total = Object.values(categories).reduce(
      (sum, count) => sum + count,
      0
    );

    if (total >= 3) {
      // Need at least 3 occurrences
      const sortedCategories = Object.entries(categories).sort(
        ([, a], [, b]) => b - a
      );
      const [mostCommonCategory, mostCommonCount] = sortedCategories[0];
      const consistency = mostCommonCount / total;

      if (consistency >= 0.8) {
        // 80%+ consistency
        patterns.push({
          key: `category_preference_${establishment.replace(/\s+/g, '_')}`,
          value: {
            establishment,
            preferred_category: mostCommonCategory,
            occurrences: total,
            consistency,
            message: `${establishment} costuma ser categorizado como ${mostCommonCategory}`,
          },
          confidence: consistency,
        });
      }
    }
  }

  return patterns;
}

function extractTimePatterns(actions: ActionLog[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Analyze when user interacts with the agent
  const timeDistribution = new Array(24).fill(0);

  for (const action of actions) {
    if (action.user_feedback === 'positive') {
      const hour = new Date(action.created_at).getHours();
      timeDistribution[hour]++;
    }
  }

  const total = timeDistribution.reduce((sum, count) => sum + count, 0);
  if (total < 10) return patterns; // Need enough data

  // Find peak hours
  const maxHour = timeDistribution.indexOf(Math.max(...timeDistribution));
  const maxCount = timeDistribution[maxHour];
  const percentage = maxCount / total;

  if (percentage > 0.3) {
    // 30%+ usage in a single hour range
    const startHour = Math.max(0, maxHour - 1);
    const endHour = Math.min(23, maxHour + 1);

    patterns.push({
      key: 'preferred_usage_time',
      value: {
        peak_hour: maxHour,
        hour_range: [startHour, endHour],
        percentage,
        message: `Voce costuma usar o Walts por volta das ${maxHour}h`,
      },
      confidence: percentage,
    });
  }

  return patterns;
}

function extractBudgetPatterns(actions: ActionLog[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Analyze budget-related actions
  const budgetActions = actions.filter(
    (a) =>
      (a.tool_name === 'check_budget_status' ||
        a.tool_name === 'create_budget') &&
      a.user_feedback === 'positive'
  );

  if (budgetActions.length < 5) return patterns;

  // Check if user prefers certain alert thresholds
  const alertThresholds: number[] = [];
  for (const action of budgetActions) {
    if (action.input_params?.threshold) {
      alertThresholds.push(Number(action.input_params.threshold));
    }
  }

  if (alertThresholds.length >= 3) {
    const avgThreshold =
      alertThresholds.reduce((sum, t) => sum + t, 0) / alertThresholds.length;

    patterns.push({
      key: 'budget_alert_threshold',
      value: {
        preferred_threshold: Math.round(avgThreshold),
        sample_size: alertThresholds.length,
        message: `Voce prefere alertas de orcamento quando chega em ${Math.round(avgThreshold)}%`,
      },
      confidence: 0.7,
    });
  }

  return patterns;
}

function extractSpendingPatterns(actions: ActionLog[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Analyze expense patterns
  const expenseActions = actions.filter(
    (a) =>
      a.tool_name === 'create_expense' &&
      a.user_feedback === 'positive' &&
      a.input_params?.amount
  );

  if (expenseActions.length < 10) return patterns;

  // Calculate average expense amount
  const amounts = expenseActions.map((a) => Number(a.input_params.amount));
  const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
  const maxAmount = Math.max(...amounts);

  if (avgAmount > 0) {
    patterns.push({
      key: 'typical_expense_range',
      value: {
        average: Math.round(avgAmount * 100) / 100,
        max: maxAmount,
        count: amounts.length,
        message: `Seus gastos tipicos ficam em torno de R$ ${avgAmount.toFixed(2)}`,
      },
      confidence: 0.6,
    });
  }

  // Check for recurring expenses (same establishment, similar amounts)
  const recurringExpenses: Record<string, number[]> = {};
  for (const action of expenseActions) {
    const establishment = String(
      action.input_params.establishment_name || ''
    ).toLowerCase();
    if (establishment) {
      if (!recurringExpenses[establishment]) {
        recurringExpenses[establishment] = [];
      }
      recurringExpenses[establishment].push(Number(action.input_params.amount));
    }
  }

  for (const [establishment, expenseAmounts] of Object.entries(
    recurringExpenses
  )) {
    if (expenseAmounts.length >= 3) {
      const avg =
        expenseAmounts.reduce((sum, a) => sum + a, 0) / expenseAmounts.length;
      const variance =
        expenseAmounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) /
        expenseAmounts.length;
      const stdDev = Math.sqrt(variance);

      // Low variance means recurring similar expenses
      if (stdDev / avg < 0.2) {
        // Less than 20% deviation
        patterns.push({
          key: `recurring_expense_${establishment.replace(/\s+/g, '_')}`,
          value: {
            establishment,
            typical_amount: Math.round(avg * 100) / 100,
            frequency: expenseAmounts.length,
            message: `Voce costuma gastar cerca de R$ ${avg.toFixed(2)} em ${establishment}`,
          },
          confidence: 0.75,
        });
      }
    }
  }

  return patterns;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    console.log('[walts-learn] Starting learning process...');

    // Use service role key to access all users' data
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get all users with agent activity
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id');

    if (usersError) {
      console.error('[walts-learn] Error fetching users:', usersError);
      throw usersError;
    }

    console.log('[walts-learn] Processing', users?.length || 0, 'users');

    let totalPatterns = 0;
    const processedUsers: string[] = [];

    for (const user of users || []) {
      // Get actions with feedback for this user
      const { data: actions, error: actionsError } = await supabase
        .from('agent_actions_log')
        .select('*')
        .eq('user_id', user.id)
        .not('user_feedback', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (actionsError) {
        console.error(
          `[walts-learn] Error fetching actions for user ${user.id}:`,
          actionsError
        );
        continue;
      }

      if (!actions || actions.length < 5) {
        console.log(`[walts-learn] Skipping user ${user.id}: not enough data`);
        continue;
      }

      console.log(
        `[walts-learn] Processing ${actions.length} actions for user ${user.id}`
      );

      // Extract patterns
      const patterns: Pattern[] = [
        ...extractCategorizationPatterns(actions as ActionLog[]),
        ...extractTimePatterns(actions as ActionLog[]),
        ...extractBudgetPatterns(actions as ActionLog[]),
        ...extractSpendingPatterns(actions as ActionLog[]),
      ];

      console.log(
        `[walts-learn] Extracted ${patterns.length} patterns for user ${user.id}`
      );

      // Save patterns as insights
      for (const pattern of patterns) {
        const { error: upsertError } = await supabase
          .from('walts_memory')
          .upsert(
            {
              user_id: user.id,
              memory_type: 'insight',
              key: pattern.key,
              value: pattern.value,
              confidence: pattern.confidence,
              source: 'learning_system',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,memory_type,key' }
          );

        if (upsertError) {
          console.error(
            `[walts-learn] Error saving pattern ${pattern.key}:`,
            upsertError
          );
        } else {
          totalPatterns++;
        }
      }

      if (patterns.length > 0) {
        processedUsers.push(user.id);
      }
    }

    console.log('[walts-learn] Learning complete:', {
      usersProcessed: processedUsers.length,
      totalPatterns,
    });

    return new Response(
      JSON.stringify({
        success: true,
        usersProcessed: processedUsers.length,
        patternsExtracted: totalPatterns,
        timestamp: new Date().toISOString(),
      }),
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[walts-learn] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
