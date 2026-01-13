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
// get_bank_accounts - Lista contas conectadas com saldos
// ============================================================================

export async function getBankAccounts(
  _params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar items (conexões)
    const { data: items } = await supabase
      .from('pluggy_items')
      .select('id, connector_name, status, last_updated_at')
      .eq('user_id', userId);

    if (!items || items.length === 0) {
      return {
        success: true,
        data: {
          accounts: [],
          message: 'Nenhum banco conectado ainda.',
        },
      };
    }

    // Buscar contas
    const { data: accounts } = await supabase
      .from('pluggy_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('type', { ascending: true });

    const formattedAccounts = (accounts || []).map((acc) => ({
      id: acc.id,
      bank:
        items.find((i) => i.id === acc.item_id)?.connector_name || 'Desconhecido',
      type: acc.type === 'BANK' ? 'Conta Corrente' : 'Cartao de Credito',
      name: acc.name,
      balance: acc.balance,
      creditLimit: acc.credit_limit,
      availableCredit: acc.available_credit_limit,
      lastSync: acc.last_sync_at,
    }));

    const bankAccounts = formattedAccounts.filter(
      (a) => a.type === 'Conta Corrente'
    );
    const creditCards = formattedAccounts.filter(
      (a) => a.type === 'Cartao de Credito'
    );

    return {
      success: true,
      data: {
        accounts: formattedAccounts,
        totalAccounts: formattedAccounts.length,
        totalBankBalance: bankAccounts.reduce(
          (sum, a) => sum + (a.balance || 0),
          0
        ),
        totalCreditUsed: creditCards.reduce((sum, a) => {
          const limit = a.creditLimit || 0;
          const available = a.availableCredit || 0;
          return sum + (limit - available);
        }, 0),
        totalCreditLimit: creditCards.reduce(
          (sum, a) => sum + (a.creditLimit || 0),
          0
        ),
      },
    };
  } catch (error) {
    console.error('[openfinance.getBankAccounts] Error:', error);
    return { success: false, error: 'Erro ao buscar contas bancarias' };
  }
}

// ============================================================================
// sync_bank_accounts - Trigger sincronizacao
// ============================================================================

