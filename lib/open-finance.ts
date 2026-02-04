/**
 * Camada de abstração para Open Finance
 * Unifica dados da Pluggy e Belvo em uma interface comum
 */

import { supabase } from './supabase';
import * as pluggy from './pluggy';
import * as belvo from './belvo';

// Provedor padrão para novas conexões
// Altere para 'pluggy' se quiser usar a Pluggy como padrão
export const DEFAULT_PROVIDER: OpenFinanceProvider = 'belvo';

export type OpenFinanceProvider = 'pluggy' | 'belvo';

/**
 * Representa uma conexão com um banco (Item na Pluggy, Link na Belvo)
 */
export type OpenFinanceConnection = {
  id: string; // UUID do banco de dados
  externalId: string; // ID externo (pluggy_item_id ou belvo_link_id)
  provider: OpenFinanceProvider;
  institutionName: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  errorMessage?: string | null;
};

/**
 * Representa uma conta bancária
 */
export type OpenFinanceAccount = {
  id: string; // UUID do banco de dados
  externalId: string; // ID externo
  provider: OpenFinanceProvider;
  connectionId: string; // UUID da conexão (item_id ou link_id)
  type: 'BANK' | 'CREDIT'; // Tipo simplificado
  category: string; // Categoria específica (CHECKING_ACCOUNT, SAVINGS_ACCOUNT, etc)
  name: string;
  number: string | null;
  balance: number | null;
  currency: string;
  creditLimit?: number | null;
  creditAvailable?: number | null;
  lastSyncAt: string | null;
  institutionName: string | null;
};

/**
 * Representa uma transação
 */
export type OpenFinanceTransaction = {
  id: string;
  externalId: string;
  provider: OpenFinanceProvider;
  accountId: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT'; // Normalizado
  date: string;
  category: string | null;
  status: string | null;
  synced: boolean;
};

/**
 * Busca todas as conexões (bancos) do usuário de ambos os provedores
 */
export async function getConnections(options?: {
  accountType?: 'BANK' | 'CREDIT';
}): Promise<OpenFinanceConnection[]> {
  const connections: OpenFinanceConnection[] = [];

  // Buscar conexões da Pluggy
  try {
    const pluggyItems = await pluggy.getConnectedItems(options?.accountType);
    for (const item of pluggyItems) {
      connections.push({
        id: item.id,
        externalId: item.pluggy_item_id,
        provider: 'pluggy',
        institutionName: item.connector_name,
        status: item.status,
        lastSyncAt: item.last_sync_at,
        createdAt: item.created_at,
        errorMessage: item.error_message,
      });
    }
  } catch (error) {
    console.error('[open-finance] Error fetching Pluggy items:', error);
  }

  // Buscar conexões da Belvo
  try {
    // Mapear accountType para categoria da Belvo
    let belvoCategory:
      | 'CHECKING_ACCOUNT'
      | 'SAVINGS_ACCOUNT'
      | 'CREDIT_CARD'
      | undefined;
    if (options?.accountType === 'BANK') {
      belvoCategory = 'CHECKING_ACCOUNT';
    } else if (options?.accountType === 'CREDIT') {
      belvoCategory = 'CREDIT_CARD';
    }

    const belvoLinks = await belvo.getConnectedLinks(belvoCategory);
    for (const link of belvoLinks) {
      connections.push({
        id: link.id,
        externalId: link.belvo_link_id,
        provider: 'belvo',
        institutionName: link.institution_name,
        status: link.status,
        lastSyncAt: link.last_sync_at,
        createdAt: link.created_at,
        errorMessage: null,
      });
    }
  } catch (error) {
    console.error('[open-finance] Error fetching Belvo links:', error);
  }

  // Ordenar por data de criação (mais recente primeiro)
  connections.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return connections;
}

/**
 * Busca contas de uma conexão específica
 */
export async function getAccounts(
  connectionId: string,
  provider: OpenFinanceProvider
): Promise<OpenFinanceAccount[]> {
  if (provider === 'pluggy') {
    const accounts = await pluggy.getAccountsByItem(connectionId);
    return accounts.map((acc: any) => ({
      id: acc.id,
      externalId: acc.pluggy_account_id,
      provider: 'pluggy',
      connectionId: acc.item_id,
      type: acc.type === 'CREDIT' ? 'CREDIT' : 'BANK',
      category: acc.subtype || acc.type,
      name: acc.name,
      number: acc.number,
      balance: acc.balance,
      currency: acc.currency_code || 'BRL',
      creditLimit: acc.credit_limit,
      creditAvailable: acc.available_credit_limit,
      lastSyncAt: acc.last_sync_at,
      institutionName: null,
    }));
  } else {
    const accounts = await belvo.getAccountsByLink(connectionId);
    return accounts.map((acc: any) => ({
      id: acc.id,
      externalId: acc.belvo_account_id,
      provider: 'belvo',
      connectionId: acc.link_id,
      type: acc.category === 'CREDIT_CARD' ? 'CREDIT' : 'BANK',
      category: acc.category,
      name: acc.name,
      number: acc.number,
      balance: acc.balance_current,
      currency: acc.currency || 'BRL',
      creditLimit: acc.credit_limit,
      creditAvailable: acc.credit_available,
      lastSyncAt: acc.last_sync_at,
      institutionName: acc.institution_name,
    }));
  }
}

/**
 * Busca transações de uma conta específica
 */
