import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Tipos de padrões que detectamos
type PatternType =
  | 'spending_habit'
  | 'favorite_place'
  | 'time_pattern'
  | 'seasonal'
  | 'payment_cycle'
  | 'category_trend'
  | 'anomaly_threshold';

type DetectedPattern = {
  pattern_type: PatternType;
  pattern_key: string;
  category?: string;
  pattern_value: Record<string, unknown>;
  confidence: number;
  occurrences: number;
};

serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers,
      });
    }

    // Cliente com service role para operações de escrita
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    console.log(`[detect-patterns] Starting analysis for user ${user.id}`);

    // Buscar gastos dos últimos 3 meses
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', threeMonthsAgo.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (expensesError) {
      console.error(
        '[detect-patterns] Error fetching expenses:',
        expensesError
      );
      return new Response(
        JSON.stringify({ error: 'Failed to fetch expenses' }),
        { status: 500, headers }
      );
    }

    if (!expenses || expenses.length < 5) {
      return new Response(
        JSON.stringify({
          message: 'Insufficient data for pattern detection',
          patterns_detected: 0,
        }),
        { headers }
      );
    }

    console.log(
      `[detect-patterns] Found ${expenses.length} expenses to analyze`
    );

    const detectedPatterns: DetectedPattern[] = [];

    // 1. Detectar gastos médios por categoria
    detectedPatterns.push(...detectCategoryAverages(expenses));

    // 2. Detectar estabelecimentos favoritos
    detectedPatterns.push(...detectFavoritePlaces(expenses));

    // 3. Detectar padrões de dia da semana
    detectedPatterns.push(...detectWeekdayPatterns(expenses));

    // 4. Detectar padrões de hora do dia (se tiver created_at)
    detectedPatterns.push(...detectTimeOfDayPatterns(expenses));

    // 5. Detectar ciclo de pagamento
    detectedPatterns.push(...detectPaymentCycle(expenses));

    // 6. Detectar tendências por categoria
    detectedPatterns.push(...detectCategoryTrends(expenses));

    // 7. Calcular limiares de anomalia
    detectedPatterns.push(...detectAnomalyThresholds(expenses));

    console.log(
      `[detect-patterns] Detected ${detectedPatterns.length} patterns`
    );

    // Salvar padrões no banco
    for (const pattern of detectedPatterns) {
      const { error: upsertError } = await supabase
        .from('user_financial_patterns')
        .upsert(
          {
            user_id: user.id,
            pattern_type: pattern.pattern_type,
            pattern_key: pattern.pattern_key,
            category: pattern.category || null,
            pattern_value: pattern.pattern_value,
            confidence: pattern.confidence,
            occurrences: pattern.occurrences,
            analysis_period_start: threeMonthsAgo.toISOString().split('T')[0],
            analysis_period_end: new Date().toISOString().split('T')[0],
            last_updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,pattern_type,pattern_key',
          }
        );

      if (upsertError) {
        console.error(
          `[detect-patterns] Error saving pattern ${pattern.pattern_key}:`,
          upsertError
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        patterns_detected: detectedPatterns.length,
        patterns: detectedPatterns.map((p) => ({
          type: p.pattern_type,
          key: p.pattern_key,
          category: p.category,
          confidence: p.confidence,
        })),
      }),
      { headers }
    );
  } catch (error) {
    console.error('[detect-patterns] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});

// ==================== ALGORITMOS DE DETECÇÃO ====================

function detectCategoryAverages(
  expenses: Array<{ category: string; amount: number; date: string }>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const categoryData: Record<
    string,
    { total: number; count: number; weeks: Set<string> }
  > = {};

  expenses.forEach((exp) => {
    const cat = exp.category || 'outros';
    if (!categoryData[cat]) {
      categoryData[cat] = { total: 0, count: 0, weeks: new Set() };
    }
    categoryData[cat].total += exp.amount;
    categoryData[cat].count += 1;

    // Calcular semana do gasto
    const date = new Date(exp.date);
    const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
    categoryData[cat].weeks.add(weekKey);
  });

  Object.entries(categoryData).forEach(([category, data]) => {
    if (data.count >= 3) {
      const avgPerTransaction = data.total / data.count;
      const weeksCount = data.weeks.size;
      const avgPerWeek = weeksCount > 0 ? data.total / weeksCount : data.total;

      patterns.push({
        pattern_type: 'spending_habit',
        pattern_key: `avg_spending_${category}`,
        category,
        pattern_value: {
          average_per_transaction: Math.round(avgPerTransaction * 100) / 100,
          average_per_week: Math.round(avgPerWeek * 100) / 100,
          total_transactions: data.count,
          total_amount: Math.round(data.total * 100) / 100,
        },
        confidence: Math.min(0.9, 0.5 + data.count * 0.05),
        occurrences: data.count,
      });
    }
  });

  return patterns;
}

function detectFavoritePlaces(
  expenses: Array<{
    establishment_name: string;
    amount: number;
    category: string;
  }>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const placeData: Record<
    string,
    { count: number; total: number; category: string }
  > = {};

  expenses.forEach((exp) => {
    const name = exp.establishment_name?.toLowerCase().trim();
    if (!name) return;

    if (!placeData[name]) {
      placeData[name] = { count: 0, total: 0, category: exp.category };
    }
    placeData[name].count += 1;
    placeData[name].total += exp.amount;
  });

  // Ordenar por frequência e pegar top 5
  const sortedPlaces = Object.entries(placeData)
    .filter(([_, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  sortedPlaces.forEach(([name, data], index) => {
    patterns.push({
      pattern_type: 'favorite_place',
      pattern_key: `favorite_${index + 1}_${name.replace(/\s+/g, '_').substring(0, 20)}`,
      category: data.category,
      pattern_value: {
        establishment_name: name,
        visit_count: data.count,
        total_spent: Math.round(data.total * 100) / 100,
        average_ticket: Math.round((data.total / data.count) * 100) / 100,
        rank: index + 1,
      },
      confidence: Math.min(0.95, 0.6 + data.count * 0.05),
      occurrences: data.count,
    });
  });

  return patterns;
}

function detectWeekdayPatterns(
  expenses: Array<{ date: string; amount: number }>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const weekdayData: Record<number, { count: number; total: number }> = {};

  // Inicializar todos os dias
  for (let i = 0; i < 7; i++) {
    weekdayData[i] = { count: 0, total: 0 };
  }

  expenses.forEach((exp) => {
    const date = new Date(exp.date);
    const dayOfWeek = date.getDay();
    weekdayData[dayOfWeek].count += 1;
    weekdayData[dayOfWeek].total += exp.amount;
  });

  // Calcular média geral
  const totalCount = Object.values(weekdayData).reduce(
    (s, d) => s + d.count,
    0
  );
  const totalAmount = Object.values(weekdayData).reduce(
    (s, d) => s + d.total,
    0
  );
  const avgPerDay = totalCount / 7;
  const avgAmountPerDay = totalAmount / 7;

  // Detectar dias com gastos significativamente maiores
  const dayNames = [
    'domingo',
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
  ];

  Object.entries(weekdayData).forEach(([day, data]) => {
    const dayNum = parseInt(day);
    if (data.count > avgPerDay * 1.3 || data.total > avgAmountPerDay * 1.3) {
      patterns.push({
        pattern_type: 'time_pattern',
        pattern_key: `high_spending_${dayNames[dayNum]}`,
        pattern_value: {
          day_of_week: dayNum,
          day_name: dayNames[dayNum],
          transaction_count: data.count,
          total_amount: Math.round(data.total * 100) / 100,
          average_amount:
            Math.round((data.total / Math.max(data.count, 1)) * 100) / 100,
          above_average_by: Math.round(
            (data.total / avgAmountPerDay - 1) * 100
          ),
        },
        confidence: 0.7,
        occurrences: data.count,
      });
    }
  });

  // Detectar padrão fim de semana vs dias úteis
  const weekendTotal = weekdayData[0].total + weekdayData[6].total;
  const weekdayTotal = totalAmount - weekendTotal;
  const weekendAvg = weekendTotal / 2;
  const weekdayAvg = weekdayTotal / 5;

  if (weekendAvg > weekdayAvg * 1.5) {
    patterns.push({
      pattern_type: 'time_pattern',
      pattern_key: 'weekend_spender',
      pattern_value: {
        weekend_average: Math.round(weekendAvg * 100) / 100,
        weekday_average: Math.round(weekdayAvg * 100) / 100,
        weekend_increase_percent: Math.round(
          (weekendAvg / weekdayAvg - 1) * 100
        ),
      },
      confidence: 0.8,
      occurrences: weekdayData[0].count + weekdayData[6].count,
    });
  }

  return patterns;
}

function detectTimeOfDayPatterns(
  expenses: Array<{ created_at: string; amount: number }>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const periodData: Record<string, { count: number; total: number }> = {
    morning: { count: 0, total: 0 }, // 6-12
    afternoon: { count: 0, total: 0 }, // 12-18
    evening: { count: 0, total: 0 }, // 18-22
    night: { count: 0, total: 0 }, // 22-6
  };

  expenses.forEach((exp) => {
    if (!exp.created_at) return;
    const hour = new Date(exp.created_at).getHours();

    let period: string;
    if (hour >= 6 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 18) period = 'afternoon';
    else if (hour >= 18 && hour < 22) period = 'evening';
    else period = 'night';

    periodData[period].count += 1;
    periodData[period].total += exp.amount;
  });

  // Encontrar período dominante
  const sortedPeriods = Object.entries(periodData).sort(
    (a, b) => b[1].count - a[1].count
  );

  if (sortedPeriods[0][1].count >= 5) {
    const [period, data] = sortedPeriods[0];
    const periodNames: Record<string, string> = {
      morning: 'manhã',
      afternoon: 'tarde',
      evening: 'noite',
      night: 'madrugada',
    };

    patterns.push({
      pattern_type: 'time_pattern',
      pattern_key: `peak_spending_${period}`,
      pattern_value: {
        period,
        period_name: periodNames[period],
        transaction_count: data.count,
        total_amount: Math.round(data.total * 100) / 100,
        percentage_of_total: Math.round(
          (data.count /
            Object.values(periodData).reduce((s, d) => s + d.count, 0)) *
            100
        ),
      },
      confidence: 0.7,
      occurrences: data.count,
    });
  }

  return patterns;
}

function detectPaymentCycle(
  expenses: Array<{ date: string; amount: number }>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Agrupar por semana do mês (1-7, 8-14, 15-21, 22-31)
  const weekData: Record<number, { count: number; total: number }> = {
    1: { count: 0, total: 0 },
    2: { count: 0, total: 0 },
    3: { count: 0, total: 0 },
    4: { count: 0, total: 0 },
  };

  expenses.forEach((exp) => {
    const day = new Date(exp.date).getDate();
    let week: number;
    if (day <= 7) week = 1;
    else if (day <= 14) week = 2;
    else if (day <= 21) week = 3;
    else week = 4;

    weekData[week].count += 1;
    weekData[week].total += exp.amount;
  });

  const totalAmount = Object.values(weekData).reduce((s, d) => s + d.total, 0);

  // Detectar se gasta mais na primeira semana (após receber salário)
  const firstWeekPercent = (weekData[1].total / totalAmount) * 100;
  if (firstWeekPercent > 35) {
    patterns.push({
      pattern_type: 'payment_cycle',
      pattern_key: 'first_week_spender',
      pattern_value: {
        first_week_percent: Math.round(firstWeekPercent),
        week_1_total: Math.round(weekData[1].total * 100) / 100,
        week_2_total: Math.round(weekData[2].total * 100) / 100,
        week_3_total: Math.round(weekData[3].total * 100) / 100,
        week_4_total: Math.round(weekData[4].total * 100) / 100,
      },
      confidence: 0.75,
      occurrences: weekData[1].count,
    });
  }

  return patterns;
}

function detectCategoryTrends(
  expenses: Array<{ date: string; amount: number; category: string }>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Agrupar por mês e categoria
  const monthlyData: Record<string, Record<string, number>> = {};

  expenses.forEach((exp) => {
    const monthKey = exp.date.substring(0, 7); // YYYY-MM
    const cat = exp.category || 'outros';

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {};
    }
    monthlyData[monthKey][cat] = (monthlyData[monthKey][cat] || 0) + exp.amount;
  });

  const months = Object.keys(monthlyData).sort();
  if (months.length < 2) return patterns;

  // Para cada categoria, verificar tendência
  const allCategories = new Set<string>();
  Object.values(monthlyData).forEach((m) =>
    Object.keys(m).forEach((c) => allCategories.add(c))
  );

  allCategories.forEach((category) => {
    const values = months.map((m) => monthlyData[m][category] || 0);

    // Verificar tendência de crescimento
    const firstHalf = values.slice(0, Math.ceil(values.length / 2));
    const secondHalf = values.slice(Math.ceil(values.length / 2));

    const firstAvg =
      firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length || 0;
    const secondAvg =
      secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length || 0;

    if (firstAvg > 0) {
      const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

      if (Math.abs(changePercent) > 20) {
        patterns.push({
          pattern_type: 'category_trend',
          pattern_key: `trend_${category}`,
          category,
          pattern_value: {
            trend: changePercent > 0 ? 'increasing' : 'decreasing',
            change_percent: Math.round(changePercent),
            first_period_avg: Math.round(firstAvg * 100) / 100,
            second_period_avg: Math.round(secondAvg * 100) / 100,
            months_analyzed: months.length,
          },
          confidence: Math.min(0.85, 0.5 + months.length * 0.1),
          occurrences: months.length,
        });
      }
    }
  });

  return patterns;
}

function detectAnomalyThresholds(
  expenses: Array<{ category: string; amount: number }>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const categoryAmounts: Record<string, number[]> = {};

  expenses.forEach((exp) => {
    const cat = exp.category || 'outros';
    if (!categoryAmounts[cat]) {
      categoryAmounts[cat] = [];
    }
    categoryAmounts[cat].push(exp.amount);
  });

  Object.entries(categoryAmounts).forEach(([category, amounts]) => {
    if (amounts.length < 5) return;

    // Calcular média e desvio padrão
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance =
      amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Limiar de anomalia = média + 2 * desvio padrão
    const anomalyThreshold = mean + 2 * stdDev;

    patterns.push({
      pattern_type: 'anomaly_threshold',
      pattern_key: `anomaly_${category}`,
      category,
      pattern_value: {
        mean: Math.round(mean * 100) / 100,
        std_dev: Math.round(stdDev * 100) / 100,
        anomaly_threshold: Math.round(anomalyThreshold * 100) / 100,
        sample_size: amounts.length,
        min: Math.min(...amounts),
        max: Math.max(...amounts),
      },
      confidence: Math.min(0.9, 0.5 + amounts.length * 0.02),
      occurrences: amounts.length,
    });
  });

  return patterns;
}
