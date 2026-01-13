import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../../types.ts';

// ============================================================================
// Types
// ============================================================================

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
// Helpers
// ============================================================================

function getDateRange(period: string): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case 'last_month': {
      const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const end = new Date(year, month, 0).toISOString().split('T')[0];
      return { start, end };
    }
    case 'last_7_days': {
      const end = now.toISOString().split('T')[0];
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      const start = startDate.toISOString().split('T')[0];
      return { start, end };
    }
    case 'last_30_days': {
      const end = now.toISOString().split('T')[0];
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      const start = startDate.toISOString().split('T')[0];
      return { start, end };
    }
    case 'current_month':
    default: {
      const start = new Date(year, month, 1).toISOString().split('T')[0];
      const end = new Date(year, month + 1, 0).toISOString().split('T')[0];
      return { start, end };
    }
  }
}

// Category inference removed - Walts agent decides the category intelligently

// ============================================================================
// Tool Implementations
// ============================================================================

export async function getFinancialContext(
  params: { period?: string },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const period = params.period || 'current_month';
  const { start, end } = getDateRange(period);

  try {
    const [profileResult, budgetsResult, expensesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, income_cards')
        .eq('id', userId)
        .single(),
      supabase.from('budgets').select('*').eq('user_id', userId),
      supabase
        .from('expenses')
        .select('id, establishment_name, amount, date, category, subcategory')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
        .limit(20),
    ]);

    const incomeCards = profileResult.data?.income_cards || [];
    const totalIncome = incomeCards.reduce(
      (sum: number, card: { amount: number }) => sum + card.amount,
      0
    );

    const expenses = expensesResult.data || [];
    const totalExpenses = expenses.reduce(
      (sum: number, e: { amount: number }) => sum + e.amount,
      0
    );

    const budgets = (budgetsResult.data || []).map((b: any) => {
      const categoryExpenses = expenses.filter(
        (e: any) => e.category === b.category_id
      );
      const spent = categoryExpenses.reduce(
        (sum: number, e: { amount: number }) => sum + e.amount,
        0
      );
      const limit = parseFloat(b.amount);
      return {
        category: b.category_id,
        limit,
        spent,
        remaining: Math.max(0, limit - spent),
        percentUsed: limit > 0 ? Math.round((spent / limit) * 100) : 0,
      };
    });

    return {
      success: true,
      data: {
        period,
        dateRange: { start, end },
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
        budgets,
        recentExpenses: expenses.slice(0, 10).map((e: any) => ({
          establishment: e.establishment_name,
          amount: e.amount,
          date: e.date,
          category: e.category,
        })),
      },
    };
  } catch (error) {
    console.error('[financial.getFinancialContext] Error:', error);
    return {
      success: false,
      error: 'Erro ao buscar contexto financeiro',
    };
  }
}

