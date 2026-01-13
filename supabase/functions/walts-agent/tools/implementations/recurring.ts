import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../../types.ts';

type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

type ToolContext = {
  userId: UserId;
  supabase: SupabaseClient;
};

// ============================================================================
// list_fixed_costs - Lista custos fixos identificados
// ============================================================================

type ListFixedCostsParams = {
  include_estimated?: boolean;
};

export async function listFixedCosts(
  params: ListFixedCostsParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar transacoes marcadas como custo fixo
    const { data: fixedCosts, error } = await supabase
      .from('transaction_categories')
      .select(`
        id,
        category,
        subcategory,
        is_fixed_cost,
        pluggy_transactions (
          description,
          amount,
          date
        )
      `)
      .eq('user_id', userId)
      .eq('is_fixed_cost', true);

    if (error) {
      console.error('[recurring.listFixedCosts] DB Error:', error);
      return { success: false, error: 'Erro ao buscar custos fixos' };
    }

    // Tambem buscar padroes detectados como recorrentes
    const { data: patterns } = await supabase
      .from('user_financial_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('pattern_type', 'recurring_expense')
      .gte('confidence', 0.7);

    const confirmedFixedCosts = (fixedCosts || []).map((fc) => ({
      id: fc.id,
      description: fc.pluggy_transactions?.description || 'Desconhecido',
      amount: Math.abs(fc.pluggy_transactions?.amount || 0),
      category: fc.category,
      subcategory: fc.subcategory,
      type: 'confirmed' as const,
    }));

    const estimatedFixedCosts = params.include_estimated
      ? (patterns || []).map((p) => ({
          id: p.id,
          description: p.pattern_key,
          amount: (p.pattern_value as { avg_amount?: number })?.avg_amount || 0,
          category: p.category || 'outros',
          confidence: Math.round(p.confidence * 100),
          type: 'estimated' as const,
        }))
      : [];

    const allCosts = [...confirmedFixedCosts, ...estimatedFixedCosts];
    const totalConfirmed = confirmedFixedCosts.reduce((sum, c) => sum + c.amount, 0);
    const totalEstimated = estimatedFixedCosts.reduce((sum, c) => sum + c.amount, 0);

    return {
      success: true,
      data: {
        fixedCosts: allCosts,
        summary: {
          confirmedCount: confirmedFixedCosts.length,
          estimatedCount: estimatedFixedCosts.length,
          totalConfirmed,
          totalEstimated,
          grandTotal: totalConfirmed + totalEstimated,
        },
        message:
          allCosts.length === 0
            ? 'Nenhum custo fixo identificado ainda. Continue usando o app para que eu possa detectar seus gastos recorrentes.'
            : undefined,
      },
    };
  } catch (error) {
    console.error('[recurring.listFixedCosts] Error:', error);
    return { success: false, error: 'Erro ao buscar custos fixos' };
  }
}

// ============================================================================
// detect_recurring_expenses - Detecta gastos recorrentes
// ============================================================================

type DetectRecurringExpensesParams = {
  min_occurrences?: number;
  min_months?: number;
};

