import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  categorizeInBatch,
  type BatchTransaction,
} from '../_shared/categorize-with-walts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

// Tipos para o payload do webhook da Pluggy (baseado na documentação oficial)
type PluggyWebhookPayload = {
  event: string;
  eventId: string;
  itemId?: string;
  accountId?: string;
  triggeredBy?: 'USER' | 'CLIENT' | 'SYNC' | 'INTERNAL';
  clientUserId?: string;
  createdTransactionsLink?: string;
  transactionsCreatedAtFrom?: string;
};

// Gera API Key para chamadas à API da Pluggy
async function getPluggyApiKey(): Promise<string> {
  const response = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to authenticate with Pluggy API');
  }

  const { apiKey } = await response.json();
  return apiKey;
}

// Envia notificação para o usuário via Telegram
async function sendTelegramNotification(
  supabase: any,
  userId: string,
  message: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log(
      '[pluggy-webhook] Telegram bot token not configured, skipping notification'
    );
    return;
  }

  try {
    // Buscar conta do Telegram vinculada ao usuário
    const { data: telegramAccount } = await supabase
      .from('telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', userId)
      .single();

    if (!telegramAccount) {
      console.log(
        '[pluggy-webhook] No Telegram account linked for user:',
        userId
      );
      return;
    }

    // Enviar mensagem via API do Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramAccount.telegram_user_id,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[pluggy-webhook] Failed to send Telegram notification:',
        errorText
      );
    } else {
      console.log('[pluggy-webhook] Telegram notification sent successfully');
    }
  } catch (error) {
    console.error(
      '[pluggy-webhook] Error sending Telegram notification:',
      error
    );
  }
}

