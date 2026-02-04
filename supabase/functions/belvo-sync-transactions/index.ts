import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  categorizeInBatch,
  type BatchTransaction,
} from '../_shared/categorize-with-walts.ts';

const BELVO_SECRET_ID = Deno.env.get('BELVO_SECRET_ID');
const BELVO_SECRET_PASSWORD = Deno.env.get('BELVO_SECRET_PASSWORD');
const BELVO_ENV = Deno.env.get('BELVO_ENV') || 'sandbox';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const BELVO_API_URL =
  BELVO_ENV === 'production'
    ? 'https://api.belvo.com'
    : 'https://sandbox.belvo.com';

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
    const { accountId, dateFrom, dateTo } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing accountId parameter' }),
        { status: 400, headers }
      );
    }

    console.log(
      `[belvo-sync-transactions] Syncing transactions for account ${accountId}`
    );

    // Buscar o belvo_account_id correspondente ao UUID do banco
    const { data: accountData, error: accountError } = await supabase
      .from('belvo_accounts')
      .select('belvo_account_id, link_id')
      .eq('id', accountId)
      .single();

    if (accountError || !accountData) {
      console.error(
        '[belvo-sync-transactions] Account not found:',
        accountError
      );
      return new Response(
        JSON.stringify({ error: 'Account not found in database' }),
        { status: 404, headers }
      );
    }

    // Buscar o link_id da Belvo
    const { data: linkData } = await supabase
      .from('belvo_links')
      .select('belvo_link_id')
      .eq('id', accountData.link_id)
      .single();

    if (!linkData) {
      return new Response(
        JSON.stringify({ error: 'Link not found in database' }),
        { status: 404, headers }
      );
    }

    // Criar credenciais Basic Auth
    const credentials = btoa(`${BELVO_SECRET_ID}:${BELVO_SECRET_PASSWORD}`);

    // Construir URL com filtros
    // Na Belvo, as transações são buscadas por link, não por account diretamente
    let transactionsUrl = `${BELVO_API_URL}/api/transactions/?link=${linkData.belvo_link_id}&account=${accountData.belvo_account_id}`;

    if (dateFrom) transactionsUrl += `&date_from=${dateFrom}`;
    if (dateTo) transactionsUrl += `&date_to=${dateTo}`;

    // Adicionar limite padrão
    transactionsUrl += '&page_size=100';

    console.log(
      `[belvo-sync-transactions] Fetching from URL: ${transactionsUrl}`
    );

    // Buscar transações
    const transactionsResponse = await fetch(transactionsUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!transactionsResponse.ok) {
      const errorText = await transactionsResponse.text();
      console.error(
        '[belvo-sync-transactions] Failed to fetch transactions:',
        errorText
      );
      return new Response(
        JSON.stringify({ error: 'Failed to fetch transactions from Belvo' }),
        { status: 500, headers }
      );
    }

    const transactionsData = await transactionsResponse.json();
    const transactions = transactionsData.results || transactionsData;

    console.log(
      `[belvo-sync-transactions] Found ${transactions.length} transactions`
    );

    // Verificar expenses manuais existentes para evitar duplicidade
    const { data: existingExpenses } = await supabase
      .from('expenses')
      .select('id, establishment_name, amount, date, category, subcategory')
      .eq('user_id', user.id)
      .or('source.is.null,source.eq.manual');

    // Criar mapa para verificação rápida
    const existingExpensesMap = new Map<
      string,
      {
        establishment_name: string;
        amount: number;
        date: string;
        category: string;
        subcategory: string | null;
      }
    >();

    (existingExpenses || []).forEach((e) => {
      const roundedAmount = Math.round(Math.abs(e.amount));
      const key = `${roundedAmount}-${e.date}`;
      existingExpensesMap.set(key, {
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

      const exactKey = `${roundedAmount}-${dateStr}`;
      if (existingExpensesMap.has(exactKey)) {
        return existingExpensesMap.get(exactKey)!;
      }

      // Tolerância de +/- R$1
      for (const tolerance of [-1, 1]) {
        const toleranceKey = `${roundedAmount + tolerance}-${dateStr}`;
        if (existingExpensesMap.has(toleranceKey)) {
          return existingExpensesMap.get(toleranceKey)!;
        }
      }

      return null;
    };

    // PASSO 1: Filtrar e inserir transações
    let savedCount = 0;
    let skippedCount = 0;
    let categorizedCount = 0;

    const insertedTransactions: Array<{
      dbId: string;
      belvoId: string;
      description: string;
      amount: number;
      type: string;
      belvoCategory: string | null;
      isDuplicate: boolean;
    }> = [];

    for (const transaction of transactions) {
      // Verificar se já existe
      const { data: existing } = await supabase
        .from('belvo_transactions')
        .select('id')
        .eq('belvo_transaction_id', transaction.id)
        .single();

      if (existing) {
        skippedCount++;
        continue;
      }

      // Verificar duplicidade com expenses manuais
      const duplicateExpense = findDuplicateExpense(
        transaction.amount,
        transaction.value_date
      );
      const isDuplicate = duplicateExpense !== null;

      // Mapear tipo da Belvo (INFLOW/OUTFLOW)
      const transactionType = transaction.type || 'OUTFLOW';

      // Inserir transação
      const { data: insertedTransaction, error: transactionError } =
        await supabase
          .from('belvo_transactions')
          .insert({
            belvo_transaction_id: transaction.id,
            user_id: user.id,
            account_id: accountId,
            description: transaction.description || 'Sem descrição',
            amount: transaction.amount,
            type: transactionType,
            status: transaction.status,
            category: transaction.category,
            subcategory: transaction.subcategory,
            reference: transaction.reference,
            balance: transaction.balance,
            value_date: transaction.value_date,
            accounting_date: transaction.accounting_date,
            currency: transaction.currency || 'BRL',
            synced: isDuplicate,
          })
          .select('id')
          .single();

      if (transactionError) {
        console.error(
          `[belvo-sync-transactions] Failed to save transaction ${transaction.id}:`,
          transactionError
        );
        continue;
      }

      savedCount++;

      // Guardar para categorização em batch
      if (insertedTransaction?.id && !isDuplicate) {
        insertedTransactions.push({
          dbId: insertedTransaction.id,
          belvoId: transaction.id,
          description: transaction.description || 'Sem descrição',
          amount: transaction.amount,
          type: transactionType,
          belvoCategory: transaction.category || null,
          isDuplicate,
        });
      }
    }

    // PASSO 2: Categorizar transações em batch (apenas saídas)
    const outflowTransactions = insertedTransactions.filter(
      (tx) => tx.type === 'OUTFLOW' && !tx.isDuplicate
    );

    if (outflowTransactions.length > 0) {
      console.log(
        `[belvo-sync-transactions] Categorizing ${outflowTransactions.length} transactions in batch`
      );

      const batchInput: BatchTransaction[] = outflowTransactions.map((tx) => ({
        id: tx.dbId,
        description: tx.description,
        amount: tx.amount,
        pluggyCategory: tx.belvoCategory, // Reutiliza o campo, funciona igual
      }));

      try {
        const categorizations = await categorizeInBatch(batchInput, {
          supabase,
          userId: user.id,
        });

        for (const cat of categorizations) {
          const { error: catError } = await supabase
            .from('transaction_categories')
            .insert({
              user_id: user.id,
              transaction_id: cat.id,
              category: cat.category,
              subcategory: cat.subcategory,
              is_fixed_cost: cat.is_fixed_cost,
              categorized_by: 'walts_auto',
            });

          if (catError) {
            console.error(
              `[belvo-sync-transactions] Failed to save categorization:`,
              catError
            );
          } else {
            categorizedCount++;
          }
        }

        console.log(
          `[belvo-sync-transactions] Batch categorization completed: ${categorizedCount} categorized`
        );
      } catch (batchError) {
        console.error(
          `[belvo-sync-transactions] Batch categorization error:`,
          batchError
        );
      }
    }

    console.log(
      `[belvo-sync-transactions] Sync completed: ${savedCount} saved, ${skippedCount} skipped, ${categorizedCount} categorized`
    );

    // Trigger detect-patterns if we saved new transactions
    if (savedCount > 0) {
      try {
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (serviceKey) {
          console.log(
            `[belvo-sync-transactions] Triggering detect-patterns for user ${user.id}`
          );
          fetch(`${SUPABASE_URL}/functions/v1/detect-patterns`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ userId: user.id }),
          }).catch((err) => {
            console.error(
              '[belvo-sync-transactions] Failed to trigger detect-patterns:',
              err
            );
          });
        }
      } catch (detectErr) {
        console.error(
          '[belvo-sync-transactions] Error triggering detect-patterns:',
          detectErr
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: transactions.length,
        saved: savedCount,
        skipped: skippedCount,
        categorized: categorizedCount,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[belvo-sync-transactions] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
