import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers,
      });
    }

    // Ler body
    const { itemId } = await req.json();

    if (!itemId) {
      return new Response(
        JSON.stringify({ error: 'Missing itemId parameter' }),
        { status: 400, headers }
      );
    }

    console.log(
      `[pluggy-sync-item] Syncing item ${itemId} for user ${user.id}`
    );

    // Gerar API Key
    const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });

    if (!apiKeyResponse.ok) {
      console.error('[pluggy-sync-item] Failed to generate API key');
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Pluggy' }),
        { status: 500, headers }
      );
    }

    const { apiKey } = await apiKeyResponse.json();

    // Buscar informações do Item
    const itemResponse = await fetch(`https://api.pluggy.ai/items/${itemId}`, {
      headers: { 'X-API-KEY': apiKey },
    });

    if (!itemResponse.ok) {
      const errorText = await itemResponse.text();
      console.error('[pluggy-sync-item] Failed to fetch item:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch item from Pluggy' }),
        { status: 500, headers }
      );
    }

    const item = await itemResponse.json();
    console.log(`[pluggy-sync-item] Item fetched: ${item.connector.name}`);
    console.log(`[pluggy-sync-item] Item status: ${item.status}`);
    console.log(`[pluggy-sync-item] Item error:`, item.error);
    console.log(
      `[pluggy-sync-item] Item executionStatus:`,
      item.executionStatus
    );

    // Salvar/atualizar item no banco
    const { error: itemError } = await supabase.from('pluggy_items').upsert(
      {
        pluggy_item_id: item.id,
        user_id: user.id,
        connector_id: item.connector.id,
        connector_name: item.connector.name,
        status: item.status,
        last_updated_at: item.lastUpdatedAt,
        error_message: item.error?.message || null,
      },
      { onConflict: 'pluggy_item_id' }
    );

    if (itemError) {
      console.error('[pluggy-sync-item] Failed to save item:', itemError);
      return new Response(
        JSON.stringify({ error: 'Failed to save item to database' }),
        { status: 500, headers }
      );
    }

    console.log('[pluggy-sync-item] Item saved successfully');

    // Buscar contas do Item
    const accountsResponse = await fetch(
      `https://api.pluggy.ai/accounts?itemId=${itemId}`,
      { headers: { 'X-API-KEY': apiKey } }
    );

    if (!accountsResponse.ok) {
      console.error('[pluggy-sync-item] Failed to fetch accounts');
      return new Response(
        JSON.stringify({ error: 'Failed to fetch accounts from Pluggy' }),
        { status: 500, headers }
      );
    }

    const { results: accounts } = await accountsResponse.json();
    console.log(`[pluggy-sync-item] Found ${accounts.length} accounts`);

    // Buscar o UUID do item no banco para usar como foreign key
    const { data: itemData } = await supabase
      .from('pluggy_items')
      .select('id')
      .eq('pluggy_item_id', itemId)
      .single();

    if (!itemData) {
      return new Response(
        JSON.stringify({ error: 'Item not found in database' }),
        { status: 500, headers }
      );
    }

    // Salvar contas
    for (const account of accounts) {
      const { error: accountError } = await supabase
        .from('pluggy_accounts')
        .upsert(
          {
            pluggy_account_id: account.id,
            user_id: user.id,
            item_id: itemData.id,
            type: account.type,
            subtype: account.subtype,
            name: account.name,
            number: account.number,
            balance: account.balance,
            currency_code: account.currencyCode || 'BRL',
            credit_limit: account.creditData?.creditLimit,
            available_credit_limit: account.creditData?.availableCreditLimit,
            last_sync_at: new Date().toISOString(), // Registrar data da sincronização
          },
          { onConflict: 'pluggy_account_id' }
        );

      if (accountError) {
        console.error(
          `[pluggy-sync-item] Failed to save account ${account.id}:`,
          accountError
        );
      }
    }

    console.log('[pluggy-sync-item] Sync completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        item: {
          id: item.id,
          databaseId: itemData.id, // UUID do banco de dados para usar em MFA
          connectorName: item.connector.name,
          status: item.status,
          error: item.error || null,
          executionStatus: item.executionStatus || null,
        },
        accountsCount: accounts.length,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[pluggy-sync-item] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