// Busca informações completas do Item na API da Pluggy
async function fetchItemFromPluggy(
  apiKey: string,
  itemId: string
): Promise<any> {
  const response = await fetch(`https://api.pluggy.ai/items/${itemId}`, {
    headers: { 'X-API-KEY': apiKey },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch item ${itemId} from Pluggy`);
  }

  return response.json();
}

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
    const webhookPayload: PluggyWebhookPayload = await req.json();
    console.log(
      '[pluggy-webhook] Received event:',
      JSON.stringify(webhookPayload)
    );

    const { event, itemId, accountId, createdTransactionsLink } =
      webhookPayload;

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

    // Processar eventos em background para responder rapidamente à Pluggy
    // A Pluggy tem timeout de 5 segundos, então respondemos imediatamente
    // e processamos em background usando EdgeRuntime.waitUntil()
    const processEvent = async () => {
      try {
        switch (event) {
          case 'item/created':
            if (itemId) await handleItemCreated(supabase, itemId);
            break;

          case 'item/updated':
            if (itemId) await handleItemUpdated(supabase, itemId);
            break;

          case 'item/deleted':
            if (itemId) await handleItemDeleted(supabase, itemId);
            break;

          case 'item/error':
            if (itemId) await handleItemError(supabase, itemId);
            break;

          case 'item/waiting_user_input':
            if (itemId) await handleItemWaitingUserInput(supabase, itemId);
            break;

          case 'transactions/created':
            if (accountId) {
              await handleTransactionsCreated(
                supabase,
                accountId,
                createdTransactionsLink
              );
            }
            break;

          case 'transactions/deleted':
            if (accountId) await handleTransactionsDeleted(supabase, accountId);
            break;

          default:
            console.log('[pluggy-webhook] Unhandled event:', event);
        }
        console.log(`[pluggy-webhook] Event ${event} processed successfully`);
      } catch (error) {
        console.error(
          `[pluggy-webhook] Error processing event ${event}:`,
          error
        );
      }
    };

    // Usar EdgeRuntime.waitUntil para processar em background
    // @ts-ignore - EdgeRuntime é disponível no Deno Deploy/Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processEvent());
    } else {
      // Fallback: processar de forma assíncrona sem esperar
      processEvent().catch(console.error);
    }

    // Responder imediatamente à Pluggy
    return new Response(
      JSON.stringify({ success: true, processing: 'background' }),
      { headers }
    );
  } catch (error) {
    console.error('[pluggy-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});

async function handleItemCreated(supabase: any, itemId: string) {
  console.log('[pluggy-webhook] Item created:', itemId);

  try {
    // Buscar dados completos do Item na API da Pluggy
    const apiKey = await getPluggyApiKey();
    const item = await fetchItemFromPluggy(apiKey, itemId);

    console.log('[pluggy-webhook] Item fetched from Pluggy:', {
      id: item.id,
      status: item.status,
      connectorName: item.connector?.name,
    });

    // Verificar se o item existe no banco
    const { data: existingItem } = await supabase
      .from('pluggy_items')
      .select('id, user_id')
      .eq('pluggy_item_id', itemId)
      .single();

    if (!existingItem) {
      console.log('[pluggy-webhook] Item not in database yet, skipping update');
      return;
    }

    // Atualizar status do item
    await supabase
      .from('pluggy_items')
      .update({
        status: item.status,
        last_updated_at: item.lastUpdatedAt,
        error_message: item.error?.message || null,
      })
      .eq('pluggy_item_id', itemId);

    // Se o item foi criado com sucesso, sincronizar contas
    if (item.status === 'UPDATED') {
      console.log(
        '[pluggy-webhook] Item created with UPDATED status, syncing accounts...'
      );
      await syncItemAccounts(supabase, itemId);
    }

    console.log('[pluggy-webhook] Item created processed');
  } catch (error) {
    console.error('[pluggy-webhook] Error handling item created:', error);
  }
}

async function handleItemUpdated(supabase: any, itemId: string) {
  console.log('[pluggy-webhook] Item updated:', itemId);

  try {
    // Buscar dados completos do Item na API da Pluggy
    const apiKey = await getPluggyApiKey();
    const item = await fetchItemFromPluggy(apiKey, itemId);

    console.log('[pluggy-webhook] Item fetched from Pluggy:', {
      id: item.id,
      status: item.status,
      executionStatus: item.executionStatus,
      connectorName: item.connector?.name,
      lastUpdatedAt: item.lastUpdatedAt,
    });

    // Atualizar status do item no banco
    const { error } = await supabase
      .from('pluggy_items')
      .update({
        status: item.status,
        last_updated_at: item.lastUpdatedAt,
        error_message: item.error?.message || null,
      })
      .eq('pluggy_item_id', itemId);

    if (error) {
      console.error('[pluggy-webhook] Error updating item in database:', error);
      return;
    }

    // Sincronizar contas se o item foi atualizado com sucesso
    // Aceitar UPDATED ou executionStatus SUCCESS/PARTIAL_SUCCESS
    const shouldSync =
      item.status === 'UPDATED' ||
      item.executionStatus === 'SUCCESS' ||
      item.executionStatus === 'PARTIAL_SUCCESS';

    if (shouldSync) {
      console.log('[pluggy-webhook] Syncing accounts and transactions...');
      await syncItemAccounts(supabase, itemId);

      // Sincronizar transações de todas as contas do item
      await syncItemTransactions(supabase, itemId, apiKey);

      // Buscar user_id do item para notificação
      const { data: itemData } = await supabase
        .from('pluggy_items')
        .select('user_id')
        .eq('pluggy_item_id', itemId)
        .single();

      if (itemData?.user_id) {
        // Enviar notificação de sucesso via Telegram
        const connectorName = item.connector?.name || 'Banco';
        await sendTelegramNotification(
          supabase,
          itemData.user_id,
          `✅ <b>Conta conectada com sucesso!</b>\n\n🏦 ${connectorName}\n\nSuas transações estão sendo importadas automaticamente. Use /saldo para ver seu saldo atualizado.`
        );
      }
    } else {
      console.log(
        '[pluggy-webhook] Item not ready for sync, status:',
        item.status
      );
    }

    console.log('[pluggy-webhook] Item updated processed successfully');
  } catch (error) {
    console.error('[pluggy-webhook] Error handling item updated:', error);
  }
}

async function handleItemDeleted(supabase: any, itemId: string) {
  console.log('[pluggy-webhook] Item deleted:', itemId);

  // Deletar item do banco de dados (cascata deleta contas e transações via FK)
  const { error } = await supabase
    .from('pluggy_items')
    .delete()
    .eq('pluggy_item_id', itemId);

  if (error) {
    console.error('[pluggy-webhook] Error deleting item:', error);
  } else {
    console.log('[pluggy-webhook] Item deleted processed');
  }
}

async function handleItemError(supabase: any, itemId: string) {
  console.log('[pluggy-webhook] Item error:', itemId);

  try {
    // Buscar dados completos do Item na API da Pluggy para obter detalhes do erro
    const apiKey = await getPluggyApiKey();
    const item = await fetchItemFromPluggy(apiKey, itemId);

    console.log('[pluggy-webhook] Item error details:', {
      id: item.id,
      status: item.status,
      error: item.error,
    });

    // Atualizar status do item com erro
    await supabase
      .from('pluggy_items')
      .update({
        status: item.status || 'LOGIN_ERROR',
        error_message: item.error?.message || 'Unknown error',
        last_updated_at: item.lastUpdatedAt || new Date().toISOString(),
      })
      .eq('pluggy_item_id', itemId);

    // Buscar user_id para notificação
    const { data: itemData } = await supabase
      .from('pluggy_items')
      .select('user_id')
      .eq('pluggy_item_id', itemId)
      .single();

    if (itemData?.user_id) {
      const connectorName = item.connector?.name || 'Banco';
      const errorMessage = item.error?.message || 'Erro desconhecido';
      await sendTelegramNotification(
        supabase,
        itemData.user_id,
        `❌ <b>Erro na conexão bancária</b>\n\n🏦 ${connectorName}\n\n${errorMessage}\n\nUse /conectar para tentar novamente.`
      );
    }

    console.log('[pluggy-webhook] Item error processed');
  } catch (error) {
    console.error('[pluggy-webhook] Error handling item error:', error);

    // Mesmo se falhar ao buscar da API, atualizar status como erro
    await supabase
      .from('pluggy_items')
      .update({
        status: 'LOGIN_ERROR',
        error_message: 'Error fetching item details',
        last_updated_at: new Date().toISOString(),
      })
      .eq('pluggy_item_id', itemId);
  }
}

async function handleItemWaitingUserInput(supabase: any, itemId: string) {
  console.log('[pluggy-webhook] Item waiting user input:', itemId);

  // Atualizar status para WAITING_USER_INPUT
  const { error } = await supabase
    .from('pluggy_items')
    .update({
      status: 'WAITING_USER_INPUT',
      last_updated_at: new Date().toISOString(),
    })
    .eq('pluggy_item_id', itemId);

  if (error) {
    console.error(
      '[pluggy-webhook] Error updating item waiting user input:',
      error
    );
  } else {
    // Buscar user_id para notificação
    const { data: itemData } = await supabase
      .from('pluggy_items')
      .select('user_id, connector_name')
      .eq('pluggy_item_id', itemId)
      .single();

    if (itemData?.user_id) {
      const connectorName = itemData.connector_name || 'Banco';
      await sendTelegramNotification(
        supabase,
        itemData.user_id,
        `⚠️ <b>Ação necessária</b>\n\n🏦 ${connectorName}\n\nSeu banco está solicitando confirmação adicional (token, SMS ou aprovação no app).\n\nUse /conectar para completar a conexão.`
      );
    }

    console.log('[pluggy-webhook] Item waiting user input processed');
  }
}

async function handleTransactionsCreated(
  supabase: any,
  accountId: string,
  createdTransactionsLink?: string
) {
  console.log('[pluggy-webhook] Transactions created for account:', accountId);

  // Buscar o UUID da conta no banco
  const { data: accountData } = await supabase
    .from('pluggy_accounts')
    .select('id, user_id')
    .eq('pluggy_account_id', accountId)
    .single();

  if (!accountData) {
    console.error('[pluggy-webhook] Account not found in database:', accountId);
    return;
  }

  try {
    // Gerar API Key para buscar as transações
    const apiKey = await getPluggyApiKey();

    // Usar createdTransactionsLink se disponível (mais eficiente)
    let transactionsUrl = `https://api.pluggy.ai/transactions?accountId=${accountId}&pageSize=500`;

    if (createdTransactionsLink) {
      console.log(
        '[pluggy-webhook] Using createdTransactionsLink for efficiency'
      );
      transactionsUrl = createdTransactionsLink;
    }

    // Buscar as novas transações
    const transactionsResponse = await fetch(transactionsUrl, {
      headers: { 'X-API-KEY': apiKey },
    });

    if (!transactionsResponse.ok) {
      console.error('[pluggy-webhook] Failed to fetch transactions');
      return;
    }

    const { results: transactions } = await transactionsResponse.json();
    console.log(
      `[pluggy-webhook] Found ${transactions.length} transactions to sync`
    );

    if (transactions.length === 0) {
      console.log('[pluggy-webhook] No transactions to process');
      return;
    }

    // Processar transações
    await processTransactions(supabase, transactions, accountData);

    console.log('[pluggy-webhook] Transactions created processed');
  } catch (error) {
    console.error(
      '[pluggy-webhook] Error handling transactions created:',
      error
    );
  }
}

async function handleTransactionsDeleted(supabase: any, accountId: string) {
  console.log('[pluggy-webhook] Transactions deleted for account:', accountId);

  // Nota: A Pluggy não envia os IDs das transações deletadas
  // A melhor prática é fazer uma sincronização completa da conta
  console.log(
    '[pluggy-webhook] Transactions deleted event received - will resync on next update'
  );
}

async function syncItemAccounts(supabase: any, pluggyItemId: string) {
  console.log('[pluggy-webhook] Syncing accounts for item:', pluggyItemId);

  try {
    const apiKey = await getPluggyApiKey();

    // Buscar contas do Item
    const accountsResponse = await fetch(
      `https://api.pluggy.ai/accounts?itemId=${pluggyItemId}`,
      { headers: { 'X-API-KEY': apiKey } }
    );

    if (!accountsResponse.ok) {
      console.error('[pluggy-webhook] Failed to fetch accounts from Pluggy');
      return;
    }

    const { results: accounts } = await accountsResponse.json();
    console.log(
      `[pluggy-webhook] Found ${accounts.length} accounts from Pluggy`
    );

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

    // Preparar todas as contas para inserção em lote
    const accountsData = accounts.map((account: any) => ({
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
    }));

    // Inserção em lote
    console.log(`[pluggy-webhook] Upserting ${accountsData.length} accounts`);
    const { error } = await supabase
      .from('pluggy_accounts')
      .upsert(accountsData, { onConflict: 'pluggy_account_id' });

    if (error) {
      console.error('[pluggy-webhook] Error upserting accounts:', error);
    } else {
      console.log('[pluggy-webhook] Accounts synced successfully');
    }
  } catch (error) {
    console.error('[pluggy-webhook] Error syncing accounts:', error);
  }
}

// Sincroniza transações de todas as contas de um Item
async function syncItemTransactions(
  supabase: any,
  pluggyItemId: string,
  apiKey: string
) {
  console.log('[pluggy-webhook] Syncing transactions for item:', pluggyItemId);

  try {
    // Buscar todas as contas do item no banco local
    const { data: accounts, error: accountsError } = await supabase
      .from('pluggy_accounts')
      .select('id, pluggy_account_id, user_id')
      .eq(
        'item_id',
        (
          await supabase
            .from('pluggy_items')
            .select('id')
            .eq('pluggy_item_id', pluggyItemId)
            .single()
        ).data?.id
      );

    if (accountsError || !accounts || accounts.length === 0) {
      console.log('[pluggy-webhook] No accounts found to sync transactions');
      return;
    }

    console.log(
      `[pluggy-webhook] Syncing transactions for ${accounts.length} accounts`
    );

    // Sincronizar transações de cada conta em paralelo
    await Promise.all(
      accounts.map(async (account: any) => {
        try {
          // Buscar transações do mês corrente
          const now = new Date();
          const fromDateStr = new Date(now.getFullYear(), now.getMonth(), 1)
            .toISOString()
            .split('T')[0];

          const transactionsResponse = await fetch(
            `https://api.pluggy.ai/transactions?accountId=${account.pluggy_account_id}&from=${fromDateStr}&pageSize=500`,
            { headers: { 'X-API-KEY': apiKey } }
          );

          if (!transactionsResponse.ok) {
            console.error(
              `[pluggy-webhook] Failed to fetch transactions for account ${account.pluggy_account_id}`
            );
            return;
          }

          const { results: transactions } = await transactionsResponse.json();
          console.log(
            `[pluggy-webhook] Found ${transactions.length} transactions for account ${account.pluggy_account_id}`
          );

          if (transactions.length > 0) {
            await processTransactions(supabase, transactions, {
              id: account.id,
              user_id: account.user_id,
            });
          }
        } catch (error) {
          console.error(
            `[pluggy-webhook] Error syncing transactions for account ${account.pluggy_account_id}:`,
            error
          );
        }
      })
    );

    console.log('[pluggy-webhook] Transactions synced successfully');
  } catch (error) {
    console.error('[pluggy-webhook] Error syncing item transactions:', error);
  }
}

// Processa e salva transações no banco de dados
async function processTransactions(
  supabase: any,
  transactions: any[],
  accountData: { id: string; user_id: string }
) {
  const transactionsToInsert: any[] = [];

  // Preparar todas as transações para inserção
  for (const transaction of transactions) {
    transactionsToInsert.push({
      pluggy_transaction_id: transaction.id,
      user_id: accountData.user_id,
      account_id: accountData.id,
      description: transaction.description,
      description_raw: transaction.descriptionRaw,
      amount: transaction.amount,
      date: transaction.date.split('T')[0],
      category: transaction.category,
      status: transaction.status,
      type: transaction.type,
      provider_code: transaction.providerCode || null,
      synced: false,
    });
  }

  // Inserção em lote
  console.log(
    `[pluggy-webhook] Upserting ${transactionsToInsert.length} transactions`
  );
  const { data: savedTransactions, error: txError } = await supabase
    .from('pluggy_transactions')
    .upsert(transactionsToInsert, {
      onConflict: 'pluggy_transaction_id',
    })
    .select();

  if (txError) {
    console.error('[pluggy-webhook] Error upserting transactions:', txError);
    return;
  }

  // Filtrar transações de débito para categorização
  const debitTransactions = (savedTransactions || []).filter(
    (tx: any) => tx.amount < 0 && !tx.expense_id
  );

  if (debitTransactions.length === 0) {
    console.log('[pluggy-webhook] No debit transactions to categorize');
    return;
  }

  console.log(
    `[pluggy-webhook] Categorizing ${debitTransactions.length} debit transactions in batch`
  );

  // Preparar batch para categorização
  const batchInput: BatchTransaction[] = debitTransactions.map((tx: any) => ({
    id: tx.id,
    description: tx.description,
    amount: Math.abs(tx.amount),
    pluggyCategory: tx.category,
  }));

  try {
    // Categorizar todas de uma vez
    const categorizations = await categorizeInBatch(batchInput, {
      supabase,
      userId: accountData.user_id,
    });

    // Criar mapa de categorizações
    const categorizationMap = new Map(
      categorizations.map((cat) => [cat.id, cat])
    );

    // Buscar expenses existentes do usuário para verificar duplicidades
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: existingExpenses } = await supabase
      .from('expenses')
      .select('id, amount, date, establishment_name')
      .eq('user_id', accountData.user_id)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0]);

    const expensesToCreate: any[] = [];
    const duplicatesFound: { txId: string; expenseId: string }[] = [];

    for (const tx of debitTransactions) {
      const txAmount = Math.abs(tx.amount);
      const txDate = new Date(tx.date);
      const categorization = categorizationMap.get(tx.id);

      if (!categorization) continue;

      // Verificar se já existe um expense similar (possível duplicata)
      const duplicate = existingExpenses?.find((exp: any) => {
        const expAmount = parseFloat(exp.amount);
        const expDate = new Date(exp.date);

        // Critérios de duplicidade:
        // 1. Valor similar (±5%)
        const amountDiff = Math.abs(expAmount - txAmount) / txAmount;
        const amountMatches = amountDiff <= 0.05;

        // 2. Data similar (±1 dia)
        const daysDiff = Math.abs(
          (txDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const dateMatches = daysDiff <= 1;

        return amountMatches && dateMatches;
      });

      if (duplicate) {
        duplicatesFound.push({
          txId: tx.id,
          expenseId: duplicate.id,
        });
        console.log(
          `[pluggy-webhook] Duplicate found: ${tx.description} (R$${txAmount}) matches expense ${duplicate.id}`
        );
      } else {
        expensesToCreate.push({
          tx,
          expenseData: {
            user_id: accountData.user_id,
            establishment_name: tx.description,
            amount: txAmount,
            date: tx.date,
            category: categorization.category,
            subcategory: categorization.subcategory,
            receipt_image_url: null,
          },
        });
      }
    }

    // Vincular duplicatas aos expenses existentes
    if (duplicatesFound.length > 0) {
      console.log(
        `[pluggy-webhook] Linking ${duplicatesFound.length} duplicate transactions to existing expenses`
      );
      await Promise.all(
        duplicatesFound.map(({ txId, expenseId }) =>
          supabase
            .from('pluggy_transactions')
            .update({ expense_id: expenseId, synced: true })
            .eq('id', txId)
        )
      );
    }

    // Criar novos expenses para transações não duplicatas
    if (expensesToCreate.length > 0) {
      console.log(
        `[pluggy-webhook] Creating ${expensesToCreate.length} new expenses`
      );

      const { data: createdExpenses } = await supabase
        .from('expenses')
        .insert(expensesToCreate.map((e) => e.expenseData))
        .select();

      if (createdExpenses && createdExpenses.length > 0) {
        await Promise.all(
          expensesToCreate.map((e, index) =>
            supabase
              .from('pluggy_transactions')
              .update({ expense_id: createdExpenses[index].id, synced: true })
              .eq('id', e.tx.id)
          )
        );

        console.log(
          `[pluggy-webhook] ${createdExpenses.length} expenses created and linked`
        );
      }
    }

    console.log(
      `[pluggy-webhook] Summary: ${duplicatesFound.length} duplicates linked, ${expensesToCreate.length} new expenses created`
    );
  } catch (batchError) {
    console.error('[pluggy-webhook] Batch categorization error:', batchError);
  }
}
