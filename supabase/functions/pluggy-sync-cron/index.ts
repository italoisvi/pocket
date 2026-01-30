import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  categorizeInBatch,
  type BatchTransaction,
} from '../_shared/categorize-with-walts.ts';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
      .select(
        'id, pluggy_account_id, item_id, user_id, pluggy_items(pluggy_item_id)'
      )
      .eq('pluggy_account_id', accountId)
      .single();

    if (accountError || !accountData) {
      console.error('[pluggy-sync-cron] Account not found:', accountError);
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers,
      });
    }

    const pluggyItemId = (accountData.pluggy_items as any)?.pluggy_item_id;

    if (!pluggyItemId) {
      console.error('[pluggy-sync-cron] Item not found for account');
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers,
      });
    }

    // Gerar API Key do Pluggy
    const apiKey = await getPluggyApiKey();

    // 1. DISPARAR ATUALIZAÇÃO DO ITEM usando endpoint correto (PATCH)
    console.log(
      `[pluggy-sync-cron] Triggering item refresh for item ${pluggyItemId}`
    );

    const updateResponse = await fetch(
      `https://api.pluggy.ai/items/${pluggyItemId}`,
      {
        method: 'PATCH',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Body vazio para usar credenciais salvas
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[pluggy-sync-cron] Item update failed:`, errorText);

      // Se rate limited, não é erro crítico
      if (updateResponse.status === 429) {
        console.log(
          '[pluggy-sync-cron] Rate limited, proceeding with existing data'
        );
      } else {
        // Continuar mesmo assim para buscar dados existentes
        console.log(
          '[pluggy-sync-cron] Update failed, proceeding with existing data'
        );
      }
    } else {
      console.log(`[pluggy-sync-cron] Item update triggered successfully`);
    }

    // 2. AGUARDAR PROCESSAMENTO
    // Fazer polling até que o status seja UPDATED (máximo 60 segundos)
    const maxAttempts = 15; // 15 tentativas x 4 segundos = 60 segundos
    let itemStatus = 'UPDATING';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      console.log(
        `[pluggy-sync-cron] Polling attempt ${attempt}/${maxAttempts}...`
      );

      const itemResponse = await fetch(
        `https://api.pluggy.ai/items/${pluggyItemId}`,
        { headers: { 'X-API-KEY': apiKey } }
      );

      if (itemResponse.ok) {
        const itemData = await itemResponse.json();
        itemStatus = itemData.status;
        console.log(`[pluggy-sync-cron] Item status: ${itemStatus}`);

        if (
          itemStatus === 'UPDATED' ||
          itemStatus === 'LOGIN_ERROR' ||
          itemStatus === 'OUTDATED'
        ) {
          break;
        }
      }
    }

    // 3. BUSCAR TRANSAÇÕES DOS ÚLTIMOS 30 DIAS
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

    // 4. PROCESSAR TRANSAÇÕES (igual ao webhook)
    let savedCount = 0;
    let skippedCount = 0;
    let categorizedCount = 0;
    let expensesCreated = 0;

    // Buscar expenses existentes para verificar duplicidades
    const { data: existingExpenses } = await supabase
      .from('expenses')
      .select('id, amount, date, establishment_name, category, subcategory')
      .eq('user_id', accountData.user_id)
      .or('source.is.null,source.eq.manual');

    // Criar mapa de expenses existentes para verificação rápida
    const existingExpensesMap = new Map<
      string,
      {
        id: string;
        establishment_name: string;
        amount: number;
        date: string;
        category: string;
        subcategory: string | null;
      }
    >();

    (existingExpenses || []).forEach((e: any) => {
      const roundedAmount = Math.round(Math.abs(e.amount));
      const key = `${roundedAmount}-${e.date}`;
      existingExpensesMap.set(key, {
        id: e.id,
        establishment_name: e.establishment_name,
        amount: e.amount,
        date: e.date,
        category: e.category,
        subcategory: e.subcategory,
      });
    });

    // Função para encontrar expense duplicado
    const findDuplicateExpense = (
      transactionAmount: number,
      transactionDate: string
    ) => {
      const roundedAmount = Math.round(Math.abs(transactionAmount));
      const dateStr = transactionDate.split('T')[0];

      // Tentar match exato
      const exactKey = `${roundedAmount}-${dateStr}`;
      if (existingExpensesMap.has(exactKey)) {
        return existingExpensesMap.get(exactKey)!;
      }

      // Tentar com tolerância de +/- R$1
      for (const tolerance of [-1, 1]) {
        const toleranceKey = `${roundedAmount + tolerance}-${dateStr}`;
        if (existingExpensesMap.has(toleranceKey)) {
          return existingExpensesMap.get(toleranceKey)!;
        }
      }

      // Tentar com tolerância de +/- 1 dia
      const date = new Date(dateStr);
      for (const dayOffset of [-1, 1]) {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() + dayOffset);
        const newDateStr = newDate.toISOString().split('T')[0];
        const dateToleranceKey = `${roundedAmount}-${newDateStr}`;
        if (existingExpensesMap.has(dateToleranceKey)) {
          return existingExpensesMap.get(dateToleranceKey)!;
        }
      }

      return null;
    };

    // Filtrar e salvar transações novas
    const insertedTransactions: Array<{
      dbId: string;
      pluggyId: string;
      description: string;
      amount: number;
      type: string;
      date: string;
      pluggyCategory: string | null;
      isDuplicate: boolean;
    }> = [];

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

      // Verificar duplicidade com expenses manuais
      const duplicateExpense = findDuplicateExpense(
        transaction.amount,
        transaction.date
      );
      const isDuplicate = duplicateExpense !== null;

      // Inserir transação
      const { data: insertedTransaction, error: transactionError } =
        await supabase
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
            synced: isDuplicate,
            expense_id: isDuplicate ? duplicateExpense?.id : null,
          })
          .select('id')
          .single();

      if (transactionError) {
        console.error(
          `[pluggy-sync-cron] Failed to save transaction ${transaction.id}:`,
          transactionError
        );
        continue;
      }

      savedCount++;

      // Se não é duplicata e é débito, guardar para categorização
      if (
        !isDuplicate &&
        insertedTransaction?.id &&
        transaction.type === 'DEBIT'
      ) {
        insertedTransactions.push({
          dbId: insertedTransaction.id,
          pluggyId: transaction.id,
          description: transaction.description,
          amount: transaction.amount,
          type: transaction.type,
          date: transaction.date.split('T')[0],
          pluggyCategory: transaction.category || null,
          isDuplicate,
        });
      }
    }

    // 5. CATEGORIZAR TRANSAÇÕES COM WALTS AI (igual ao pluggy-sync-transactions)
    if (insertedTransactions.length > 0) {
      console.log(
        `[pluggy-sync-cron] Categorizing ${insertedTransactions.length} transactions in batch`
      );

      const batchInput: BatchTransaction[] = insertedTransactions.map((tx) => ({
        id: tx.dbId,
        description: tx.description,
        amount: Math.abs(tx.amount),
        pluggyCategory: tx.pluggyCategory,
      }));

      try {
        const categorizations = await categorizeInBatch(batchInput, {
          supabase,
          userId: accountData.user_id,
        });

        // Criar mapa de categorizações
        const categorizationMap = new Map(
          categorizations.map((cat) => [cat.id, cat])
        );

        // 6. CRIAR EXPENSES AUTOMÁTICOS (igual ao webhook)
        const expensesToCreate: any[] = [];

        for (const tx of insertedTransactions) {
          const categorization = categorizationMap.get(tx.dbId);
          if (!categorization) continue;

          // Salvar categorização
          const { error: catError } = await supabase
            .from('transaction_categories')
            .insert({
              user_id: accountData.user_id,
              transaction_id: tx.dbId,
              category: categorization.category,
              subcategory: categorization.subcategory,
              is_fixed_cost: categorization.is_fixed_cost,
              categorized_by: 'walts_auto',
            });

          if (!catError) {
            categorizedCount++;
          }

          // Preparar expense para criação
          expensesToCreate.push({
            tx,
            expenseData: {
              user_id: accountData.user_id,
              establishment_name: tx.description,
              amount: Math.abs(tx.amount),
              date: tx.date,
              category: categorization.category,
              subcategory: categorization.subcategory,
              receipt_image_url: null,
              source: 'open_finance',
            },
          });
        }

        // Criar expenses
        if (expensesToCreate.length > 0) {
          console.log(
            `[pluggy-sync-cron] Creating ${expensesToCreate.length} new expenses`
          );

          const { data: createdExpenses } = await supabase
            .from('expenses')
            .insert(expensesToCreate.map((e) => e.expenseData))
            .select();

          if (createdExpenses && createdExpenses.length > 0) {
            // Vincular expenses às transações
            await Promise.all(
              expensesToCreate.map((e, index) =>
                supabase
                  .from('pluggy_transactions')
                  .update({
                    expense_id: createdExpenses[index].id,
                    synced: true,
                  })
                  .eq('id', e.tx.dbId)
              )
            );

            expensesCreated = createdExpenses.length;
            console.log(
              `[pluggy-sync-cron] ${createdExpenses.length} expenses created and linked`
            );
          }
        }

        console.log(
          `[pluggy-sync-cron] Batch categorization completed: ${categorizedCount} categorized`
        );
      } catch (batchError) {
        console.error(
          `[pluggy-sync-cron] Batch categorization error:`,
          batchError
        );
      }
    }

    // 7. ATUALIZAR SALDO DA CONTA
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
          credit_limit: accountInfo.creditData?.creditLimit,
          available_credit_limit: accountInfo.creditData?.availableCreditLimit,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', accountData.id);

      console.log(`[pluggy-sync-cron] Updated balance: ${newBalance}`);
    } else {
      // Mesmo se balance falhar, atualizar last_sync_at
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
      `[pluggy-sync-cron] Sync completed: ${savedCount} saved, ${skippedCount} skipped, ${categorizedCount} categorized, ${expensesCreated} expenses created`
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: transactions.length,
        saved: savedCount,
        skipped: skippedCount,
        categorized: categorizedCount,
        expensesCreated,
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