export async function createExpense(
  params: {
    establishment_name: string;
    amount: number;
    category: string; // Required - Walts decides the category
    is_fixed_cost: boolean; // Required - Walts decides if it's fixed or variable
    subcategory?: string; // Optional - Walts can specify for more detail
    date?: string;
    notes?: string;
  },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const date = params.date || new Date().toISOString().split('T')[0];
    // Use establishment name as subcategory if not provided
    const subcategory = params.subcategory || params.establishment_name;

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        establishment_name: params.establishment_name,
        amount: params.amount,
        date,
        category: params.category,
        subcategory,
        is_fixed_cost: params.is_fixed_cost,
        notes: params.notes || null,
        items: [],
      })
      .select('id, amount, category')
      .single();

    if (error) {
      console.error('[financial.createExpense] DB Error:', error);
      return {
        success: false,
        error: `Erro ao criar gasto: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        expense_id: data.id,
        establishment: params.establishment_name,
        amount: data.amount,
        category: data.category,
        date,
        message: `Gasto de R$ ${params.amount.toFixed(2)} em ${params.establishment_name} registrado com sucesso!`,
      },
    };
  } catch (error) {
    console.error('[financial.createExpense] Error:', error);
    return {
      success: false,
      error: 'Erro ao criar gasto',
    };
  }
}

export async function createBudget(
  params: {
    category_id: string;
    amount: number;
    period_type?: string;
    notifications_enabled?: boolean;
  },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const existingBudget = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', userId)
      .eq('category_id', params.category_id)
      .single();

    if (existingBudget.data) {
      return {
        success: false,
        error: `Já existe um orçamento para a categoria ${params.category_id}. Use a opção de editar orçamento.`,
      };
    }

    const now = new Date();
    const periodType = params.period_type || 'monthly';
    let startDate: string;
    let endDate: string | null = null;

    if (periodType === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
    } else if (periodType === 'weekly') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diff)).toISOString().split('T')[0];
    } else {
      startDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    }

    const { data, error } = await supabase
      .from('budgets')
      .insert({
        user_id: userId,
        category_id: params.category_id,
        amount: params.amount.toString(),
        period_type: periodType,
        start_date: startDate,
        end_date: endDate,
        notifications_enabled: params.notifications_enabled ?? true,
        rollover_enabled: false,
      })
      .select('id, category_id, amount, period_type')
      .single();

    if (error) {
      console.error('[financial.createBudget] DB Error:', error);
      return {
        success: false,
        error: `Erro ao criar orçamento: ${error.message}`,
      };
    }

    const periodLabel =
      periodType === 'monthly'
        ? 'por mês'
        : periodType === 'weekly'
          ? 'por semana'
          : 'por ano';

    return {
      success: true,
      data: {
        budget_id: data.id,
        category: data.category_id,
        limit: parseFloat(data.amount),
        period: data.period_type,
        message: `Orçamento de R$ ${params.amount.toFixed(2)} ${periodLabel} criado para ${params.category_id}!`,
      },
    };
  } catch (error) {
    console.error('[financial.createBudget] Error:', error);
    return {
      success: false,
      error: 'Erro ao criar orçamento',
    };
  }
}

export async function checkBudgetStatus(
  params: { category_id?: string },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    let budgetsQuery = supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId);

    if (params.category_id) {
      budgetsQuery = budgetsQuery.eq('category_id', params.category_id);
    }

    const { data: budgets, error: budgetsError } = await budgetsQuery;

    if (budgetsError) {
      return { success: false, error: 'Erro ao buscar orçamentos' };
    }

    if (!budgets || budgets.length === 0) {
      return {
        success: true,
        data: {
          budgets: [],
          message: params.category_id
            ? `Não há orçamento definido para ${params.category_id}`
            : 'Você não tem orçamentos definidos ainda.',
        },
      };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount, category')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', monthEnd);

    const budgetStatuses = budgets.map((b: any) => {
      const categoryExpenses = (expenses || []).filter(
        (e: any) => e.category === b.category_id
      );
      const spent = categoryExpenses.reduce(
        (sum: number, e: { amount: number }) => sum + e.amount,
        0
      );
      const limit = parseFloat(b.amount);
      const remaining = Math.max(0, limit - spent);
      const percentUsed = limit > 0 ? Math.round((spent / limit) * 100) : 0;

      let status: string;
      if (percentUsed >= 100) {
        status = 'ESTOURADO';
      } else if (percentUsed >= 80) {
        status = 'ALERTA';
      } else if (percentUsed >= 50) {
        status = 'MODERADO';
      } else {
        status = 'OK';
      }

      return {
        category: b.category_id,
        limit,
        spent,
        remaining,
        percentUsed,
        status,
      };
    });

    return {
      success: true,
      data: {
        budgets: budgetStatuses,
        summary: {
          total: budgetStatuses.length,
          ok: budgetStatuses.filter((b: any) => b.status === 'OK').length,
          alert: budgetStatuses.filter((b: any) => b.status === 'ALERTA')
            .length,
          exceeded: budgetStatuses.filter((b: any) => b.status === 'ESTOURADO')
            .length,
        },
      },
    };
  } catch (error) {
    console.error('[financial.checkBudgetStatus] Error:', error);
    return {
      success: false,
      error: 'Erro ao verificar status dos orçamentos',
    };
  }
}

// ============================================================================
// Find and Recategorize Expense by Description
// ============================================================================

export async function recategorizeExpenseByName(
  params: {
    establishment_name: string;
    new_category?: string;
    is_fixed_cost?: boolean;
    date?: string;
    amount?: number;
  },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar gasto pelo nome do estabelecimento
    let query = supabase
      .from('expenses')
      .select('id, establishment_name, amount, date, category, is_fixed_cost')
      .eq('user_id', userId)
      .ilike('establishment_name', `%${params.establishment_name}%`)
      .order('date', { ascending: false })
      .limit(10);

    if (params.date) {
      query = query.eq('date', params.date);
    }

    const { data: expenses, error } = await query;

    if (error) {
      console.error('[financial.recategorizeExpenseByName] DB Error:', error);
      return { success: false, error: 'Erro ao buscar gasto' };
    }

    if (!expenses || expenses.length === 0) {
      return {
        success: false,
        error: `Nenhum gasto encontrado com nome "${params.establishment_name}"`,
      };
    }

    // Se amount foi especificado, filtrar por valor similar
    let targetExpense = expenses[0];
    if (params.amount !== undefined && expenses.length > 1) {
      const matchByAmount = expenses.find(
        (e) => Math.abs(e.amount - params.amount!) < 0.01
      );
      if (matchByAmount) {
        targetExpense = matchByAmount;
      }
    }

    // Construir objeto de atualizacao
    const updateData: Record<string, unknown> = {};
    if (params.new_category !== undefined) {
      updateData.category = params.new_category;
    }
    if (params.is_fixed_cost !== undefined) {
      updateData.is_fixed_cost = params.is_fixed_cost;
    }

    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: 'Nenhum campo para atualizar (informe new_category ou is_fixed_cost)',
      };
    }

    // Atualizar gasto
    const { data, error: updateError } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', targetExpense.id)
      .select('id, establishment_name, amount, date, category, is_fixed_cost')
      .single();

    if (updateError) {
      console.error('[financial.recategorizeExpenseByName] Update Error:', updateError);
      return { success: false, error: 'Erro ao atualizar gasto' };
    }

    const changes: string[] = [];
    if (params.new_category !== undefined && params.new_category !== targetExpense.category) {
      changes.push(`categoria: "${targetExpense.category}" -> "${data.category}"`);
    }
    if (params.is_fixed_cost !== undefined && params.is_fixed_cost !== targetExpense.is_fixed_cost) {
      const oldType = targetExpense.is_fixed_cost ? 'custo fixo' : 'custo variavel';
      const newType = data.is_fixed_cost ? 'custo fixo' : 'custo variavel';
      changes.push(`tipo: ${oldType} -> ${newType}`);
    }

    return {
      success: true,
      data: {
        expense_id: data.id,
        establishment: data.establishment_name,
        amount: data.amount,
        date: data.date,
        category: data.category,
        is_fixed_cost: data.is_fixed_cost,
        changes,
        message: `Gasto "${data.establishment_name}" atualizado: ${changes.join(', ')}.`,
      },
    };
  } catch (error) {
    console.error('[financial.recategorizeExpenseByName] Error:', error);
    return { success: false, error: 'Erro ao recategorizar gasto' };
  }
}

// ============================================================================
// Expense Update/Delete
// ============================================================================

export async function updateExpense(
  params: {
    expense_id: string;
    establishment_name?: string;
    amount?: number;
    date?: string;
    category?: string;
    notes?: string;
  },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Verify expense belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', params.expense_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: 'Gasto nao encontrado ou nao pertence ao usuario',
      };
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (params.establishment_name)
      updateData.establishment_name = params.establishment_name;
    if (params.amount !== undefined) updateData.amount = params.amount;
    if (params.date) updateData.date = params.date;
    if (params.category) updateData.category = params.category;
    if (params.notes !== undefined) updateData.notes = params.notes;

    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: 'Nenhum campo para atualizar foi fornecido',
      };
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', params.expense_id)
      .select('id, establishment_name, amount, date, category')
      .single();

    if (error) {
      console.error('[financial.updateExpense] DB Error:', error);
      return {
        success: false,
        error: `Erro ao atualizar gasto: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        expense_id: data.id,
        establishment: data.establishment_name,
        amount: data.amount,
        category: data.category,
        date: data.date,
        message: `Gasto atualizado com sucesso!`,
      },
    };
  } catch (error) {
    console.error('[financial.updateExpense] Error:', error);
    return {
      success: false,
      error: 'Erro ao atualizar gasto',
    };
  }
}

