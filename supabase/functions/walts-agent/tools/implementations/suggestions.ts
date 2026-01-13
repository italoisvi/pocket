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
// suggest_budget_adjustments - Sugere ajustes de orcamento
// ============================================================================

export async function suggestBudgetAdjustments(
  _params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar dados dos ultimos 3 meses
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const startDate = threeMonthsAgo.toISOString().split('T')[0];

    const [expensesResult, budgetsResult] = await Promise.all([
      supabase
        .from('expenses')
        .select('amount, category, date')
        .eq('user_id', userId)
        .gte('date', startDate),
      supabase.from('budgets').select('*').eq('user_id', userId),
    ]);

    const expenses = expensesResult.data || [];
    const budgets = budgetsResult.data || [];

    if (expenses.length === 0) {
      return {
        success: true,
        data: {
          suggestions: [],
          message: 'Dados insuficientes para sugerir ajustes. Continue registrando gastos.',
        },
      };
    }

    // Calcular media mensal por categoria
    const byCategory: Record<string, number[]> = {};
    const byMonth: Record<string, Record<string, number>> = {};

    for (const expense of expenses) {
      const cat = expense.category || 'outros';
      const month = expense.date.substring(0, 7);

      if (!byCategory[cat]) byCategory[cat] = [];
      if (!byMonth[month]) byMonth[month] = {};
      if (!byMonth[month][cat]) byMonth[month][cat] = 0;

      byMonth[month][cat] += expense.amount;
    }

    // Calcular media e tendencia
    const categoryStats: Record<string, { avg: number; trend: string; variance: number }> = {};

    for (const [category, _] of Object.entries(byCategory)) {
      const monthlyTotals = Object.values(byMonth).map((m) => m[category] || 0);
      const avg = monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length;

      // Calcular tendencia (comparar media recente com media antiga)
      const recentMonths = monthlyTotals.slice(-2);
      const olderMonths = monthlyTotals.slice(0, -2);
      const recentAvg =
        recentMonths.length > 0
          ? recentMonths.reduce((a, b) => a + b, 0) / recentMonths.length
          : avg;
      const olderAvg =
        olderMonths.length > 0
          ? olderMonths.reduce((a, b) => a + b, 0) / olderMonths.length
          : avg;

      let trend: string;
      const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

      if (changePercent > 15) trend = 'subindo';
      else if (changePercent < -15) trend = 'caindo';
      else trend = 'estavel';

      // Variancia para estabilidade
      const variance =
        monthlyTotals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
        monthlyTotals.length;

      categoryStats[category] = { avg, trend, variance };
    }

    // Gerar sugestoes
    const suggestions: Array<{
      category: string;
      currentBudget: number | null;
      suggestedBudget: number;
      reason: string;
      action: 'increase' | 'decrease' | 'create' | 'keep';
      savings: number;
    }> = [];

    for (const [category, stats] of Object.entries(categoryStats)) {
      const existingBudget = budgets.find((b) => b.category_id === category);
      const currentLimit = existingBudget ? parseFloat(existingBudget.amount) : null;

      // Calcular orcamento sugerido (media + margem de seguranca)
      const safetyMargin = Math.sqrt(stats.variance) * 0.5; // Meio desvio padrao
      const suggestedBudget = Math.round((stats.avg + safetyMargin) * 100) / 100;

      if (!existingBudget) {
        // Sugerir criar orcamento para categorias relevantes
        if (stats.avg > 100) {
          suggestions.push({
            category,
            currentBudget: null,
            suggestedBudget,
            reason: `Voce gasta em media R$ ${stats.avg.toFixed(2)}/mes nesta categoria.`,
            action: 'create',
            savings: 0,
          });
        }
      } else if (currentLimit !== null) {
        const difference = currentLimit - stats.avg;
        const percentDiff = (difference / currentLimit) * 100;

        if (percentDiff > 30) {
          // Orcamento muito alto
          suggestions.push({
            category,
            currentBudget: currentLimit,
            suggestedBudget,
            reason: `Orcamento atual esta ${Math.round(percentDiff)}% acima do gasto medio.`,
            action: 'decrease',
            savings: Math.round((currentLimit - suggestedBudget) * 100) / 100,
          });
        } else if (percentDiff < -20) {
          // Orcamento muito baixo (sempre estoura)
          suggestions.push({
            category,
            currentBudget: currentLimit,
            suggestedBudget,
            reason: `Orcamento esta ${Math.round(Math.abs(percentDiff))}% abaixo do gasto medio (estoura frequentemente).`,
            action: 'increase',
            savings: 0,
          });
        }
      }
    }

    // Ordenar por potencial de economia
    suggestions.sort((a, b) => b.savings - a.savings);

    const totalPotentialSavings = suggestions.reduce((sum, s) => sum + s.savings, 0);

    return {
      success: true,
      data: {
        suggestions: suggestions.slice(0, 10),
        categoryStats: Object.entries(categoryStats).map(([cat, stats]) => ({
          category: cat,
          monthlyAverage: Math.round(stats.avg * 100) / 100,
          trend: stats.trend,
        })),
        summary: {
          totalSuggestions: suggestions.length,
          potentialMonthlySavings: Math.round(totalPotentialSavings * 100) / 100,
          categoriesAnalyzed: Object.keys(categoryStats).length,
        },
        message:
          suggestions.length > 0
            ? `Encontrei ${suggestions.length} sugestao(es) de ajuste. Potencial de economia: R$ ${totalPotentialSavings.toFixed(2)}/mes.`
            : 'Seus orcamentos estao bem calibrados!',
      },
    };
  } catch (error) {
    console.error('[suggestions.suggestBudgetAdjustments] Error:', error);
    return { success: false, error: 'Erro ao gerar sugestoes de orcamento' };
  }
}

