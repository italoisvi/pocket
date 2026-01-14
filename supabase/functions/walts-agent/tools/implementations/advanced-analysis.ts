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
// generate_raio_x - Gera analise Raio-X Financeiro completa
// ============================================================================

type GenerateRaioXParams = {
  period?: 'current_month' | 'last_month' | 'last_3_months';
  include_predictions?: boolean;
};

export async function generateRaioX(
  params: GenerateRaioXParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const period = params.period || 'current_month';

  try {
    // Calcular datas baseado no periodo
    const now = new Date();
    let startDate: string;
    let endDate: string = now.toISOString().split('T')[0];

    switch (period) {
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          .toISOString()
          .split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth(), 0)
          .toISOString()
          .split('T')[0];
        break;
      case 'last_3_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1)
          .toISOString()
          .split('T')[0];
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split('T')[0];
    }

    // Buscar dados
    const [profileResult, expensesResult, budgetsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, income_cards')
        .eq('id', userId)
        .single(),
      supabase
        .from('expenses')
        .select('establishment_name, amount, date, category')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false }),
      supabase.from('budgets').select('*').eq('user_id', userId),
    ]);

    const expenses = expensesResult.data || [];
    const budgets = budgetsResult.data || [];

    // Calcular metricas
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Parse income cards
    const incomeCards = profileResult.data?.income_cards || [];
    let totalIncome = 0;
    for (const card of incomeCards) {
      if (card.salary) {
        const cleanSalary = card.salary.replace(/\./g, '').replace(',', '.');
        totalIncome += parseFloat(cleanSalary) || 0;
      }
    }

    // Agrupar por categoria
    const byCategory: Record<string, { total: number; count: number }> = {};
    for (const expense of expenses) {
      const cat = expense.category || 'outros';
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, count: 0 };
      }
      byCategory[cat].total += expense.amount;
      byCategory[cat].count++;
    }

    const categoryBreakdown = Object.entries(byCategory)
      .map(([category, data]) => ({
        category,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
        percent:
          totalExpenses > 0
            ? Math.round((data.total / totalExpenses) * 100)
            : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Top gastos
    const topExpenses = [...expenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((e) => ({
        establishment: e.establishment_name,
        amount: e.amount,
        category: e.category,
        date: e.date,
      }));

    // Status dos orcamentos
    const budgetStatus = budgets.map((b) => {
      const categoryExpenses = expenses.filter(
        (e) => e.category === b.category_id
      );
      const spent = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
      const limit = parseFloat(b.amount);
      return {
        category: b.category_id,
        limit,
        spent,
        remaining: Math.max(0, limit - spent),
        percentUsed: limit > 0 ? Math.round((spent / limit) * 100) : 0,
      };
    });

    // Calcular previsao se solicitado
    let prediction = null;
    if (params.include_predictions && period === 'current_month') {
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).getDate();
      const dailyAverage = totalExpenses / dayOfMonth;
      const projectedTotal = dailyAverage * daysInMonth;

      prediction = {
        dailyAverage: Math.round(dailyAverage * 100) / 100,
        projectedMonthTotal: Math.round(projectedTotal * 100) / 100,
        willExceedIncome: projectedTotal > totalIncome,
        projectedSavings:
          Math.round((totalIncome - projectedTotal) * 100) / 100,
      };
    }

    // Gerar insights
    const insights: string[] = [];
    const savingsRate =
      totalIncome > 0
        ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)
        : 0;

    if (savingsRate < 0) {
      insights.push(
        `Atencao: gastos excedem a renda em ${Math.abs(savingsRate)}%.`
      );
    } else if (savingsRate < 10) {
      insights.push(`Taxa de economia baixa: apenas ${savingsRate}% da renda.`);
    } else if (savingsRate >= 20) {
      insights.push(`Otimo! Voce esta economizando ${savingsRate}% da renda.`);
    }

    if (categoryBreakdown.length > 0) {
      const topCategory = categoryBreakdown[0];
      insights.push(
        `Maior categoria de gastos: ${topCategory.category} (${topCategory.percent}% do total).`
      );
    }

    const exceededBudgets = budgetStatus.filter((b) => b.percentUsed >= 100);
    if (exceededBudgets.length > 0) {
      insights.push(
        `${exceededBudgets.length} orcamento(s) estourado(s): ${exceededBudgets.map((b) => b.category).join(', ')}.`
      );
    }

    // Salvar analise no banco
    const analysisContent = {
      period,
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      savingsRate,
      categoryBreakdown,
      topExpenses,
      budgetStatus,
      prediction,
      insights,
    };

    await supabase.from('walts_analyses').insert({
      user_id: userId,
      analysis_type: 'raio_x_financeiro',
      content: JSON.stringify(analysisContent),
      context_data: { period, startDate, endDate },
    });

    return {
      success: true,
      data: {
        ...analysisContent,
        message: `Raio-X Financeiro gerado para ${period === 'current_month' ? 'mes atual' : period === 'last_month' ? 'mes passado' : 'ultimos 3 meses'}.`,
      },
    };
  } catch (error) {
    console.error('[advanced-analysis.generateRaioX] Error:', error);
    return { success: false, error: 'Erro ao gerar Raio-X Financeiro' };
  }
}

