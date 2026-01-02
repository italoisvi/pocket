import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');

serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    // Ler o body do webhook
    const webhookEvent = await req.json();
    console.log(
      '[pluggy-webhook] Received event:',
      JSON.stringify(webhookEvent)
    );

    const { event, data, itemId, accountId, transactionIds } = webhookEvent;

    // Normalizar o payload: se não tem 'data', usar o próprio webhookEvent
    const eventData = data || {
      item: { id: itemId },
      account: { id: accountId },
      transactionIds: transactionIds,
    };

    if (!event) {
      console.error('[pluggy-webhook] Invalid webhook payload - missing event');
      return new Response(
        JSON.stringify({ error: 'Invalid webhook payload' }),
        { status: 400, headers }
      );
    }

    // Criar cliente Supabase com service role (admin)
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Processar eventos
    switch (event) {
      case 'item/created':
        await handleItemCreated(supabase, eventData);
        break;

      case 'item/updated':
        await handleItemUpdated(supabase, eventData);
        break;

      case 'item/deleted':
        await handleItemDeleted(supabase, eventData);
        break;

      case 'item/error':
        await handleItemError(supabase, eventData);
        break;

      case 'item/waiting_user_input':
        await handleItemWaitingUserInput(supabase, eventData);
        break;

      case 'transactions/created':
        await handleTransactionsCreated(supabase, eventData);
        break;

      case 'transactions/deleted':
        await handleTransactionsDeleted(supabase, eventData);
        break;

      default:
        console.log('[pluggy-webhook] Unhandled event:', event);
    }

    return new Response(JSON.stringify({ success: true }), { headers });
  } catch (error) {
    console.error('[pluggy-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});

async function handleItemCreated(supabase: any, data: any) {
  console.log('[pluggy-webhook] Item created:', data.item.id);

  // Buscar user_id pelo pluggy_item_id
  const { data: itemData } = await supabase
    .from('pluggy_items')
    .select('user_id')
    .eq('pluggy_item_id', data.item.id)
    .single();

  if (!itemData) {
    console.error('[pluggy-webhook] Item not found in database');
    return;
  }

  // Atualizar status do item
  await supabase
    .from('pluggy_items')
    .update({
      status: data.item.status,
      last_updated_at: data.item.lastUpdatedAt,
      error_message: data.item.error?.message || null,
    })
    .eq('pluggy_item_id', data.item.id);

  console.log('[pluggy-webhook] Item created processed');
}

async function handleItemUpdated(supabase: any, data: any) {
  console.log('[pluggy-webhook] Item updated:', data.item.id);

  // Atualizar status do item
  const { error } = await supabase
    .from('pluggy_items')
    .update({
      status: data.item.status,
      last_updated_at: data.item.lastUpdatedAt,
      error_message: data.item.error?.message || null,
    })
    .eq('pluggy_item_id', data.item.id);

  if (error) {
    console.error('[pluggy-webhook] Error updating item:', error);
    return;
  }

  // Se o item foi atualizado com sucesso (UPDATED), sincronizar accounts
  if (data.item.status === 'UPDATED') {
    console.log('[pluggy-webhook] Item status is UPDATED, syncing accounts...');
    await syncItemAccounts(supabase, data.item.id);
  }

  console.log('[pluggy-webhook] Item updated processed');
}

async function handleItemDeleted(supabase: any, data: any) {
  console.log('[pluggy-webhook] Item deleted:', data.item.id);

  // Deletar item do banco de dados
  await supabase
    .from('pluggy_items')
    .delete()
    .eq('pluggy_item_id', data.item.id);

  console.log('[pluggy-webhook] Item deleted processed');
}

async function handleItemError(supabase: any, data: any) {
  console.log('[pluggy-webhook] Item error:', data.item.id);

  // Atualizar status do item com erro
  await supabase
    .from('pluggy_items')
    .update({
      status: data.item.status,
      error_message: data.item.error?.message || 'Unknown error',
      last_updated_at: data.item.lastUpdatedAt,
    })
    .eq('pluggy_item_id', data.item.id);

  console.log('[pluggy-webhook] Item error processed');
}

async function handleItemWaitingUserInput(supabase: any, data: any) {
  console.log('[pluggy-webhook] Item waiting user input:', data.item.id);

  // Atualizar status para WAITING_USER_INPUT
  await supabase
    .from('pluggy_items')
    .update({
      status: 'WAITING_USER_INPUT',
      last_updated_at: data.item.lastUpdatedAt,
    })
    .eq('pluggy_item_id', data.item.id);

  console.log('[pluggy-webhook] Item waiting user input processed');
}

async function handleTransactionsCreated(supabase: any, data: any) {
  console.log(
    '[pluggy-webhook] Transactions created for account:',
    data.account.id
  );

  // Buscar o UUID da conta no banco
  const { data: accountData } = await supabase
    .from('pluggy_accounts')
    .select('id, user_id')
    .eq('pluggy_account_id', data.account.id)
    .single();

  if (!accountData) {
    console.error('[pluggy-webhook] Account not found in database');
    return;
  }

  // Gerar API Key para buscar as transações
  const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    }),
  });

  if (!apiKeyResponse.ok) {
    console.error('[pluggy-webhook] Failed to generate API key');
    return;
  }

  const { apiKey } = await apiKeyResponse.json();

  // Buscar as novas transações
  const transactionsResponse = await fetch(
    `https://api.pluggy.ai/transactions?accountId=${data.account.id}&pageSize=500`,
    {
      headers: { 'X-API-KEY': apiKey },
    }
  );

  if (!transactionsResponse.ok) {
    console.error('[pluggy-webhook] Failed to fetch transactions');
    return;
  }

  const { results: transactions } = await transactionsResponse.json();
  console.log(
    `[pluggy-webhook] Found ${transactions.length} transactions to sync`
  );

  // Salvar transações
  for (const transaction of transactions) {
    await supabase.from('pluggy_transactions').upsert(
      {
        pluggy_transaction_id: transaction.id,
        user_id: accountData.user_id,
        account_id: accountData.id,
        description: transaction.description,
        description_raw: transaction.descriptionRaw,
        amount: transaction.amount,
        date: transaction.date,
        category: transaction.category,
        currency_code: transaction.currencyCode || 'BRL',
        payment_data_payer_name: transaction.paymentData?.payer?.name,
        payment_data_payer_document_number:
          transaction.paymentData?.payer?.documentNumber?.value,
        payment_data_receiver_name: transaction.paymentData?.receiver?.name,
        payment_data_receiver_document_number:
          transaction.paymentData?.receiver?.documentNumber?.value,
      },
      { onConflict: 'pluggy_transaction_id' }
    );
  }

  console.log('[pluggy-webhook] Transactions created processed');
}