export async function detectRecurringExpenses(
  params: DetectRecurringExpensesParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const minOccurrences = params.min_occurrences || 2;
  const minMonths = params.min_months || 2;

  try {
    // Buscar gastos dos ultimos 6 meses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];

    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('establishment_name, amount, date, category')
      .eq('user_id', userId)
      .gte('date', startDate)
      .order('date', { ascending: true });

    if (error) {
      console.error('[recurring.detectRecurringExpenses] DB Error:', error);
      return { success: false, error: 'Erro ao buscar gastos' };
    }

    if (!expenses || expenses.length === 0) {
      return {
        success: true,
        data: {
          recurring: [],
          message: 'Nenhum gasto encontrado para analise.',
        },
      };
    }

    // Agrupar por estabelecimento e analisar recorrencia
    const byEstablishment: Record<
      string,
      { amounts: number[]; dates: string[]; category: string }
    > = {};

    for (const expense of expenses) {
      const key = expense.establishment_name.toLowerCase().trim();
      if (!byEstablishment[key]) {
        byEstablishment[key] = {
          amounts: [],
          dates: [],
          category: expense.category || 'outros',
        };
      }
      byEstablishment[key].amounts.push(expense.amount);
      byEstablishment[key].dates.push(expense.date);
    }

    // Identificar padroes recorrentes
    const recurring: Array<{
      establishment: string;
      avgAmount: number;
      occurrences: number;
      monthsPresent: number;
      category: string;
      confidence: number;
      isSubscription: boolean;
    }> = [];

    for (const [establishment, data] of Object.entries(byEstablishment)) {
      const occurrences = data.amounts.length;
      if (occurrences < minOccurrences) continue;

      // Calcular meses unicos
      const uniqueMonths = new Set(
        data.dates.map((d) => d.substring(0, 7))
      ).size;

      if (uniqueMonths < minMonths) continue;

      // Calcular media e variancia dos valores
      const avgAmount =
        data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const variance =
        data.amounts.reduce((sum, val) => sum + Math.pow(val - avgAmount, 2), 0) /
        data.amounts.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / avgAmount;

      // Alta confianca se valores sao consistentes
      const valueConsistency = 1 - Math.min(coefficientOfVariation, 1);
      const frequencyScore = Math.min(uniqueMonths / 6, 1);
      const confidence = (valueConsistency * 0.6 + frequencyScore * 0.4);

      // Detectar se parece assinatura (valores muito proximos)
      const isSubscription = coefficientOfVariation < 0.1;

      recurring.push({
        establishment: establishment.charAt(0).toUpperCase() + establishment.slice(1),
        avgAmount: Math.round(avgAmount * 100) / 100,
        occurrences,
        monthsPresent: uniqueMonths,
        category: data.category,
        confidence: Math.round(confidence * 100),
        isSubscription,
      });
    }

    // Ordenar por confianca
    recurring.sort((a, b) => b.confidence - a.confidence);

    // Separar assinaturas de outros recorrentes
    const subscriptions = recurring.filter((r) => r.isSubscription);
    const otherRecurring = recurring.filter((r) => !r.isSubscription);

    return {
      success: true,
      data: {
        subscriptions,
        otherRecurring,
        total: recurring.length,
        totalSubscriptionsAmount: subscriptions.reduce((sum, s) => sum + s.avgAmount, 0),
        totalRecurringAmount: recurring.reduce((sum, r) => sum + r.avgAmount, 0),
        message:
          recurring.length === 0
            ? 'Nenhum gasto recorrente detectado com os criterios especificados.'
            : `Encontrei ${subscriptions.length} possiveis assinaturas e ${otherRecurring.length} outros gastos recorrentes.`,
      },
    };
  } catch (error) {
    console.error('[recurring.detectRecurringExpenses] Error:', error);
    return { success: false, error: 'Erro ao detectar gastos recorrentes' };
  }
}

// ============================================================================
// calculate_fixed_costs_total - Calcula total de custos fixos
// ============================================================================

type CalculateFixedCostsTotalParams = {
  group_by?: 'category' | 'type';
};

export async function calculateFixedCostsTotal(
  params: CalculateFixedCostsTotalParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar custos fixos confirmados
    const { data: fixedCosts } = await supabase
      .from('transaction_categories')
      .select(`
        category,
        pluggy_transactions (
          amount
        )
      `)
      .eq('user_id', userId)
      .eq('is_fixed_cost', true);

    // Buscar padroes recorrentes detectados
    const { data: patterns } = await supabase
      .from('user_financial_patterns')
      .select('category, pattern_value, confidence')
      .eq('user_id', userId)
      .eq('pattern_type', 'recurring_expense')
      .gte('confidence', 0.7);

    // Calcular totais
    const confirmedByCategory: Record<string, number> = {};
    let totalConfirmed = 0;

    for (const fc of fixedCosts || []) {
      const amount = Math.abs(fc.pluggy_transactions?.amount || 0);
      const category = fc.category || 'outros';
      confirmedByCategory[category] = (confirmedByCategory[category] || 0) + amount;
      totalConfirmed += amount;
    }

    const estimatedByCategory: Record<string, number> = {};
    let totalEstimated = 0;

    for (const p of patterns || []) {
      const amount = (p.pattern_value as { avg_amount?: number })?.avg_amount || 0;
      const category = p.category || 'outros';
      estimatedByCategory[category] = (estimatedByCategory[category] || 0) + amount;
      totalEstimated += amount;
    }

    // Combinar categorias
    const allCategories = new Set([
      ...Object.keys(confirmedByCategory),
      ...Object.keys(estimatedByCategory),
    ]);

    const byCategory = Array.from(allCategories).map((category) => ({
      category,
      confirmed: confirmedByCategory[category] || 0,
      estimated: estimatedByCategory[category] || 0,
      total: (confirmedByCategory[category] || 0) + (estimatedByCategory[category] || 0),
    }));

    byCategory.sort((a, b) => b.total - a.total);

    const grandTotal = totalConfirmed + totalEstimated;

    return {
      success: true,
      data: {
        byCategory,
        summary: {
          totalConfirmed,
          totalEstimated,
          grandTotal,
          percentOfIncome: null, // Seria calculado com contexto de renda
        },
        insights: [
          grandTotal > 0
            ? `Seus custos fixos somam aproximadamente R$ ${grandTotal.toFixed(2)} por mes.`
            : 'Nenhum custo fixo identificado ainda.',
          byCategory.length > 0
            ? `A maior parte vai para ${byCategory[0].category} (R$ ${byCategory[0].total.toFixed(2)}).`
            : '',
        ].filter(Boolean),
      },
    };
  } catch (error) {
    console.error('[recurring.calculateFixedCostsTotal] Error:', error);
    return { success: false, error: 'Erro ao calcular custos fixos' };
  }
}
