import { supabase } from './supabase';

/**
 * Gera um Connect Token para conectar um banco via Pluggy
 */
export async function getConnectToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    'pluggy-create-token'
  );

  if (error) {
    console.error('[pluggy] Error getting connect token:', error);
    throw new Error(error.message || 'Falha ao gerar token de conexão');
  }

  if (!data?.connectToken) {
    throw new Error('Token de conexão não foi retornado');
  }

  return data.connectToken;
}

/**
 * Gera uma API Key para fazer chamadas à API Pluggy
 * API Keys duram 2 horas e podem ser usadas para qualquer operação
 */
export async function getApiKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('pluggy-get-api-key');

  if (error) {
    console.error('[pluggy] Error getting API key:', error);
    throw new Error(error.message || 'Falha ao gerar API key');
  }

  if (!data?.apiKey) {
    throw new Error('API key não foi retornada');
  }

  return data.apiKey;
}

/**
 * Sincroniza um Item (banco conectado) e suas contas
 */
export async function syncItem(itemId: string): Promise<{
  success: boolean;
  item: {
    id: string;
    databaseId: string;
    connectorName: string;
    status: string;
    error?: { message: string } | null;
    executionStatus?: string | null;
  };
  accountsCount: number;
}> {
  const { data, error } = await supabase.functions.invoke('pluggy-sync-item', {
    body: { itemId },
  });

  if (error) {
    console.error('[pluggy] Error syncing item:', error);
    throw new Error(error.message || 'Falha ao sincronizar banco');
  }

  return data;
}

/**
 * Sincroniza transações de uma conta
 * @param accountId - UUID da conta no banco de dados (não o pluggy_account_id)
 */
export async function syncTransactions(
  accountId: string,
  options?: {
    from?: string; // Data no formato YYYY-MM-DD
    to?: string; // Data no formato YYYY-MM-DD
  }
): Promise<{
  success: boolean;
  total: number;
  saved: number;
  skipped: number;
}> {
  // Buscar o pluggy_account_id correspondente ao UUID
  const { data: accountData, error: accountError } = await supabase
    .from('pluggy_accounts')
    .select('pluggy_account_id')
    .eq('id', accountId)
    .single();

  if (accountError || !accountData) {
    console.error('[pluggy] Error fetching account:', accountError);
    throw new Error('Conta não encontrada');
  }

  const { data, error } = await supabase.functions.invoke(
    'pluggy-sync-transactions',
    {
      body: {
        accountId: accountData.pluggy_account_id,
        from: options?.from,
        to: options?.to,
      },
    }
  );

  if (error) {
    console.error('[pluggy] Error syncing transactions:', error);
    throw new Error(error.message || 'Falha ao sincronizar transações');
  }

  return data;
}

/**
 * Busca todos os Items (bancos) conectados do usuário
 */
export async function getConnectedItems() {
  const { data, error } = await supabase
    .from('pluggy_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pluggy] Error fetching items:', error);
    throw error;
  }

  return data || [];
}

/**
 * Busca todas as contas de um Item
 */
export async function getAccountsByItem(itemId: string) {
  const { data, error } = await supabase
    .from('pluggy_accounts')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pluggy] Error fetching accounts:', error);
    throw error;
  }

  return data || [];
}

/**
 * Busca todas as transações de uma conta
 */
export async function getTransactionsByAccount(
  accountId: string,
  options?: {
    from?: string;
    to?: string;
    limit?: number;
  }
) {
  let query = supabase
    .from('pluggy_transactions')
    .select('*')
    .eq('account_id', accountId)
    .order('date', { ascending: false });

  if (options?.from) {
    query = query.gte('date', options.from);
  }

  if (options?.to) {
    query = query.lte('date', options.to);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[pluggy] Error fetching transactions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Remove um Item (desconecta o banco)
 * Deleta tanto na Pluggy API quanto no banco de dados local
 */
export async function disconnectItem(
  itemId: string
): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke(
    'pluggy-delete-item',
    {
      body: { itemId },
    }
  );

  if (error) {
    console.error('[pluggy] Error disconnecting item:', error);
    throw new Error(error.message || 'Falha ao desconectar banco');
  }

  return data;
}

/**
 * Envia código MFA (autenticação de dois fatores) para um Item
 * @param itemId - UUID do item no banco de dados
 * @param mfaParameter - Objeto com o parâmetro MFA (ex: { token: "123456" })
 */
export async function sendMFA(
  itemId: string,
  mfaParameter: Record<string, string>
): Promise<{
  success: boolean;
  item: {
    id: string;
    status: string;
    executionStatus?: string | null;
  };
}> {
  const { data, error } = await supabase.functions.invoke('pluggy-send-mfa', {
    body: { itemId, mfaParameter },
  });

  if (error) {
    console.error('[pluggy] Error sending MFA:', error);
    throw new Error(error.message || 'Falha ao enviar código MFA');
  }

  return data;
}