export async function syncBankAccounts(
  params: { account_id?: string },
  context: ToolContext
): Promise<ToolResult> {
  const { supabase } = context;

  try {
    // Chamar edge function de sync
    const { data, error } = await supabase.functions.invoke('pluggy-sync-item', {
      body: { account_id: params.account_id },
    });

    if (error) {
      return {
        success: false,
        error: `Erro ao sincronizar: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        message: 'Sincronizacao iniciada! Pode levar alguns segundos.',
        ...data,
      },
    };
  } catch (error) {
    console.error('[openfinance.syncBankAccounts] Error:', error);
    return { success: false, error: 'Erro ao iniciar sincronizacao' };
  }
}

// ============================================================================
// get_bank_transactions - Busca transacoes importadas
// ============================================================================

type GetBankTransactionsParams = {
  bank_name?: string;
  account_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  type?: 'DEBIT' | 'CREDIT';
};

export async function getBankTransactions(
  params: GetBankTransactionsParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const limit = Math.min(params.limit || 20, 100);

  try {
    // Se filtrar por banco, primeiro buscar contas desse banco
    let filterAccountIds: string[] | undefined;
    let bankNameFilter = params.bank_name;

    if (bankNameFilter) {
      // Buscar items (conexoes) que correspondem ao banco
      const { data: items } = await supabase
        .from('pluggy_items')
        .select('id, connector_name')
        .eq('user_id', userId)
        .ilike('connector_name', `%${bankNameFilter}%`);

      if (!items || items.length === 0) {
        return {
          success: true,
          data: {
            transactions: [],
            total: 0,
            totalDebits: 0,
            totalCredits: 0,
            message: `Nenhum banco conectado com nome "${bankNameFilter}".`,
          },
        };
      }

      // Buscar contas desses items
      const itemIds = items.map((i) => i.id);
      const { data: bankAccounts } = await supabase
        .from('pluggy_accounts')
        .select('id')
        .eq('user_id', userId)
        .in('item_id', itemIds);

      if (!bankAccounts || bankAccounts.length === 0) {
        return {
          success: true,
          data: {
            transactions: [],
            total: 0,
            totalDebits: 0,
            totalCredits: 0,
            message: `Nenhuma conta encontrada para o banco "${bankNameFilter}".`,
          },
        };
      }

      filterAccountIds = bankAccounts.map((a) => a.id);
    }

    // Buscar transacoes
    let query = supabase
      .from('pluggy_transactions')
      .select('id, account_id, description, amount, date, status, type, category, synced, expense_id')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit);

    // Filtro por IDs de conta (do banco ou especifico)
    if (params.account_id) {
      query = query.eq('account_id', params.account_id);
    } else if (filterAccountIds && filterAccountIds.length > 0) {
      query = query.in('account_id', filterAccountIds);
    }

    if (params.start_date) {
      query = query.gte('date', params.start_date);
    }

    if (params.end_date) {
      query = query.lte('date', params.end_date);
    }

    if (params.type) {
      query = query.eq('type', params.type);
    }

    const { data: transactions, error } = await query;

    if (error) {
      console.error('[openfinance.getBankTransactions] Query error:', error);
      return { success: false, error: `Erro ao buscar transacoes: ${error.message}` };
    }

    if (!transactions || transactions.length === 0) {
      const bankMsg = bankNameFilter ? ` do banco "${bankNameFilter}"` : '';
      return {
        success: true,
        data: {
          transactions: [],
          total: 0,
          totalDebits: 0,
          totalCredits: 0,
          message: `Nenhuma transacao encontrada${bankMsg} para o periodo.`,
        },
      };
    }

    // Buscar contas para mapear nomes
    const accountIds = [...new Set(transactions.map((t) => t.account_id))];
    const { data: accounts } = await supabase
      .from('pluggy_accounts')
      .select('id, name, type, item_id')
      .in('id', accountIds);

    // Buscar nome dos bancos
    const itemIds = [...new Set((accounts || []).map((a) => a.item_id))];
    const { data: items } = await supabase
      .from('pluggy_items')
      .select('id, connector_name')
      .in('id', itemIds);

    const itemMap = new Map((items || []).map((i) => [i.id, i.connector_name]));
    const accountMap = new Map(
      (accounts || []).map((a) => [
        a.id,
        {
          name: a.name,
          type: a.type,
          bank: itemMap.get(a.item_id) || 'Desconhecido',
        },
      ])
    );

    const formattedTransactions = transactions.map((t) => {
      const accountInfo = accountMap.get(t.account_id);
      return {
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.date,
        type: t.type === 'DEBIT' ? 'Debito' : 'Credito',
        status: t.status === 'POSTED' ? 'Confirmado' : 'Pendente',
        category: t.category,
        synced: t.synced,
        account: accountInfo?.name || 'Conta desconhecida',
        bank: accountInfo?.bank || 'Desconhecido',
        hasExpense: !!t.expense_id,
      };
    });

    const totalDebits = formattedTransactions
      .filter((t) => t.type === 'Debito')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalCredits = formattedTransactions
      .filter((t) => t.type === 'Credito')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      success: true,
      data: {
        transactions: formattedTransactions,
        total: formattedTransactions.length,
        totalDebits: Math.round(totalDebits * 100) / 100,
        totalCredits: Math.round(totalCredits * 100) / 100,
        ...(bankNameFilter && { bankFilter: bankNameFilter }),
      },
    };
  } catch (error) {
    console.error('[openfinance.getBankTransactions] Error:', error);
    return { success: false, error: 'Erro ao buscar transacoes' };
  }
}

// ============================================================================
// check_bank_sync_status - Verifica status de sincronizacao
// ============================================================================

export async function checkBankSyncStatus(
  _params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const { data: items } = await supabase
      .from('pluggy_items')
      .select('connector_name, status, last_updated_at, error_message')
      .eq('user_id', userId);

    if (!items || items.length === 0) {
      return {
        success: true,
        data: {
          banks: [],
          message: 'Nenhum banco conectado.',
        },
      };
    }

    const statusMap: Record<string, string> = {
      UPDATED: 'Atualizado',
      UPDATING: 'Sincronizando...',
      LOGIN_ERROR: 'Erro de login',
      OUTDATED: 'Desatualizado',
      PENDING: 'Pendente',
      WAITING_USER_INPUT: 'Aguardando autorizacao',
    };

    const banks = items.map((item) => ({
      name: item.connector_name,
      status: statusMap[item.status] || item.status,
      lastSync: item.last_updated_at,
      error: item.error_message,
      needsAttention: ['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT'].includes(
        item.status
      ),
    }));

    return {
      success: true,
      data: {
        banks,
        hasErrors: banks.some((b) => b.needsAttention),
        totalConnected: banks.length,
      },
    };
  } catch (error) {
    console.error('[openfinance.checkBankSyncStatus] Error:', error);
    return { success: false, error: 'Erro ao verificar status' };
  }
}