// ============================================================================
// compare_periods - Compara gastos entre dois periodos
// ============================================================================

type ComparePeriodsParams = {
  period1: string; // YYYY-MM
  period2: string; // YYYY-MM
  categories?: string[];
};

export async function comparePeriods(
  params: ComparePeriodsParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Calcular datas para cada periodo
    const [year1, month1] = params.period1.split('-').map(Number);
    const [year2, month2] = params.period2.split('-').map(Number);

    const start1 = new Date(year1, month1 - 1, 1).toISOString().split('T')[0];
    const end1 = new Date(year1, month1, 0).toISOString().split('T')[0];
    const start2 = new Date(year2, month2 - 1, 1).toISOString().split('T')[0];
    const end2 = new Date(year2, month2, 0).toISOString().split('T')[0];

    // Buscar gastos de ambos periodos
    const [expenses1Result, expenses2Result] = await Promise.all([
      supabase
        .from('expenses')
        .select('amount, category')
        .eq('user_id', userId)
        .gte('date', start1)
        .lte('date', end1),
      supabase
        .from('expenses')
        .select('amount, category')
        .eq('user_id', userId)
        .gte('date', start2)
        .lte('date', end2),
    ]);

    let expenses1 = expenses1Result.data || [];
    let expenses2 = expenses2Result.data || [];

    // Filtrar por categorias se especificado
    if (params.categories && params.categories.length > 0) {
      expenses1 = expenses1.filter((e) =>
        params.categories!.includes(e.category || 'outros')
      );
      expenses2 = expenses2.filter((e) =>
        params.categories!.includes(e.category || 'outros')
      );
    }

    // Calcular totais
    const total1 = expenses1.reduce((sum, e) => sum + e.amount, 0);
    const total2 = expenses2.reduce((sum, e) => sum + e.amount, 0);
    const difference = total2 - total1;
    const percentChange =
      total1 > 0 ? Math.round((difference / total1) * 100) : 0;

    // Agrupar por categoria para comparacao detalhada
    const byCategory1: Record<string, number> = {};
    const byCategory2: Record<string, number> = {};

    for (const e of expenses1) {
      const cat = e.category || 'outros';
      byCategory1[cat] = (byCategory1[cat] || 0) + e.amount;
    }

    for (const e of expenses2) {
      const cat = e.category || 'outros';
      byCategory2[cat] = (byCategory2[cat] || 0) + e.amount;
    }

    // Combinar categorias
    const allCategories = new Set([
      ...Object.keys(byCategory1),
      ...Object.keys(byCategory2),
    ]);

    const categoryComparison = Array.from(allCategories)
      .map((category) => {
        const val1 = byCategory1[category] || 0;
        const val2 = byCategory2[category] || 0;
        const diff = val2 - val1;
        return {
          category,
          period1Amount: Math.round(val1 * 100) / 100,
          period2Amount: Math.round(val2 * 100) / 100,
          difference: Math.round(diff * 100) / 100,
          percentChange:
            val1 > 0 ? Math.round((diff / val1) * 100) : val2 > 0 ? 100 : 0,
        };
      })
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    // Gerar insights
    const insights: string[] = [];

    if (difference > 0) {
      insights.push(
        `Gastou R$ ${difference.toFixed(2)} a mais em ${params.period2} comparado a ${params.period1} (${percentChange > 0 ? '+' : ''}${percentChange}%).`
      );
    } else if (difference < 0) {
      insights.push(
        `Economizou R$ ${Math.abs(difference).toFixed(2)} em ${params.period2} comparado a ${params.period1} (${percentChange}%).`
      );
    } else {
      insights.push('Gastos praticamente iguais entre os periodos.');
    }

    const biggestIncrease = categoryComparison.find((c) => c.difference > 0);
    const biggestDecrease = categoryComparison.find((c) => c.difference < 0);

    if (biggestIncrease && biggestIncrease.difference > 50) {
      insights.push(
        `Maior aumento: ${biggestIncrease.category} (+R$ ${biggestIncrease.difference.toFixed(2)}).`
      );
    }

    if (biggestDecrease && biggestDecrease.difference < -50) {
      insights.push(
        `Maior economia: ${biggestDecrease.category} (-R$ ${Math.abs(biggestDecrease.difference).toFixed(2)}).`
      );
    }

    return {
      success: true,
      data: {
        period1: {
          period: params.period1,
          total: Math.round(total1 * 100) / 100,
          transactionCount: expenses1.length,
        },
        period2: {
          period: params.period2,
          total: Math.round(total2 * 100) / 100,
          transactionCount: expenses2.length,
        },
        comparison: {
          difference: Math.round(difference * 100) / 100,
          percentChange,
          direction:
            difference > 0
              ? 'increase'
              : difference < 0
                ? 'decrease'
                : 'stable',
        },
        categoryComparison,
        insights,
      },
    };
  } catch (error) {
    console.error('[advanced-analysis.comparePeriods] Error:', error);
    return { success: false, error: 'Erro ao comparar periodos' };
  }
}