export async function deleteExpense(
  params: { expense_id: string },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Verify expense belongs to user and get details for confirmation
    const { data: existing, error: fetchError } = await supabase
      .from('expenses')
      .select('id, establishment_name, amount, date')
      .eq('id', params.expense_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: 'Gasto nao encontrado ou nao pertence ao usuario',
      };
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', params.expense_id);

    if (error) {
      console.error('[financial.deleteExpense] DB Error:', error);
      return {
        success: false,
        error: `Erro ao deletar gasto: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        deleted_expense_id: existing.id,
        establishment: existing.establishment_name,
        amount: existing.amount,
        date: existing.date,
        message: `Gasto de R$ ${existing.amount.toFixed(2)} em ${existing.establishment_name} removido com sucesso!`,
      },
    };
  } catch (error) {
    console.error('[financial.deleteExpense] Error:', error);
    return {
      success: false,
      error: 'Erro ao deletar gasto',
    };
  }
}

// ============================================================================
// Budget Update/Delete
// ============================================================================

export async function updateBudget(
  params: {
    budget_id?: string;
    category_id?: string;
    amount?: number;
    period_type?: string;
    notifications_enabled?: boolean;
  },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Find budget by ID or category
    let query = supabase.from('budgets').select('*').eq('user_id', userId);

    if (params.budget_id) {
      query = query.eq('id', params.budget_id);
    } else if (params.category_id) {
      query = query.eq('category_id', params.category_id);
    } else {
      return {
        success: false,
        error: 'Necessario fornecer budget_id ou category_id',
      };
    }

    const { data: existing, error: fetchError } = await query.single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: 'Orcamento nao encontrado',
      };
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (params.amount !== undefined) updateData.amount = params.amount.toString();
    if (params.period_type) updateData.period_type = params.period_type;
    if (params.notifications_enabled !== undefined)
      updateData.notifications_enabled = params.notifications_enabled;

    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: 'Nenhum campo para atualizar foi fornecido',
      };
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('budgets')
      .update(updateData)
      .eq('id', existing.id)
      .select('id, category_id, amount, period_type, notifications_enabled')
      .single();

    if (error) {
      console.error('[financial.updateBudget] DB Error:', error);
      return {
        success: false,
        error: `Erro ao atualizar orcamento: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        budget_id: data.id,
        category: data.category_id,
        limit: parseFloat(data.amount),
        period: data.period_type,
        notifications: data.notifications_enabled,
        message: `Orcamento de ${data.category_id} atualizado com sucesso!`,
      },
    };
  } catch (error) {
    console.error('[financial.updateBudget] Error:', error);
    return {
      success: false,
      error: 'Erro ao atualizar orcamento',
    };
  }
}

export async function deleteBudget(
  params: {
    budget_id?: string;
    category_id?: string;
  },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Find budget by ID or category
    let query = supabase
      .from('budgets')
      .select('id, category_id, amount')
      .eq('user_id', userId);

    if (params.budget_id) {
      query = query.eq('id', params.budget_id);
    } else if (params.category_id) {
      query = query.eq('category_id', params.category_id);
    } else {
      return {
        success: false,
        error: 'Necessario fornecer budget_id ou category_id',
      };
    }

    const { data: existing, error: fetchError } = await query.single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: 'Orcamento nao encontrado',
      };
    }

    const { error } = await supabase.from('budgets').delete().eq('id', existing.id);

    if (error) {
      console.error('[financial.deleteBudget] DB Error:', error);
      return {
        success: false,
        error: `Erro ao deletar orcamento: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        deleted_budget_id: existing.id,
        category: existing.category_id,
        former_limit: parseFloat(existing.amount),
        message: `Orcamento de ${existing.category_id} removido com sucesso!`,
      },
    };
  } catch (error) {
    console.error('[financial.deleteBudget] Error:', error);
    return {
      success: false,
      error: 'Erro ao deletar orcamento',
    };
  }
}
