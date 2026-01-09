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
    const { accountId, from, to } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing accountId parameter' }),
        { status: 400, headers }
      );
    }

    console.log(
      `[pluggy-sync-transactions] Syncing transactions for account ${accountId}`
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
      console.error('[pluggy-sync-transactions] Failed to generate API key');
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Pluggy' }),
        { status: 500, headers }
      );
    }

    const { apiKey } = await apiKeyResponse.json();

    // Construir URL com filtros opcionais
    let transactionsUrl = `https://api.pluggy.ai/transactions?accountId=${accountId}&pageSize=500`;
    if (from) transactionsUrl += `&from=${from}`;
    if (to) transactionsUrl += `&to=${to}`;

    console.log(`[pluggy-sync-transactions] Fetching from URL: ${transactionsUrl}`);

    // Buscar transações
    const transactionsResponse = await fetch(transactionsUrl, {
      headers: { 'X-API-KEY': apiKey },
    });

    if (!transactionsResponse.ok) {
      const errorText = await transactionsResponse.text();
      console.error(
        '[pluggy-sync-transactions] Failed to fetch transactions:',
        errorText
      );
      console.error('[pluggy-sync-transactions] Status code:', transactionsResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch transactions from Pluggy' }),
        { status: 500, headers }
      );
    }

    const transactionsData = await transactionsResponse.json();
    const transactions = transactionsData.results || [];

    console.log(
      `[pluggy-sync-transactions] Found ${transactions.length} transactions`
    );
    console.log(`[pluggy-sync-transactions] Response data:`, JSON.stringify(transactionsData, null, 2));

    // Buscar o UUID da conta no banco
    const { data: accountData } = await supabase
      .from('pluggy_accounts')
      .select('id')
      .eq('pluggy_account_id', accountId)
      .single();

    if (!accountData) {
      return new Response(
        JSON.stringify({ error: 'Account not found in database' }),
        { status: 404, headers }
      );
    }

    // Salvar transações
    let savedCount = 0;
    let skippedCount = 0;

    for (const transaction of transactions) {
      // Verificar se já existe
      const { data: existing } = await supabase
        .from('pluggy_transactions')
        .select('id')
        .eq('pluggy_transaction_id', transaction.id)
        .single();

      if (existing) {
        skippedCount++;
        continue;
      }

      const { error: transactionError } = await supabase
        .from('pluggy_transactions')
        .insert({
          pluggy_transaction_id: transaction.id,
          user_id: user.id,
          account_id: accountData.id,
          description: transaction.description,
          description_raw: transaction.descriptionRaw,
          amount: transaction.amount,
          date: transaction.date.split('T')[0], // Apenas a data, sem hora
          status: transaction.status,
          type: transaction.type,
          category: transaction.category || null,
          provider_code: transaction.providerCode || null,
          synced: false,
        });

      if (transactionError) {
        console.error(
          `[pluggy-sync-transactions] Failed to save transaction ${transaction.id}:`,
          transactionError
        );
      } else {
        savedCount++;
      }
    }

    console.log(
      `[pluggy-sync-transactions] Sync completed: ${savedCount} saved, ${skippedCount} skipped`
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: transactions.length,
        saved: savedCount,
        skipped: skippedCount,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[pluggy-sync-transactions] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