// ============================================================================
// forecast_month_end - Projecao de fim de mes
// ============================================================================

export async function forecastMonthEnd(
  _params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const today = now.toISOString().split('T')[0];

    // Buscar gastos do mes atual e perfil
    const [expensesResult, profileResult] = await Promise.all([
      supabase
        .from('expenses')
        .select('amount, date, category')
        .eq('user_id', userId)
        .gte('date', monthStart)
        .lte('date', today),
      supabase
        .from('profiles')
        .select('income_cards')
        .eq('id', userId)
        .single(),
    ]);

    const expenses = expensesResult.data || [];
    const totalSpentSoFar = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Parse renda
    const incomeCards = profileResult.data?.income_cards || [];
    let totalIncome = 0;
    for (const card of incomeCards) {
      if (card.salary) {
        const cleanSalary = card.salary.replace(/\./g, '').replace(',', '.');
        totalIncome += parseFloat(cleanSalary) || 0;
      }
    }

    // Calcular projecoes
    const dailyAverage = dayOfMonth > 0 ? totalSpentSoFar / dayOfMonth : 0;
    const projectedTotal = dailyAverage * daysInMonth;
    const projectedRemaining = dailyAverage * daysRemaining;
    const projectedBalance = totalIncome - projectedTotal;
    const currentBalance = totalIncome - totalSpentSoFar;

    // Projecao por categoria
    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category || 'outros';
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    }

    const categoryProjections = Object.entries(byCategory)
      .map(([category, spent]) => {
        const catDailyAvg = spent / dayOfMonth;
        const catProjected = catDailyAvg * daysInMonth;
        return {
          category,
          spentSoFar: Math.round(spent * 100) / 100,
          projectedTotal: Math.round(catProjected * 100) / 100,
          dailyAverage: Math.round(catDailyAvg * 100) / 100,
        };
      })
      .sort((a, b) => b.projectedTotal - a.projectedTotal);

    // Gerar insights e alertas
    const insights: string[] = [];
    const alerts: string[] = [];

    if (projectedBalance < 0) {
      alerts.push(
        `Atencao: No ritmo atual, voce terminara o mes com saldo negativo de R$ ${Math.abs(projectedBalance).toFixed(2)}.`
      );
    } else if (projectedBalance < totalIncome * 0.1) {
      alerts.push(
        `Cuidado: Projecao de economia baixa (menos de 10% da renda).`
      );
    }

    const savingsRate =
      totalIncome > 0 ? Math.round((projectedBalance / totalIncome) * 100) : 0;

    insights.push(`Media diaria de gastos: R$ ${dailyAverage.toFixed(2)}.`);
    insights.push(
      `Projecao de gastos ate fim do mes: R$ ${projectedTotal.toFixed(2)}.`
    );

    if (projectedBalance >= 0) {
      insights.push(
        `Projecao de economia: R$ ${projectedBalance.toFixed(2)} (${savingsRate}% da renda).`
      );
    }

    // Sugestao de meta diaria
    const idealDailyBudget =
      daysRemaining > 0 ? currentBalance / daysRemaining : 0;

    return {
      success: true,
      data: {
        currentStatus: {
          dayOfMonth,
          daysRemaining,
          totalSpentSoFar: Math.round(totalSpentSoFar * 100) / 100,
          currentBalance: Math.round(currentBalance * 100) / 100,
          dailyAverage: Math.round(dailyAverage * 100) / 100,
        },
        projection: {
          projectedMonthTotal: Math.round(projectedTotal * 100) / 100,
          projectedRemainingSpend: Math.round(projectedRemaining * 100) / 100,
          projectedEndBalance: Math.round(projectedBalance * 100) / 100,
          projectedSavingsRate: savingsRate,
        },
        recommendation: {
          idealDailyBudget: Math.round(idealDailyBudget * 100) / 100,
          message:
            idealDailyBudget > 0
              ? `Para manter saldo positivo, gaste no maximo R$ ${idealDailyBudget.toFixed(2)} por dia.`
              : 'Atencao: saldo ja esta negativo.',
        },
        categoryProjections: categoryProjections.slice(0, 5),
        alerts,
        insights,
      },
    };
  } catch (error) {
    console.error('[advanced-analysis.forecastMonthEnd] Error:', error);
    return { success: false, error: 'Erro ao gerar projecao' };
  }
}

