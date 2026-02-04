import { supabase } from './supabase';

/**
 * Gera um Widget Access Token para conectar um banco via Belvo
 * O token é válido por 10 minutos
 */
export async function getWidgetToken(): Promise<{
  access: string;
  refresh: string;
}> {
  const { data, error } = await supabase.functions.invoke(
    'belvo-create-widget-token'
  );

  if (error) {
    console.error('[belvo] Error getting widget token:', error);
    throw new Error(error.message || 'Falha ao gerar token do widget');
  }

  if (!data?.access) {
    throw new Error('Token de acesso não foi retornado');
  }

  return {
    access: data.access,
    refresh: data.refresh,
  };
}

/**
 * Sincroniza um Link (banco conectado) e suas contas
 */
export async function syncLink(linkId: string): Promise<{
  success: boolean;
  link: {
    id: string;
    databaseId: string;
    institutionName: string;
    status: string;
  };
  accountsCount: number;
}> {
  const { data, error } = await supabase.functions.invoke('belvo-sync-link', {
    body: { linkId },
  });

  if (error) {
    console.error('[belvo] Error syncing link:', error);
    throw new Error(error.message || 'Falha ao sincronizar banco');
  }

  return data;
}

/**
 * Sincroniza transações de uma conta
 * @param accountId - UUID da conta no banco de dados (não o belvo_account_id)
 */
export async function syncTransactions(
  accountId: string,
  options?: {
    dateFrom?: string; // Data no formato YYYY-MM-DD
    dateTo?: string; // Data no formato YYYY-MM-DD
  }
): Promise<{
  success: boolean;
  total: number;
  saved: number;
  skipped: number;
  categorized: number;
}> {
  const { data, error } = await supabase.functions.invoke(
    'belvo-sync-transactions',
    {
      body: {
        accountId,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
      },
    }
  );

  if (error) {
    console.error('[belvo] Error syncing transactions:', error);
    throw new Error(error.message || 'Falha ao sincronizar transações');
  }

  return data;
}

/**
 * Busca todos os Links (bancos) conectados do usuário
 * Inclui a última sincronização das contas associadas
 * @param accountCategory - Filtra links que têm pelo menos uma conta da categoria especificada
 */
export async function getConnectedLinks(
  accountCategory?: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD'
) {
  const { data, error } = await supabase
    .from('belvo_links')
    .select(
      `
      *,
      belvo_accounts (
        last_sync_at,
        category
      )
    `
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[belvo] Error fetching links:', error);
    throw error;
  }

  // Processar para pegar a última sincronização mais recente de cada link
  let linksWithLastSync = (data || []).map((link: any) => {
    const accounts = link.belvo_accounts || [];
    const lastSyncDates = accounts
      .map((acc: any) => acc.last_sync_at)
      .filter((date: any) => date !== null);

    const lastSyncAt =
      lastSyncDates.length > 0
        ? lastSyncDates.sort(
            (a: string, b: string) =>
              new Date(b).getTime() - new Date(a).getTime()
          )[0]
        : null;

    // Guardar categorias de conta para filtro
    const accountCategories = accounts.map((acc: any) => acc.category);

    // Remover o array de contas e adicionar apenas o last_sync_at
    const { belvo_accounts, ...rest } = link;
    return {
      ...rest,
      last_sync_at: lastSyncAt,
      _accountCategories: accountCategories,
    };
  });

  // Filtrar por categoria de conta se especificado
  if (accountCategory) {
    linksWithLastSync = linksWithLastSync.filter((link: any) =>
      link._accountCategories.includes(accountCategory)
    );
  }

  // Remover campo temporário
  return linksWithLastSync.map((link: any) => {
    const { _accountCategories, ...rest } = link;
    return rest;
  });
}

/**
 * Busca todas as contas de um Link
 */
export async function getAccountsByLink(linkId: string) {
  const { data, error } = await supabase
    .from('belvo_accounts')
    .select('*')
    .eq('link_id', linkId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[belvo] Error fetching accounts:', error);
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
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }
) {
  let query = supabase
    .from('belvo_transactions')
    .select('*')
    .eq('account_id', accountId)
    .order('value_date', { ascending: false });

  if (options?.dateFrom) {
    query = query.gte('value_date', options.dateFrom);
  }

  if (options?.dateTo) {
    query = query.lte('value_date', options.dateTo);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[belvo] Error fetching transactions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Remove um Link (desconecta o banco)
 * Deleta tanto na Belvo API quanto no banco de dados local
 */
export async function disconnectLink(
  linkId: string
): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke('belvo-delete-link', {
    body: { linkId },
  });

  if (error) {
    console.error('[belvo] Error disconnecting link:', error);
    throw new Error(error.message || 'Falha ao desconectar banco');
  }

  return data;
}

/**
 * Busca instituições disponíveis na Belvo
 * Útil para mostrar lista de bancos disponíveis para conexão
 */
export async function getInstitutions(): Promise<
  Array<{
    name: string;
    type: string;
    country_code: string;
    logo: string | null;
    primary_color: string | null;
  }>
> {
  // Por enquanto retorna lista estática dos principais bancos brasileiros
  // No futuro pode ser integrado com API da Belvo se disponível
  return [
    {
      name: 'Banco do Brasil',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/banco_do_brasil.svg',
      primary_color: '#FFEF00',
    },
    {
      name: 'Bradesco',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/bradesco.svg',
      primary_color: '#CC092F',
    },
    {
      name: 'Itaú',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/itau.svg',
      primary_color: '#EC7000',
    },
    {
      name: 'Santander',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/santander_br.svg',
      primary_color: '#EC0000',
    },
    {
      name: 'Caixa',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/caixa.svg',
      primary_color: '#005CA9',
    },
    {
      name: 'Nubank',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/nubank.svg',
      primary_color: '#820AD1',
    },
    {
      name: 'Inter',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/inter.svg',
      primary_color: '#FF7A00',
    },
    {
      name: 'C6 Bank',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/c6bank.svg',
      primary_color: '#242424',
    },
    {
      name: 'BTG Pactual',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/btg.svg',
      primary_color: '#001E62',
    },
    {
      name: 'Original',
      type: 'bank',
      country_code: 'BR',
      logo: 'https://cdn.belvo.io/br/institutions/original.svg',
      primary_color: '#00A650',
    },
  ];
}
