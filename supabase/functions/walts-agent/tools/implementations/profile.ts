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
// update_profile - Atualiza dados do perfil
// ============================================================================

type UpdateProfileParams = {
  name?: string;
  debt_notifications_enabled?: boolean;
  salary_bank_account_id?: string;
};

export async function updateProfile(
  params: UpdateProfileParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Verificar se ha algo para atualizar
    const updateData: Record<string, unknown> = {};

    if (params.name !== undefined) {
      updateData.name = params.name;
    }
    if (params.debt_notifications_enabled !== undefined) {
      updateData.debt_notifications_enabled = params.debt_notifications_enabled;
    }
    if (params.salary_bank_account_id !== undefined) {
      updateData.salary_bank_account_id = params.salary_bank_account_id;
    }

    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: 'Nenhum dado para atualizar foi fornecido',
      };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select('name, debt_notifications_enabled, salary_bank_account_id')
      .single();

    if (error) {
      console.error('[profile.updateProfile] DB Error:', error);
      return {
        success: false,
        error: `Erro ao atualizar perfil: ${error.message}`,
      };
    }

    const updates: string[] = [];
    if (params.name) updates.push(`nome: ${params.name}`);
    if (params.debt_notifications_enabled !== undefined) {
      updates.push(
        `alertas de divida: ${params.debt_notifications_enabled ? 'ativados' : 'desativados'}`
      );
    }
    if (params.salary_bank_account_id) {
      updates.push('conta de salario atualizada');
    }

    return {
      success: true,
      data: {
        profile: data,
        message: `Perfil atualizado: ${updates.join(', ')}.`,
      },
    };
  } catch (error) {
    console.error('[profile.updateProfile] Error:', error);
    return { success: false, error: 'Erro ao atualizar perfil' };
  }
}

// ============================================================================
// add_income_card - Adiciona nova fonte de renda
// ============================================================================

type AddIncomeCardParams = {
  amount: number;
  day: number;
  source: string;
  linked_account_id?: string;
};

export async function addIncomeCard(
  params: AddIncomeCardParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar income_cards atual
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('income_cards')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return { success: false, error: 'Erro ao buscar perfil' };
    }

    const currentCards = profile?.income_cards || [];

    // Criar novo card
    const newCard = {
      id: crypto.randomUUID(),
      salary: params.amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      paymentDay: params.day.toString(),
      incomeSource: params.source,
      linkedAccountId: params.linked_account_id,
    };

    const updatedCards = [...currentCards, newCard];

    // Atualizar perfil
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ income_cards: updatedCards })
      .eq('id', userId);

    if (updateError) {
      console.error('[profile.addIncomeCard] DB Error:', updateError);
      return {
        success: false,
        error: `Erro ao adicionar renda: ${updateError.message}`,
      };
    }

    return {
      success: true,
      data: {
        income_card_id: newCard.id,
        amount: params.amount,
        day: params.day,
        source: params.source,
        totalIncomeCards: updatedCards.length,
        message: `Renda de R$ ${params.amount.toFixed(2)} (${params.source}) adicionada no dia ${params.day}.`,
      },
    };
  } catch (error) {
    console.error('[profile.addIncomeCard] Error:', error);
    return { success: false, error: 'Erro ao adicionar fonte de renda' };
  }
}

// ============================================================================
// update_income_card - Atualiza fonte de renda existente
// ============================================================================

type UpdateIncomeCardParams = {
  income_card_id: string;
  amount?: number;
  day?: number;
  source?: string;
  linked_account_id?: string;
};

export async function updateIncomeCard(
  params: UpdateIncomeCardParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar income_cards atual
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('income_cards')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return { success: false, error: 'Erro ao buscar perfil' };
    }

    const currentCards = profile?.income_cards || [];

    // Encontrar o card a ser atualizado
    const cardIndex = currentCards.findIndex(
      (card: { id: string }) => card.id === params.income_card_id
    );

    if (cardIndex === -1) {
      return {
        success: false,
        error: 'Fonte de renda nao encontrada',
      };
    }

    // Atualizar campos fornecidos
    const updatedCard = { ...currentCards[cardIndex] };

    if (params.amount !== undefined) {
      updatedCard.salary = params.amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    if (params.day !== undefined) {
      updatedCard.paymentDay = params.day.toString();
    }
    if (params.source !== undefined) {
      updatedCard.incomeSource = params.source;
    }
    if (params.linked_account_id !== undefined) {
      updatedCard.linkedAccountId = params.linked_account_id;
    }

    const updatedCards = [...currentCards];
    updatedCards[cardIndex] = updatedCard;

    // Atualizar perfil
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ income_cards: updatedCards })
      .eq('id', userId);

    if (updateError) {
      console.error('[profile.updateIncomeCard] DB Error:', updateError);
      return {
        success: false,
        error: `Erro ao atualizar renda: ${updateError.message}`,
      };
    }

    const updates: string[] = [];
    if (params.amount !== undefined)
      updates.push(`valor: R$ ${params.amount.toFixed(2)}`);
    if (params.day !== undefined) updates.push(`dia: ${params.day}`);
    if (params.source !== undefined) updates.push(`fonte: ${params.source}`);

    return {
      success: true,
      data: {
        income_card_id: params.income_card_id,
        updatedFields: updates,
        message: `Fonte de renda atualizada: ${updates.join(', ')}.`,
      },
    };
  } catch (error) {
    console.error('[profile.updateIncomeCard] Error:', error);
    return { success: false, error: 'Erro ao atualizar fonte de renda' };
  }
}

// ============================================================================
// remove_income_card - Remove fonte de renda
// ============================================================================

type RemoveIncomeCardParams = {
  income_card_id: string;
};

export async function removeIncomeCard(
  params: RemoveIncomeCardParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar income_cards atual
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('income_cards')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return { success: false, error: 'Erro ao buscar perfil' };
    }

    const currentCards = profile?.income_cards || [];

    // Encontrar o card a ser removido
    const cardToRemove = currentCards.find(
      (card: { id: string }) => card.id === params.income_card_id
    );

    if (!cardToRemove) {
      return {
        success: false,
        error: 'Fonte de renda nao encontrada',
      };
    }

    // Filtrar o card a ser removido
    const updatedCards = currentCards.filter(
      (card: { id: string }) => card.id !== params.income_card_id
    );

    // Atualizar perfil
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ income_cards: updatedCards })
      .eq('id', userId);

    if (updateError) {
      console.error('[profile.removeIncomeCard] DB Error:', updateError);
      return {
        success: false,
        error: `Erro ao remover renda: ${updateError.message}`,
      };
    }

    // Parse salary para exibicao
    let amount = 0;
    if (cardToRemove.salary) {
      const cleanSalary = cardToRemove.salary
        .replace(/\./g, '')
        .replace(',', '.');
      amount = parseFloat(cleanSalary) || 0;
    }

    return {
      success: true,
      data: {
        removed_income_card_id: params.income_card_id,
        removedAmount: amount,
        removedSource: cardToRemove.incomeSource,
        remainingIncomeCards: updatedCards.length,
        message: `Fonte de renda de R$ ${amount.toFixed(2)} (${cardToRemove.incomeSource}) removida.`,
      },
    };
  } catch (error) {
    console.error('[profile.removeIncomeCard] Error:', error);
    return { success: false, error: 'Erro ao remover fonte de renda' };
  }
}