// ============================================================================
// detect_anomalies - Detecta gastos fora do padrao
// ============================================================================

type DetectAnomaliesParams = {
  sensitivity?: 'low' | 'medium' | 'high';
};

export async function detectAnomalies(
  params: DetectAnomaliesParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const sensitivity = params.sensitivity || 'medium';

  // Multiplicador para desvio padrao baseado na sensibilidade
  const thresholdMultiplier =
    sensitivity === 'low' ? 3 : sensitivity === 'high' ? 1.5 : 2;

  try {
    // Buscar gastos dos ultimos 6 meses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];

    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('id, establishment_name, amount, date, category')
      .eq('user_id', userId)
      .gte('date', startDate)
      .order('date', { ascending: false });

    if (error) {
      return { success: false, error: 'Erro ao buscar gastos' };
    }

    if (!expenses || expenses.length < 10) {
      return {
        success: true,
        data: {
          anomalies: [],
          message:
            'Dados insuficientes para detectar anomalias. Continue registrando gastos.',
        },
      };
    }

    // Calcular estatisticas por categoria
    const categoryStats: Record<
      string,
      { amounts: number[]; mean: number; stdDev: number }
    > = {};

    for (const expense of expenses) {
      const cat = expense.category || 'outros';
      if (!categoryStats[cat]) {
        categoryStats[cat] = { amounts: [], mean: 0, stdDev: 0 };
      }
      categoryStats[cat].amounts.push(expense.amount);
    }

    // Calcular media e desvio padrao
    for (const cat in categoryStats) {
      const amounts = categoryStats[cat].amounts;
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance =
        amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        amounts.length;
      categoryStats[cat].mean = mean;
      categoryStats[cat].stdDev = Math.sqrt(variance);
    }

    // Detectar anomalias
    const anomalies: Array<{
      id: string;
      establishment: string;
      amount: number;
      date: string;
      category: string;
      expectedRange: { min: number; max: number };
      deviationPercent: number;
      type: 'unusually_high' | 'unusually_low';
    }> = [];

    for (const expense of expenses) {
      const cat = expense.category || 'outros';
      const stats = categoryStats[cat];

      if (stats.amounts.length < 3) continue; // Precisa de dados suficientes

      const upperThreshold = stats.mean + thresholdMultiplier * stats.stdDev;
      const lowerThreshold = Math.max(
        0,
        stats.mean - thresholdMultiplier * stats.stdDev
      );

      if (expense.amount > upperThreshold) {
        anomalies.push({
          id: expense.id,
          establishment: expense.establishment_name,
          amount: expense.amount,
          date: expense.date,
          category: cat,
          expectedRange: {
            min: Math.round(lowerThreshold * 100) / 100,
            max: Math.round(upperThreshold * 100) / 100,
          },
          deviationPercent: Math.round(
            ((expense.amount - stats.mean) / stats.mean) * 100
          ),
          type: 'unusually_high',
        });
      } else if (expense.amount < lowerThreshold && stats.mean > 50) {
        anomalies.push({
          id: expense.id,
          establishment: expense.establishment_name,
          amount: expense.amount,
          date: expense.date,
          category: cat,
          expectedRange: {
            min: Math.round(lowerThreshold * 100) / 100,
            max: Math.round(upperThreshold * 100) / 100,
          },
          deviationPercent: Math.round(
            ((stats.mean - expense.amount) / stats.mean) * 100
          ),
          type: 'unusually_low',
        });
      }
    }

    // Ordenar por desvio e pegar os mais significativos
    anomalies.sort(
      (a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent)
    );
    const topAnomalies = anomalies.slice(0, 10);

    // Gerar insights
    const insights: string[] = [];
    const highAnomalies = topAnomalies.filter(
      (a) => a.type === 'unusually_high'
    );

    if (highAnomalies.length > 0) {
      insights.push(
        `Encontrei ${highAnomalies.length} gasto(s) acima do normal para suas categorias.`
      );
    }

    if (topAnomalies.length === 0) {
      insights.push('Seus gastos estao dentro dos padroes esperados.');
    }

    return {
      success: true,
      data: {
        anomalies: topAnomalies,
        totalFound: anomalies.length,
        sensitivity,
        insights,
        categoryStats: Object.entries(categoryStats)
          .filter(([_, stats]) => stats.amounts.length >= 3)
          .map(([category, stats]) => ({
            category,
            averageAmount: Math.round(stats.mean * 100) / 100,
            typicalRange: {
              min:
                Math.round(Math.max(0, stats.mean - stats.stdDev) * 100) / 100,
              max: Math.round((stats.mean + stats.stdDev) * 100) / 100,
            },
          })),
      },
    };
  } catch (error) {
    console.error('[advanced-analysis.detectAnomalies] Error:', error);
    return { success: false, error: 'Erro ao detectar anomalias' };
  }
}
