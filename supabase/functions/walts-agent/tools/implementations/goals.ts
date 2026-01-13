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

type FinancialGoal = {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category?: string;
  createdAt: string;
  status: 'active' | 'completed' | 'cancelled';
};

// ============================================================================
// create_financial_goal - Cria meta financeira
// ============================================================================

type CreateFinancialGoalParams = {
  title: string;
  target_amount: number;
  target_date: string;
  category?: string;
  initial_amount?: number;
};

export async function createFinancialGoal(
  params: CreateFinancialGoalParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar metas existentes
    const { data: existingMemory } = await supabase
      .from('walts_memory')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'financial_goals')
      .single();

    const existingGoals: FinancialGoal[] = existingMemory?.value?.goals || [];

    // Criar nova meta
    const newGoal: FinancialGoal = {
      id: crypto.randomUUID(),
      title: params.title,
      targetAmount: params.target_amount,
      currentAmount: params.initial_amount || 0,
      targetDate: params.target_date,
      category: params.category,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    const updatedGoals = [...existingGoals, newGoal];

    // Salvar na memoria
    if (existingMemory) {
      await supabase
        .from('walts_memory')
        .update({
          value: { goals: updatedGoals },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('key', 'financial_goals');
    } else {
      await supabase.from('walts_memory').insert({
        user_id: userId,
        memory_type: 'context',
        key: 'financial_goals',
        value: { goals: updatedGoals },
        confidence: 1.0,
        source: 'user_defined',
      });
    }

    // Calcular quanto precisa economizar por mes
    const targetDate = new Date(params.target_date);
    const now = new Date();
    const monthsRemaining = Math.max(
      1,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
        (targetDate.getMonth() - now.getMonth())
    );
    const monthlyRequired =
      (params.target_amount - (params.initial_amount || 0)) / monthsRemaining;

    return {
      success: true,
      data: {
        goal_id: newGoal.id,
        title: newGoal.title,
        targetAmount: newGoal.targetAmount,
        targetDate: newGoal.targetDate,
        monthsRemaining,
        monthlyRequired: Math.round(monthlyRequired * 100) / 100,
        message: `Meta "${params.title}" criada! Para atingir R$ ${params.target_amount.toFixed(2)} ate ${params.target_date}, voce precisa economizar R$ ${monthlyRequired.toFixed(2)} por mes.`,
      },
    };
  } catch (error) {
    console.error('[goals.createFinancialGoal] Error:', error);
    return { success: false, error: 'Erro ao criar meta financeira' };
  }
}

// ============================================================================
// track_goal_progress - Acompanha progresso de meta
// ============================================================================

type TrackGoalProgressParams = {
  goal_id?: string;
  title?: string;
};

export async function trackGoalProgress(
  params: TrackGoalProgressParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar metas
    const { data: goalsMemory } = await supabase
      .from('walts_memory')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'financial_goals')
      .single();

    const goals: FinancialGoal[] = goalsMemory?.value?.goals || [];

    if (goals.length === 0) {
      return {
        success: true,
        data: {
          goals: [],
          message: 'Voce ainda nao tem metas financeiras definidas.',
        },
      };
    }

    // Filtrar por ID ou titulo se especificado
    let targetGoals = goals.filter((g) => g.status === 'active');

    if (params.goal_id) {
      targetGoals = targetGoals.filter((g) => g.id === params.goal_id);
    } else if (params.title) {
      const searchTerm = params.title.toLowerCase();
      targetGoals = targetGoals.filter((g) =>
        g.title.toLowerCase().includes(searchTerm)
      );
    }

    if (targetGoals.length === 0) {
      return {
        success: true,
        data: {
          goals: [],
          message: 'Meta nao encontrada ou ja foi concluida.',
        },
      };
    }

    // Calcular progresso de cada meta
    const now = new Date();
    const goalsProgress = targetGoals.map((goal) => {
      const targetDate = new Date(goal.targetDate);
      const createdDate = new Date(goal.createdAt);

      const totalDays = Math.max(
        1,
        (targetDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysElapsed = Math.max(
        0,
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysRemaining = Math.max(
        0,
        (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const percentComplete =
        goal.targetAmount > 0
          ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
          : 0;
      const expectedPercent = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

      const amountRemaining = goal.targetAmount - goal.currentAmount;
      const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
      const monthlyRequired = amountRemaining / monthsRemaining;

      const isOnTrack = percentComplete >= expectedPercent;

      return {
        id: goal.id,
        title: goal.title,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        targetDate: goal.targetDate,
        category: goal.category,
        progress: {
          percentComplete,
          expectedPercent,
          isOnTrack,
          amountRemaining: Math.round(amountRemaining * 100) / 100,
          daysRemaining: Math.round(daysRemaining),
          monthsRemaining,
          monthlyRequired: Math.round(monthlyRequired * 100) / 100,
        },
        status: percentComplete >= 100 ? 'completed' : isOnTrack ? 'on_track' : 'behind',
      };
    });

    // Gerar insights
    const insights: string[] = [];

    for (const goal of goalsProgress) {
      if (goal.progress.percentComplete >= 100) {
        insights.push(`Meta "${goal.title}" concluida! Parabens!`);
      } else if (goal.status === 'behind') {
        insights.push(
          `Meta "${goal.title}" esta atrasada. Voce precisa acelerar para R$ ${goal.progress.monthlyRequired.toFixed(2)}/mes.`
        );
      } else {
        insights.push(
          `Meta "${goal.title}" esta no caminho certo (${goal.progress.percentComplete}% concluido).`
        );
      }
    }

    return {
      success: true,
      data: {
        goals: goalsProgress,
        totalGoals: goalsProgress.length,
        onTrack: goalsProgress.filter((g) => g.status === 'on_track').length,
        behind: goalsProgress.filter((g) => g.status === 'behind').length,
        completed: goalsProgress.filter((g) => g.status === 'completed').length,
        insights,
      },
    };
  } catch (error) {
    console.error('[goals.trackGoalProgress] Error:', error);
    return { success: false, error: 'Erro ao buscar progresso da meta' };
  }
}

// ============================================================================
// suggest_savings_plan - Sugere plano de economia
// ============================================================================

type SuggestSavingsPlanParams = {
  goal_id?: string;
  target_amount?: number;
  months?: number;
  aggressive?: boolean;
};

export async function suggestSavingsPlan(
  params: SuggestSavingsPlanParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar dados financeiros do usuario
    const [profileResult, expensesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('income_cards')
        .eq('id', userId)
        .single(),
      supabase
        .from('expenses')
        .select('amount, category')
        .eq('user_id', userId)
        .gte(
          'date',
          new Date(new Date().setMonth(new Date().getMonth() - 3))
            .toISOString()
            .split('T')[0]
        ),
    ]);

    // Parse renda
    const incomeCards = profileResult.data?.income_cards || [];
    let totalIncome = 0;
    for (const card of incomeCards) {
      if (card.salary) {
        const cleanSalary = card.salary.replace(/\./g, '').replace(',', '.');
        totalIncome += parseFloat(cleanSalary) || 0;
      }
    }

    // Calcular gastos medios por categoria
    const expenses = expensesResult.data || [];
    const monthsOfData = 3;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const monthlyExpenses = totalExpenses / monthsOfData;

    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category || 'outros';
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    }

    // Converter para media mensal e ordenar
    const categoryAverages = Object.entries(byCategory)
      .map(([category, total]) => ({
        category,
        monthlyAverage: Math.round((total / monthsOfData) * 100) / 100,
      }))
      .sort((a, b) => b.monthlyAverage - a.monthlyAverage);

    // Determinar meta
    let targetAmount = params.target_amount;
    let months = params.months || 12;
    let goalTitle = 'Meta personalizada';

    if (params.goal_id) {
      const { data: goalsMemory } = await supabase
        .from('walts_memory')
        .select('value')
        .eq('user_id', userId)
        .eq('key', 'financial_goals')
        .single();

      const goals: FinancialGoal[] = goalsMemory?.value?.goals || [];
      const goal = goals.find((g) => g.id === params.goal_id);

      if (goal) {
        targetAmount = goal.targetAmount - goal.currentAmount;
        goalTitle = goal.title;

        const targetDate = new Date(goal.targetDate);
        const now = new Date();
        months = Math.max(
          1,
          (targetDate.getFullYear() - now.getFullYear()) * 12 +
            (targetDate.getMonth() - now.getMonth())
        );
      }
    }

    if (!targetAmount) {
      return {
        success: false,
        error: 'Informe target_amount ou goal_id para gerar o plano.',
      };
    }

    const monthlyRequired = targetAmount / months;
    const currentSavings = totalIncome - monthlyExpenses;
    const additionalNeeded = Math.max(0, monthlyRequired - currentSavings);

    // Categorias que podem ser cortadas
    const discretionaryCategories = ['lazer', 'delivery', 'vestuario', 'beleza', 'eletronicos'];
    const cuttableExpenses = categoryAverages.filter((c) =>
      discretionaryCategories.includes(c.category)
    );

    // Gerar sugestoes de corte
    const suggestions: Array<{
      category: string;
      currentAmount: number;
      suggestedCut: number;
      newAmount: number;
      percentCut: number;
    }> = [];

    let accumulatedSavings = 0;
    const cutPercent = params.aggressive ? 0.5 : 0.3; // 50% ou 30% de corte

    for (const expense of cuttableExpenses) {
      if (accumulatedSavings >= additionalNeeded) break;

      const suggestedCut = Math.round(expense.monthlyAverage * cutPercent * 100) / 100;
      accumulatedSavings += suggestedCut;

      suggestions.push({
        category: expense.category,
        currentAmount: expense.monthlyAverage,
        suggestedCut,
        newAmount: Math.round((expense.monthlyAverage - suggestedCut) * 100) / 100,
        percentCut: Math.round(cutPercent * 100),
      });
    }

    const canAchieve = currentSavings + accumulatedSavings >= monthlyRequired;

    return {
      success: true,
      data: {
        goal: {
          title: goalTitle,
          targetAmount,
          months,
          monthlyRequired: Math.round(monthlyRequired * 100) / 100,
        },
        currentSituation: {
          monthlyIncome: totalIncome,
          monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
          currentMonthlySavings: Math.round(currentSavings * 100) / 100,
          additionalSavingsNeeded: Math.round(additionalNeeded * 100) / 100,
        },
        plan: {
          type: params.aggressive ? 'agressivo' : 'conservador',
          suggestions,
          totalPotentialSavings: Math.round(accumulatedSavings * 100) / 100,
          newMonthlySavings: Math.round((currentSavings + accumulatedSavings) * 100) / 100,
          canAchieveGoal: canAchieve,
        },
        insights: [
          canAchieve
            ? `Seguindo este plano, voce conseguira economizar R$ ${monthlyRequired.toFixed(2)}/mes e atingir sua meta em ${months} meses.`
            : `Mesmo com os cortes sugeridos, sera dificil atingir a meta no prazo. Considere aumentar o prazo ou a renda.`,
          suggestions.length > 0
            ? `Principais categorias para cortar: ${suggestions.map((s) => s.category).join(', ')}.`
            : 'Seus gastos ja estao otimizados.',
        ],
      },
    };
  } catch (error) {
    console.error('[goals.suggestSavingsPlan] Error:', error);
    return { success: false, error: 'Erro ao gerar plano de economia' };
  }
}
