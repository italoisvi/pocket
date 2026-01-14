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
// recategorize_transaction - Recategoriza transacao do Open Finance
// ============================================================================

type RecategorizeTransactionParams = {
  transaction_id: string;
  category: string;
  subcategory?: string;
  is_fixed_cost?: boolean;
  save_as_pattern?: boolean;
};

export async function recategorizeTransaction(
  params: RecategorizeTransactionParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Verificar se a transacao existe e pertence ao usuario
    // Incluir expense_id para atualizar expense linkado
    const { data: transaction, error: fetchError } = await supabase
      .from('pluggy_transactions')
      .select('id, description, amount, expense_id')
      .eq('id', params.transaction_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !transaction) {
      return {
        success: false,
        error: 'Transacao nao encontrada',
      };
    }

    // Verificar se ja existe categorizacao
    const { data: existingCat } = await supabase
      .from('transaction_categories')
      .select('id')
      .eq('transaction_id', params.transaction_id)
      .eq('user_id', userId)
      .single();

    if (existingCat) {
      // Atualizar categorizacao existente
      const { error: updateError } = await supabase
        .from('transaction_categories')
        .update({
          category: params.category,
          subcategory: params.subcategory || null,
          is_fixed_cost: params.is_fixed_cost || false,
          categorized_by: 'walts',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCat.id);

      if (updateError) {
        return { success: false, error: 'Erro ao atualizar categoria' };
      }
    } else {
      // Criar nova categorizacao
      const { error: insertError } = await supabase
        .from('transaction_categories')
        .insert({
          user_id: userId,
          transaction_id: params.transaction_id,
          category: params.category,
          subcategory: params.subcategory || null,
          is_fixed_cost: params.is_fixed_cost || false,
          categorized_by: 'walts',
        });

      if (insertError) {
        return { success: false, error: 'Erro ao criar categoria' };
      }
    }

    // IMPORTANTE: Se existe expense linkado, atualizar tambem
    if (transaction.expense_id) {
      const { error: expenseUpdateError } = await supabase
        .from('expenses')
        .update({
          category: params.category,
          subcategory: params.subcategory || null,
          is_fixed_cost: params.is_fixed_cost || false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.expense_id)
        .eq('user_id', userId);

      if (expenseUpdateError) {
        console.error(
          '[categorization.recategorizeTransaction] Error updating expense:',
          expenseUpdateError
        );
        // Nao falhar completamente, pois transaction_categories foi atualizado
      }
    }

    // Se save_as_pattern, salvar padrao para aprendizado
    if (params.save_as_pattern) {
      const descriptionLower = transaction.description.toLowerCase();

      // Verificar se ja existe padrao
      const { data: existingPattern } = await supabase
        .from('user_financial_patterns')
        .select('id, occurrences')
        .eq('user_id', userId)
        .eq('pattern_type', 'category_preference')
        .eq('pattern_key', descriptionLower)
        .single();

      if (existingPattern) {
        await supabase
          .from('user_financial_patterns')
          .update({
            category: params.category,
            pattern_value: {
              category: params.category,
              subcategory: params.subcategory,
              is_fixed_cost: params.is_fixed_cost,
            },
            occurrences: existingPattern.occurrences + 1,
            confidence: Math.min(
              0.95,
              0.7 + existingPattern.occurrences * 0.05
            ),
            last_updated_at: new Date().toISOString(),
          })
          .eq('id', existingPattern.id);
      } else {
        await supabase.from('user_financial_patterns').insert({
          user_id: userId,
          pattern_type: 'category_preference',
          pattern_key: descriptionLower,
          category: params.category,
          pattern_value: {
            category: params.category,
            subcategory: params.subcategory,
            is_fixed_cost: params.is_fixed_cost,
          },
          confidence: 0.7,
          occurrences: 1,
        });
      }
    }

    return {
      success: true,
      data: {
        transaction_id: params.transaction_id,
        description: transaction.description,
        new_category: params.category,
        subcategory: params.subcategory,
        is_fixed_cost: params.is_fixed_cost || false,
        pattern_saved: params.save_as_pattern || false,
        message: `Transacao "${transaction.description}" categorizada como ${params.category}${params.save_as_pattern ? ' (padrao salvo para futuro)' : ''}.`,
      },
    };
  } catch (error) {
    console.error('[categorization.recategorizeTransaction] Error:', error);
    return { success: false, error: 'Erro ao recategorizar transacao' };
  }
}

// ============================================================================
// mark_as_fixed_cost - Marca transacao como custo fixo
// ============================================================================

type MarkAsFixedCostParams = {
  transaction_id: string;
  monthly_amount?: number;
};

export async function markAsFixedCost(
  params: MarkAsFixedCostParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar transacao
    const { data: transaction, error: fetchError } = await supabase
      .from('pluggy_transactions')
      .select('id, description, amount, category')
      .eq('id', params.transaction_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !transaction) {
      return {
        success: false,
        error: 'Transacao nao encontrada',
      };
    }

    // Verificar/criar categorizacao
    const { data: existingCat } = await supabase
      .from('transaction_categories')
      .select('id, category')
      .eq('transaction_id', params.transaction_id)
      .eq('user_id', userId)
      .single();

    if (existingCat) {
      await supabase
        .from('transaction_categories')
        .update({
          is_fixed_cost: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCat.id);
    } else {
      await supabase.from('transaction_categories').insert({
        user_id: userId,
        transaction_id: params.transaction_id,
        category: transaction.category || 'outros',
        is_fixed_cost: true,
        categorized_by: 'walts',
      });
    }

    // Salvar como padrao recorrente
    const descriptionLower = transaction.description.toLowerCase();
    const monthlyAmount = params.monthly_amount || Math.abs(transaction.amount);

    const { data: existingPattern } = await supabase
      .from('user_financial_patterns')
      .select('id')
      .eq('user_id', userId)
      .eq('pattern_type', 'recurring_expense')
      .eq('pattern_key', descriptionLower)
      .single();

    if (!existingPattern) {
      await supabase.from('user_financial_patterns').insert({
        user_id: userId,
        pattern_type: 'recurring_expense',
        pattern_key: descriptionLower,
        category: transaction.category || 'outros',
        pattern_value: {
          description: transaction.description,
          avg_amount: monthlyAmount,
          is_fixed_cost: true,
        },
        confidence: 0.9,
        occurrences: 1,
      });
    }

    return {
      success: true,
      data: {
        transaction_id: params.transaction_id,
        description: transaction.description,
        monthly_amount: monthlyAmount,
        message: `"${transaction.description}" marcado como custo fixo de R$ ${monthlyAmount.toFixed(2)}/mes.`,
      },
    };
  } catch (error) {
    console.error('[categorization.markAsFixedCost] Error:', error);
    return { success: false, error: 'Erro ao marcar como custo fixo' };
  }
}

// ============================================================================
// get_uncategorized - Lista transacoes sem categoria
// ============================================================================

type GetUncategorizedParams = {
  limit?: number;
  start_date?: string;
};

export async function getUncategorized(
  params: GetUncategorizedParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const limit = Math.min(params.limit || 20, 50);

  try {
    // Buscar transacoes do usuario
    let query = supabase
      .from('pluggy_transactions')
      .select('id, description, amount, date, category')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit * 2); // Buscar mais para filtrar

    if (params.start_date) {
      query = query.gte('date', params.start_date);
    }

    const { data: transactions, error } = await query;

    if (error) {
      return { success: false, error: 'Erro ao buscar transacoes' };
    }

    if (!transactions || transactions.length === 0) {
      return {
        success: true,
        data: {
          uncategorized: [],
          message: 'Nenhuma transacao encontrada.',
        },
      };
    }

    // Buscar categorizacoes existentes
    const transactionIds = transactions.map((t) => t.id);
    const { data: categories } = await supabase
      .from('transaction_categories')
      .select('transaction_id')
      .eq('user_id', userId)
      .in('transaction_id', transactionIds);

    const categorizedIds = new Set(
      (categories || []).map((c) => c.transaction_id)
    );

    // Filtrar transacoes sem categoria ou com categoria generica
    const uncategorized = transactions
      .filter(
        (t) =>
          !categorizedIds.has(t.id) ||
          !t.category ||
          t.category === 'outros' ||
          t.category === ''
      )
      .slice(0, limit)
      .map((t) => ({
        id: t.id,
        description: t.description,
        amount: Math.abs(t.amount),
        date: t.date,
        currentCategory: t.category || 'nenhuma',
      }));

    // Sugerir categorias baseado em padroes
    const suggestions: Record<string, string> = {};
    for (const trans of uncategorized) {
      const descLower = trans.description.toLowerCase();

      // Buscar padrao existente
      const { data: pattern } = await supabase
        .from('user_financial_patterns')
        .select('category')
        .eq('user_id', userId)
        .eq('pattern_type', 'category_preference')
        .ilike('pattern_key', `%${descLower.split(' ')[0]}%`)
        .order('confidence', { ascending: false })
        .limit(1)
        .single();

      if (pattern) {
        suggestions[trans.id] = pattern.category;
      }
    }

    return {
      success: true,
      data: {
        uncategorized,
        suggestions,
        total: uncategorized.length,
        message:
          uncategorized.length > 0
            ? `Encontrei ${uncategorized.length} transacao(es) sem categoria adequada.`
            : 'Todas as transacoes estao categorizadas!',
      },
    };
  } catch (error) {
    console.error('[categorization.getUncategorized] Error:', error);
    return {
      success: false,
      error: 'Erro ao buscar transacoes nao categorizadas',
    };
  }
}
