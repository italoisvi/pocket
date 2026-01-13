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
    let query = supabase
      .from('pluggy_transactions')
      .select('*, pluggy_accounts(name, type)')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit);

    if (params.account_id) {
      query = query.eq('account_id', params.account_id);
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
      return { success: false, error: 'Erro ao buscar transacoes' };
    }

    const formattedTransactions = (transactions || []).map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      type: t.type === 'DEBIT' ? 'Debito' : 'Credito',
      status: t.status === 'POSTED' ? 'Confirmado' : 'Pendente',
      category: t.category,
      synced: t.synced,
      account: t.pluggy_accounts?.name,
      hasExpense: !!t.expense_id,
    }));

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
        totalDebits,
        totalCredits,
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
