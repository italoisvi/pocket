import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
    // Usar service role para acessar dados de qualquer usuário
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Ler body
    const { accountId, userId } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing accountId parameter' }),
        { status: 400, headers }
      );
    }

    console.log(
      `[pluggy-sync-cron] Syncing account ${accountId} for user ${userId}`
    );

    // Buscar dados da conta
    const { data: accountData, error: accountError } = await supabase
      .from('pluggy_accounts')
      .select('id, pluggy_account_id, item_id, user_id')
      .eq('pluggy_account_id', accountId)
      .single();

    if (accountError || !accountData) {
      console.error('[pluggy-sync-cron] Account not found:', accountError);
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers,
      });
    }

    // Gerar API Key do Pluggy
    const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });

    if (!apiKeyResponse.ok) {
      console.error('[pluggy-sync-cron] Failed to generate API key');
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Pluggy' }),
        { status: 500, headers }
      );
    }

    const { apiKey } = await apiKeyResponse.json();

    // Buscar transações dos últimos 30 dias
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const from = fromDate.toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];

    const transactionsUrl = `https://api.pluggy.ai/transactions?accountId=${accountId}&from=${from}&to=${to}&pageSize=500`;

    console.log(
      `[pluggy-sync-cron] Fetching transactions from ${from} to ${to}`
    );

    const transactionsResponse = await fetch(transactionsUrl, {
      headers: { 'X-API-KEY': apiKey },
    });

    if (!transactionsResponse.ok) {
      const errorText = await transactionsResponse.text();
      console.error(
        '[pluggy-sync-cron] Failed to fetch transactions:',
        errorText
      );
      return new Response(
        JSON.stringify({ error: 'Failed to fetch transactions from Pluggy' }),
        { status: 500, headers }
      );
    }

    const transactionsData = await transactionsResponse.json();
    const transactions = transactionsData.results || [];

    console.log(`[pluggy-sync-cron] Found ${transactions.length} transactions`);

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
          user_id: accountData.user_id,
          account_id: accountData.id,
          description: transaction.description,
          description_raw: transaction.descriptionRaw,
          amount: transaction.amount,
          date: transaction.date.split('T')[0],
          status: transaction.status,
          type: transaction.type,
          category: transaction.category || null,
          provider_code: transaction.providerCode || null,
          synced: false,
        });

      if (transactionError) {
        console.error(
          `[pluggy-sync-cron] Failed to save transaction ${transaction.id}:`,
          transactionError
        );
      } else {
        savedCount++;
      }
    }

    // Atualizar saldo da conta e last_sync_at
    let balanceUpdated = false;
    let newBalance = null;

    const balanceResponse = await fetch(
      `https://api.pluggy.ai/accounts/${accountId}`,
      {
        headers: { 'X-API-KEY': apiKey },
      }
    );

    if (balanceResponse.ok) {
      const accountInfo = await balanceResponse.json();
      newBalance = accountInfo.balance;
      balanceUpdated = true;

      await supabase
        .from('pluggy_accounts')
        .update({
          balance: newBalance,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', accountData.id);

      console.log(`[pluggy-sync-cron] Updated balance: ${newBalance}`);
    } else {
      // Mesmo se balance falhar, atualizar last_sync_at para evitar loop
      await supabase
        .from('pluggy_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', accountData.id);

      console.log(
        `[pluggy-sync-cron] Balance fetch failed, but updated last_sync_at`
      );
    }

    console.log(
      `[pluggy-sync-cron] Sync completed: ${savedCount} saved, ${skippedCount} skipped`
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: transactions.length,
        saved: savedCount,
        skipped: skippedCount,
        balanceUpdated,
        newBalance,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[pluggy-sync-cron] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