async function handleTransactionsDeleted(supabase: any, data: any) {
  console.log(
    '[pluggy-webhook] Transactions deleted for account:',
    data.account.id
  );

  // Deletar transações que não existem mais
  // (Pluggy não envia IDs das transações deletadas, então vamos reprocessar todas)
  // Por enquanto, apenas logar o evento
  console.log('[pluggy-webhook] Transactions deleted - manual sync required');
}

async function syncItemAccounts(supabase: any, pluggyItemId: string) {
  console.log('[pluggy-webhook] Syncing accounts for item:', pluggyItemId);

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
    console.error('[pluggy-webhook] Failed to generate API key');
    return;
  }

  const { apiKey } = await apiKeyResponse.json();

  // Buscar contas do Item
  const accountsResponse = await fetch(
    `https://api.pluggy.ai/accounts?itemId=${pluggyItemId}`,
    { headers: { 'X-API-KEY': apiKey } }
  );

  if (!accountsResponse.ok) {
    console.error('[pluggy-webhook] Failed to fetch accounts');
    return;
  }

  const { results: accounts } = await accountsResponse.json();
  console.log(`[pluggy-webhook] Found ${accounts.length} accounts`);

  // Buscar o UUID do item e user_id
  const { data: itemData } = await supabase
    .from('pluggy_items')
    .select('id, user_id')
    .eq('pluggy_item_id', pluggyItemId)
    .single();

  if (!itemData) {
    console.error('[pluggy-webhook] Item not found in database');
    return;
  }

  // Salvar contas
  for (const account of accounts) {
    await supabase.from('pluggy_accounts').upsert(
      {
        pluggy_account_id: account.id,
        user_id: itemData.user_id,
        item_id: itemData.id,
        type: account.type,
        subtype: account.subtype,
        name: account.name,
        number: account.number,
        balance: account.balance,
        currency_code: account.currencyCode || 'BRL',
        credit_limit: account.creditData?.creditLimit,
        available_credit_limit: account.creditData?.availableCreditLimit,
      },
      { onConflict: 'pluggy_account_id' }
    );
  }

  console.log('[pluggy-webhook] Accounts synced successfully');
}
