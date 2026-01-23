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
    // 1. Buscar transacoes do EXTRATO marcadas como custo fixo
    const { data: extractFixedCosts, error: extractError } = await supabase
      .from('transaction_categories')
      .select(
        `
        id,
        category,
        subcategory,
        is_fixed_cost,
        pluggy_transactions (
          description,
          amount,
          date
        )
      `
      )
      .eq('user_id', userId)
      .eq('is_fixed_cost', true);

    if (extractError) {
      console.error(
        '[recurring.listFixedCosts] Extract DB Error:',
        extractError
      );
    }

    // 2. Buscar gastos MANUAIS marcados como custo fixo
    const { data: manualFixedCosts, error: manualError } = await supabase
      .from('expenses')
      .select('id, establishment_name, amount, date, category, subcategory')
      .eq('user_id', userId)
      .eq('is_fixed_cost', true);

    if (manualError) {
      console.error('[recurring.listFixedCosts] Manual DB Error:', manualError);
    }

    // 3. Buscar padroes detectados como recorrentes
    const { data: patterns } = await supabase
      .from('user_financial_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('pattern_type', 'recurring_expense')
      .gte('confidence', 0.7);

    // Mapear custos fixos do extrato
    const extractCosts = (extractFixedCosts || []).map((fc) => ({
      id: fc.id,
      description: fc.pluggy_transactions?.description || 'Desconhecido',
      amount: Math.abs(fc.pluggy_transactions?.amount || 0),
      category: fc.category,
      subcategory: fc.subcategory,
      source: 'extrato' as const,
      type: 'confirmed' as const,
    }));

    // Mapear custos fixos manuais
    const manualCosts = (manualFixedCosts || []).map((exp) => ({
      id: exp.id,
      description: exp.establishment_name,
      amount: exp.amount,
      category: exp.category,
      subcategory: exp.subcategory,
      source: 'manual' as const,
      type: 'confirmed' as const,
    }));

    const confirmedFixedCosts = [...extractCosts, ...manualCosts];

    const estimatedFixedCosts = params.include_estimated
      ? (patterns || []).map((p) => ({
          id: p.id,
          description: p.pattern_key,
          amount: (p.pattern_value as { avg_amount?: number })?.avg_amount || 0,
          category: p.category || 'outros',
          subcategory: null,
          source: 'detectado' as const,
          confidence: Math.round(p.confidence * 100),
          type: 'estimated' as const,
        }))
      : [];

    const allCosts = [...confirmedFixedCosts, ...estimatedFixedCosts];
    const totalConfirmed = confirmedFixedCosts.reduce(
      (sum, c) => sum + c.amount,
      0
    );
    const totalEstimated = estimatedFixedCosts.reduce(
      (sum, c) => sum + c.amount,
      0
    );

    return {
      success: true,
      data: {
        fixedCosts: allCosts,
        summary: {
          confirmedCount: confirmedFixedCosts.length,
          fromExtract: extractCosts.length,
          fromManual: manualCosts.length,
          estimatedCount: estimatedFixedCosts.length,
          totalConfirmed,
          totalEstimated,
          grandTotal: totalConfirmed + totalEstimated,
        },
        message:
          allCosts.length === 0
            ? 'Nenhum custo fixo identificado ainda. Continue usando o app para que eu possa detectar seus gastos recorrentes.'
            : `Encontrei ${confirmedFixedCosts.length} custos fixos confirmados (${extractCosts.length} do extrato, ${manualCosts.length} manuais) totalizando R$ ${totalConfirmed.toFixed(2)}.`,
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

    // 1. Buscar gastos MANUAIS
    const { data: manualExpenses, error: manualError } = await supabase
      .from('expenses')
      .select('establishment_name, amount, date, category')
      .eq('user_id', userId)
      .gte('date', startDate)
      .order('date', { ascending: true });

    if (manualError) {
      console.error(
        '[recurring.detectRecurringExpenses] Manual DB Error:',
        manualError
      );
    }

    // 2. Buscar transacoes do EXTRATO
    const { data: accounts } = await supabase
      .from('pluggy_accounts')
      .select('id')
      .eq('user_id', userId);

    let extractExpenses: Array<{
      description: string;
      amount: number;
      date: string;
      category: string;
    }> = [];

    if (accounts && accounts.length > 0) {
      const accountIds = accounts.map((a: any) => a.id);

      // Buscar transacoes categorizadas
      const { data: categorizedTx } = await supabase
        .from('transaction_categories')
        .select(
          `
          category,
          pluggy_transactions!inner(
            description,
            amount,
            date,
            account_id,
            type
          )
        `
        )
        .eq('user_id', userId);

      if (categorizedTx) {
        extractExpenses = categorizedTx
          .filter((tx: any) => {
            const txDate = tx.pluggy_transactions?.date;
            const txAccountId = tx.pluggy_transactions?.account_id;
            const txType = tx.pluggy_transactions?.type;
            if (!txDate || !txAccountId) return false;
            if (!accountIds.includes(txAccountId)) return false;
            if (txType !== 'DEBIT') return false; // Apenas saidas
            return new Date(txDate) >= sixMonthsAgo;
          })
          .map((tx: any) => ({
            description: tx.pluggy_transactions.description,
            amount: Math.abs(tx.pluggy_transactions.amount),
            date: tx.pluggy_transactions.date,
            category: tx.category || 'outros',
          }));
      }
    }

    // Combinar gastos manuais e do extrato
    const allExpenses = [
      ...(manualExpenses || []).map((e) => ({
        name: e.establishment_name,
        amount: e.amount,
        date: e.date,
        category: e.category || 'outros',
        source: 'manual' as const,
      })),
      ...extractExpenses.map((e) => ({
        name: e.description,
        amount: e.amount,
        date: e.date,
        category: e.category,
        source: 'extrato' as const,
      })),
    ];

    if (allExpenses.length === 0) {
      return {
        success: true,
        data: {
          recurring: [],
          message: 'Nenhum gasto encontrado para analise.',
        },
      };
    }

    // Agrupar por nome normalizado e analisar recorrencia
    const byName: Record<
      string,
      {
        amounts: number[];
        dates: string[];
        category: string;
        sources: Set<string>;
      }
    > = {};

    for (const expense of allExpenses) {
      // Normalizar nome (remover numeros, espacos extras, etc.)
      const key = expense.name
        .toLowerCase()
        .replace(/[0-9]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!key || key.length < 3) continue; // Ignorar nomes muito curtos

      if (!byName[key]) {
        byName[key] = {
          amounts: [],
          dates: [],
          category: expense.category,
          sources: new Set(),
        };
      }
      byName[key].amounts.push(expense.amount);
      byName[key].dates.push(expense.date);
      byName[key].sources.add(expense.source);
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
      sources: string[];
    }> = [];

    for (const [name, data] of Object.entries(byName)) {
      const occurrences = data.amounts.length;
      if (occurrences < minOccurrences) continue;

      // Calcular meses unicos
      const uniqueMonths = new Set(data.dates.map((d) => d.substring(0, 7)))
        .size;

      if (uniqueMonths < minMonths) continue;

      // Calcular media e variancia dos valores
      const avgAmount =
        data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const variance =
        data.amounts.reduce(
          (sum, val) => sum + Math.pow(val - avgAmount, 2),
          0
        ) / data.amounts.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = avgAmount > 0 ? stdDev / avgAmount : 1;

      // Alta confianca se valores sao consistentes
      const valueConsistency = 1 - Math.min(coefficientOfVariation, 1);
      const frequencyScore = Math.min(uniqueMonths / 6, 1);
      const confidence = valueConsistency * 0.6 + frequencyScore * 0.4;

      // Detectar se parece assinatura (valores muito proximos)
      const isSubscription = coefficientOfVariation < 0.1;

      recurring.push({
        establishment: name.charAt(0).toUpperCase() + name.slice(1),
        avgAmount: Math.round(avgAmount * 100) / 100,
        occurrences,
        monthsPresent: uniqueMonths,
        category: data.category,
        confidence: Math.round(confidence * 100),
        isSubscription,
        sources: Array.from(data.sources),
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
        totalSubscriptionsAmount: subscriptions.reduce(
          (sum, s) => sum + s.avgAmount,
          0
        ),
        totalRecurringAmount: recurring.reduce(
          (sum, r) => sum + r.avgAmount,
          0
        ),
        analyzedExpenses: {
          manual: (manualExpenses || []).length,
          extract: extractExpenses.length,
          total: allExpenses.length,
        },
        message:
          recurring.length === 0
            ? 'Nenhum gasto recorrente detectado com os criterios especificados.'
            : `Encontrei ${subscriptions.length} possiveis assinaturas e ${otherRecurring.length} outros gastos recorrentes (analisando ${allExpenses.length} transacoes).`,
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
    // 1. Buscar custos fixos do EXTRATO (transaction_categories)
    const { data: extractFixedCosts } = await supabase
      .from('transaction_categories')
      .select(
        `
        category,
        pluggy_transactions (
          amount
        )
      `
      )
      .eq('user_id', userId)
      .eq('is_fixed_cost', true);

    // 2. Buscar custos fixos MANUAIS (expenses)
    const { data: manualFixedCosts } = await supabase
      .from('expenses')
      .select('category, amount')
      .eq('user_id', userId)
      .eq('is_fixed_cost', true);

    // 3. Buscar padroes recorrentes detectados
    const { data: patterns } = await supabase
      .from('user_financial_patterns')
      .select('category, pattern_value, confidence')
      .eq('user_id', userId)
      .eq('pattern_type', 'recurring_expense')
      .gte('confidence', 0.7);

    // Calcular totais por categoria - EXTRATO
    const extractByCategory: Record<string, number> = {};
    let totalExtract = 0;

    for (const fc of extractFixedCosts || []) {
      const amount = Math.abs(fc.pluggy_transactions?.amount || 0);
      const category = fc.category || 'outros';
      extractByCategory[category] = (extractByCategory[category] || 0) + amount;
      totalExtract += amount;
    }

    // Calcular totais por categoria - MANUAL
    const manualByCategory: Record<string, number> = {};
    let totalManual = 0;

    for (const exp of manualFixedCosts || []) {
      const amount = exp.amount || 0;
      const category = exp.category || 'outros';
      manualByCategory[category] = (manualByCategory[category] || 0) + amount;
      totalManual += amount;
    }

    // Calcular totais por categoria - ESTIMADO (padroes)
    const estimatedByCategory: Record<string, number> = {};
    let totalEstimated = 0;

    for (const p of patterns || []) {
      const amount =
        (p.pattern_value as { avg_amount?: number })?.avg_amount || 0;
      const category = p.category || 'outros';
      estimatedByCategory[category] =
        (estimatedByCategory[category] || 0) + amount;
      totalEstimated += amount;
    }

    // Combinar todas as categorias
    const allCategories = new Set([
      ...Object.keys(extractByCategory),
      ...Object.keys(manualByCategory),
      ...Object.keys(estimatedByCategory),
    ]);

    const byCategory = Array.from(allCategories).map((category) => {
      const extract = extractByCategory[category] || 0;
      const manual = manualByCategory[category] || 0;
      const estimated = estimatedByCategory[category] || 0;
      return {
        category,
        fromExtract: extract,
        fromManual: manual,
        confirmed: extract + manual,
        estimated,
        total: extract + manual + estimated,
      };
    });

    byCategory.sort((a, b) => b.total - a.total);

    const totalConfirmed = totalExtract + totalManual;
    const grandTotal = totalConfirmed + totalEstimated;

    return {
      success: true,
      data: {
        byCategory,
        summary: {
          totalFromExtract: totalExtract,
          totalFromManual: totalManual,
          totalConfirmed,
          totalEstimated,
          grandTotal,
          percentOfIncome: null, // Seria calculado com contexto de renda
        },
        insights: [
          grandTotal > 0
            ? `Seus custos fixos somam aproximadamente R$ ${grandTotal.toFixed(2)} por mes.`
            : 'Nenhum custo fixo identificado ainda.',
          totalConfirmed > 0
            ? `Desse total, R$ ${totalConfirmed.toFixed(2)} sao confirmados (${(extractFixedCosts || []).length} do extrato, ${(manualFixedCosts || []).length} manuais).`
            : '',
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