export async function getTransactions(
  accountId: string,
  provider: OpenFinanceProvider,
  options?: {
    from?: string;
    to?: string;
    limit?: number;
  }
): Promise<OpenFinanceTransaction[]> {
  if (provider === 'pluggy') {
    const transactions = await pluggy.getTransactionsByAccount(
      accountId,
      options
    );
    return transactions.map((tx: any) => ({
      id: tx.id,
      externalId: tx.pluggy_transaction_id,
      provider: 'pluggy',
      accountId: tx.account_id,
      description: tx.description,
      amount: tx.amount,
      type: tx.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
      date: tx.date,
      category: tx.category,
      status: tx.status,
      synced: tx.synced,
    }));
  } else {
    const transactions = await belvo.getTransactionsByAccount(accountId, {
      dateFrom: options?.from,
      dateTo: options?.to,
      limit: options?.limit,
    });
    return transactions.map((tx: any) => ({
      id: tx.id,
      externalId: tx.belvo_transaction_id,
      provider: 'belvo',
      accountId: tx.account_id,
      description: tx.description,
      amount: tx.amount,
      type: tx.type === 'INFLOW' ? 'CREDIT' : 'DEBIT',
      date: tx.value_date,
      category: tx.category,
      status: tx.status,
      synced: tx.synced,
    }));
  }
}

/**
 * Sincroniza uma conexão (busca dados atualizados)
 */
export async function syncConnection(
  externalId: string,
  provider: OpenFinanceProvider
): Promise<{
  success: boolean;
  accountsCount: number;
}> {
  if (provider === 'pluggy') {
    const result = await pluggy.syncItem(externalId);
    return {
      success: result.success,
      accountsCount: result.accountsCount,
    };
  } else {
    const result = await belvo.syncLink(externalId);
    return {
      success: result.success,
      accountsCount: result.accountsCount,
    };
  }
}

/**
 * Dispara uma atualização de uma conexão (Pluggy) ou sincroniza (Belvo)
 */
export async function updateConnection(
  externalId: string,
  provider: OpenFinanceProvider
): Promise<{ success: boolean }> {
  if (provider === 'pluggy') {
    const result = await pluggy.updateItem(externalId);
    return { success: result.success };
  } else {
    // Belvo não tem update separado, sync já faz isso
    const result = await belvo.syncLink(externalId);
    return { success: result.success };
  }
}

/**
 * Sincroniza transações de uma conta
 */
export async function syncAccountTransactions(
  accountId: string,
  provider: OpenFinanceProvider,
  options?: {
    from?: string;
    to?: string;
  }
): Promise<{
  success: boolean;
  total: number;
  saved: number;
}> {
  if (provider === 'pluggy') {
    const result = await pluggy.syncTransactions(accountId, options);
    return {
      success: result.success,
      total: result.total,
      saved: result.saved,
    };
  } else {
    const result = await belvo.syncTransactions(accountId, {
      dateFrom: options?.from,
      dateTo: options?.to,
    });
    return {
      success: result.success,
      total: result.total,
      saved: result.saved,
    };
  }
}

/**
 * Desconecta um banco
 */
export async function disconnectConnection(
  connectionId: string,
  provider: OpenFinanceProvider
): Promise<{ success: boolean }> {
  if (provider === 'pluggy') {
    return await pluggy.disconnectItem(connectionId);
  } else {
    return await belvo.disconnectLink(connectionId);
  }
}

/**
 * Retorna as funções do provedor padrão para novas conexões
 * Usado pelas telas de conexão
 */
export function getDefaultProvider() {
  if (DEFAULT_PROVIDER === 'belvo') {
    return {
      provider: 'belvo' as const,
      getWidgetToken: belvo.getWidgetToken,
      getInstitutions: belvo.getInstitutions,
      syncConnection: (linkId: string) => belvo.syncLink(linkId),
      syncTransactions: belvo.syncTransactions,
    };
  } else {
    return {
      provider: 'pluggy' as const,
      getConnectToken: pluggy.getConnectToken,
      getApiKey: pluggy.getApiKey,
      syncConnection: (itemId: string) => pluggy.syncItem(itemId),
      syncTransactions: pluggy.syncTransactions,
    };
  }
}

/**
 * Determina o provedor de uma conexão pelo ID
 * Busca primeiro na Pluggy, depois na Belvo
 */
export async function getConnectionProvider(
  connectionId: string
): Promise<OpenFinanceProvider | null> {
  // Tentar Pluggy
  const { data: pluggyItem } = await supabase
    .from('pluggy_items')
    .select('id')
    .eq('id', connectionId)
    .single();

  if (pluggyItem) {
    return 'pluggy';
  }

  // Tentar Belvo
  const { data: belvoLink } = await supabase
    .from('belvo_links')
    .select('id')
    .eq('id', connectionId)
    .single();

  if (belvoLink) {
    return 'belvo';
  }

  return null;
}

/**
 * Determina o provedor de uma conta pelo ID
 */
export async function getAccountProvider(
  accountId: string
): Promise<OpenFinanceProvider | null> {
  // Tentar Pluggy
  const { data: pluggyAccount } = await supabase
    .from('pluggy_accounts')
    .select('id')
    .eq('id', accountId)
    .single();

  if (pluggyAccount) {
    return 'pluggy';
  }

  // Tentar Belvo
  const { data: belvoAccount } = await supabase
    .from('belvo_accounts')
    .select('id')
    .eq('id', accountId)
    .single();

  if (belvoAccount) {
    return 'belvo';
  }

  return null;
}