// ============================================================================
// suggest_categories_to_cut - Sugere categorias para cortar gastos
// ============================================================================

type SuggestCategoriesToCutParams = {
  target_savings: number;
};

export async function suggestCategoriesToCut(
  params: SuggestCategoriesToCutParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar gastos dos ultimos 3 meses
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const startDate = threeMonthsAgo.toISOString().split('T')[0];

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount, category')
      .eq('user_id', userId)
      .gte('date', startDate);

    if (!expenses || expenses.length === 0) {
      return {
        success: true,
        data: {
          suggestions: [],
          message: 'Dados insuficientes para sugestoes.',
        },
      };
    }

    // Calcular media mensal por categoria
    const byCategory: Record<string, number> = {};
    for (const expense of expenses) {
      const cat = expense.category || 'outros';
      byCategory[cat] = (byCategory[cat] || 0) + expense.amount;
    }

    // Converter para media mensal
    const monthlyAverages = Object.entries(byCategory).map(([category, total]) => ({
      category,
      monthlyAverage: total / 3,
    }));

    // Categorias discricionarias (mais faceis de cortar)
    const discretionaryCategories = [
      'lazer',
      'delivery',
      'vestuario',
      'beleza',
      'eletronicos',
      'outros',
    ];

    const essentialCategories = [
      'moradia',
      'alimentacao',
      'transporte',
      'saude',
      'educacao',
    ];

    // Separar e ordenar
    const discretionary = monthlyAverages
      .filter((c) => discretionaryCategories.includes(c.category))
      .sort((a, b) => b.monthlyAverage - a.monthlyAverage);

    const essential = monthlyAverages
      .filter((c) => essentialCategories.includes(c.category))
      .sort((a, b) => b.monthlyAverage - a.monthlyAverage);

    // Gerar plano de corte
    const suggestions: Array<{
      category: string;
      currentMonthly: number;
      suggestedCut: number;
      newMonthly: number;
      percentCut: number;
      difficulty: 'facil' | 'medio' | 'dificil';
      tip: string;
    }> = [];

    let accumulatedSavings = 0;
    const targetSavings = params.target_savings;

    // Primeiro, categorias discricionarias
    for (const cat of discretionary) {
      if (accumulatedSavings >= targetSavings) break;

      const remaining = targetSavings - accumulatedSavings;
      const maxCut = cat.monthlyAverage * 0.5; // Maximo 50% de corte
      const suggestedCut = Math.min(remaining, maxCut);

      if (suggestedCut < 20) continue; // Ignorar cortes muito pequenos

      accumulatedSavings += suggestedCut;

      const tips: Record<string, string> = {
        lazer: 'Busque alternativas gratuitas ou mais baratas.',
        delivery: 'Cozinhe em casa mais vezes ou use cupons.',
        vestuario: 'Espere promocoes ou compre em brechos.',
        beleza: 'Espacie os servicos ou faca em casa.',
        eletronicos: 'Adie compras nao essenciais.',
        outros: 'Revise se esses gastos sao realmente necessarios.',
      };

      suggestions.push({
        category: cat.category,
        currentMonthly: Math.round(cat.monthlyAverage * 100) / 100,
        suggestedCut: Math.round(suggestedCut * 100) / 100,
        newMonthly: Math.round((cat.monthlyAverage - suggestedCut) * 100) / 100,
        percentCut: Math.round((suggestedCut / cat.monthlyAverage) * 100),
        difficulty: 'facil',
        tip: tips[cat.category] || 'Reduza aos poucos.',
      });
    }

    // Se ainda nao atingiu a meta, sugerir cortes em essenciais
    if (accumulatedSavings < targetSavings) {
      for (const cat of essential) {
        if (accumulatedSavings >= targetSavings) break;

        const remaining = targetSavings - accumulatedSavings;
        const maxCut = cat.monthlyAverage * 0.2; // Maximo 20% em essenciais
        const suggestedCut = Math.min(remaining, maxCut);

        if (suggestedCut < 30) continue;

        accumulatedSavings += suggestedCut;

        const tips: Record<string, string> = {
          moradia: 'Renegocie aluguel ou reduza consumo de energia.',
          alimentacao: 'Planeje refeicoes e evite desperdicio.',
          transporte: 'Use transporte publico ou carona.',
          saude: 'Use genericos e previna doencas.',
          educacao: 'Busque cursos gratuitos ou bolsas.',
        };

        suggestions.push({
          category: cat.category,
          currentMonthly: Math.round(cat.monthlyAverage * 100) / 100,
          suggestedCut: Math.round(suggestedCut * 100) / 100,
          newMonthly: Math.round((cat.monthlyAverage - suggestedCut) * 100) / 100,
          percentCut: Math.round((suggestedCut / cat.monthlyAverage) * 100),
          difficulty: 'dificil',
          tip: tips[cat.category] || 'Otimize sem comprometer qualidade.',
        });
      }
    }

    const canAchieve = accumulatedSavings >= targetSavings;

    return {
      success: true,
      data: {
        targetSavings: params.target_savings,
        achievableSavings: Math.round(accumulatedSavings * 100) / 100,
        canAchieveTarget: canAchieve,
        gap: canAchieve ? 0 : Math.round((targetSavings - accumulatedSavings) * 100) / 100,
        suggestions,
        message: canAchieve
          ? `Seguindo estas sugestoes, voce pode economizar R$ ${accumulatedSavings.toFixed(2)}/mes.`
          : `Consegui sugerir economia de R$ ${accumulatedSavings.toFixed(2)}/mes. Para atingir R$ ${targetSavings.toFixed(2)}, considere aumentar sua renda.`,
      },
    };
  } catch (error) {
    console.error('[suggestions.suggestCategoriesToCut] Error:', error);
    return { success: false, error: 'Erro ao gerar sugestoes de corte' };
  }
}

// ============================================================================
// get_cashflow_prediction - Previsao de fluxo de caixa
// ============================================================================

type GetCashflowPredictionParams = {
  months_ahead: number;
};

export async function getCashflowPrediction(
  params: GetCashflowPredictionParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const monthsAhead = Math.min(params.months_ahead || 3, 12);

  try {
    // Buscar dados do usuario
    const [profileResult, expensesResult, patternsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('income_cards')
        .eq('id', userId)
        .single(),
      supabase
        .from('expenses')
        .select('amount, category, date')
        .eq('user_id', userId)
        .gte(
          'date',
          new Date(new Date().setMonth(new Date().getMonth() - 6))
            .toISOString()
            .split('T')[0]
        ),
      supabase
        .from('user_financial_patterns')
        .select('pattern_type, pattern_key, pattern_value, confidence')
        .eq('user_id', userId)
        .eq('pattern_type', 'recurring_expense')
        .gte('confidence', 0.7),
    ]);

    // Calcular renda mensal
    const incomeCards = profileResult.data?.income_cards || [];
    let monthlyIncome = 0;
    for (const card of incomeCards) {
      if (card.salary) {
        const cleanSalary = card.salary.replace(/\./g, '').replace(',', '.');
        monthlyIncome += parseFloat(cleanSalary) || 0;
      }
    }

    // Calcular gastos medios dos ultimos 6 meses
    const expenses = expensesResult.data || [];
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const avgMonthlyExpenses = totalExpenses / 6;

    // Calcular custos fixos (padroes recorrentes)
    const patterns = patternsResult.data || [];
    const fixedCosts = patterns.reduce((sum, p) => {
      const value = p.pattern_value as { avg_amount?: number };
      return sum + (value?.avg_amount || 0);
    }, 0);

    const variableExpenses = avgMonthlyExpenses - fixedCosts;

    // Gerar previsao para cada mes
    const now = new Date();
    const predictions: Array<{
      month: string;
      monthLabel: string;
      projectedIncome: number;
      projectedExpenses: number;
      projectedBalance: number;
      cumulativeBalance: number;
    }> = [];

    let cumulativeBalance = 0;

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];

    for (let i = 1; i <= monthsAhead; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const month = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;

      // Projetar gastos (fixos + variaveis com pequena variacao)
      const variationFactor = 0.95 + Math.random() * 0.1; // 95% a 105%
      const projectedExpenses = fixedCosts + variableExpenses * variationFactor;
      const projectedBalance = monthlyIncome - projectedExpenses;

      cumulativeBalance += projectedBalance;

      predictions.push({
        month,
        monthLabel: `${monthNames[futureDate.getMonth()]} ${futureDate.getFullYear()}`,
        projectedIncome: monthlyIncome,
        projectedExpenses: Math.round(projectedExpenses * 100) / 100,
        projectedBalance: Math.round(projectedBalance * 100) / 100,
        cumulativeBalance: Math.round(cumulativeBalance * 100) / 100,
      });
    }

    // Gerar insights
    const insights: string[] = [];
    const avgProjectedSavings =
      predictions.reduce((sum, p) => sum + p.projectedBalance, 0) / predictions.length;

    if (avgProjectedSavings > 0) {
      insights.push(
        `Projecao de economia media: R$ ${avgProjectedSavings.toFixed(2)}/mes.`
      );
      insights.push(
        `Em ${monthsAhead} meses, voce pode acumular R$ ${cumulativeBalance.toFixed(2)}.`
      );
    } else {
      insights.push(
        `Atencao: projecao indica deficit medio de R$ ${Math.abs(avgProjectedSavings).toFixed(2)}/mes.`
      );
    }

    const negativeMonths = predictions.filter((p) => p.projectedBalance < 0);
    if (negativeMonths.length > 0) {
      insights.push(
        `${negativeMonths.length} mes(es) com projecao de saldo negativo.`
      );
    }

    return {
      success: true,
      data: {
        assumptions: {
          monthlyIncome,
          avgMonthlyExpenses: Math.round(avgMonthlyExpenses * 100) / 100,
          fixedCosts: Math.round(fixedCosts * 100) / 100,
          variableExpenses: Math.round(variableExpenses * 100) / 100,
        },
        predictions,
        summary: {
          monthsAhead,
          totalProjectedIncome: monthlyIncome * monthsAhead,
          totalProjectedExpenses: Math.round(
            predictions.reduce((sum, p) => sum + p.projectedExpenses, 0) * 100
          ) / 100,
          finalCumulativeBalance: cumulativeBalance,
          avgMonthlySavings: Math.round(avgProjectedSavings * 100) / 100,
        },
        insights,
      },
    };
  } catch (error) {
    console.error('[suggestions.getCashflowPrediction] Error:', error);
    return { success: false, error: 'Erro ao gerar previsao de fluxo de caixa' };
  }
}
