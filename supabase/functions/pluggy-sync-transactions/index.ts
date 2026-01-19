import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  categorizeInBatch,
  type BatchTransaction,
} from '../_shared/categorize-with-walts.ts';

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

    console.log(
      `[pluggy-sync-transactions] Fetching from URL: ${transactionsUrl}`
    );

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
      console.error(
        '[pluggy-sync-transactions] Status code:',
        transactionsResponse.status
      );
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
    console.log(
      `[pluggy-sync-transactions] Response data:`,
      JSON.stringify(transactionsData, null, 2)
    );

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

    // Salvar transações e categorizar automaticamente
    let savedCount = 0;
    let skippedCount = 0;
    let categorizedCount = 0;

    // Verificar se usuario ja tem expenses manuais para evitar duplicidade
    // Buscar tambem category e subcategory para aprendizado por associacao
    const { data: existingExpenses } = await supabase
      .from('expenses')
      .select('id, establishment_name, amount, date, category, subcategory')
      .eq('user_id', user.id)
      .or('source.is.null,source.eq.manual');

    // Criar mapa de expenses existentes para verificacao rapida
    // Chave: valor-data (tolerancia de R$1 e 1 dia)
    // Valor: dados completos do expense para aprendizado
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
      // Criar chaves com tolerancia de valor (arredondado para inteiro)
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

    // Funcao para encontrar expense duplicado (com tolerancia)
    const findDuplicateExpense = (
      transactionAmount: number,
      transactionDate: string
    ) => {
      const roundedAmount = Math.round(Math.abs(transactionAmount));
      const dateStr = transactionDate.split('T')[0];

      // Tentar match exato primeiro
      const exactKey = `${roundedAmount}-${dateStr}`;
      if (existingExpensesMap.has(exactKey)) {
        return existingExpensesMap.get(exactKey)!;
      }

      // Tentar com tolerancia de +/- R$1
      for (const tolerance of [-1, 1]) {
        const toleranceKey = `${roundedAmount + tolerance}-${dateStr}`;
        if (existingExpensesMap.has(toleranceKey)) {
          return existingExpensesMap.get(toleranceKey)!;
        }
      }

      // Tentar com tolerancia de +/- 1 dia
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

    // PASSO 1: Filtrar transações novas e inserir no banco
    const insertedTransactions: Array<{
      dbId: string;
      pluggyId: string;
      description: string;
      amount: number;
      type: string;
      pluggyCategory: string | null;
      isDuplicate: boolean;
    }> = [];

    for (const transaction of transactions) {
      // Verificar se já existe na tabela pluggy_transactions
      const { data: existing } = await supabase
        .from('pluggy_transactions')
        .select('id')
        .eq('pluggy_transaction_id', transaction.id)
        .single();

      if (existing) {
        skippedCount++;
        continue;
      }

      // Verificar duplicidade com expenses manuais (por valor + data)
      const duplicateExpense = findDuplicateExpense(
        transaction.amount,
        transaction.date
      );
      const isDuplicate = duplicateExpense !== null;

      // Inserir transacao
      const { data: insertedTransaction, error: transactionError } =
        await supabase
          .from('pluggy_transactions')
          .insert({
            pluggy_transaction_id: transaction.id,
            user_id: user.id,
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
          })
          .select('id')
          .single();

      if (transactionError) {
        console.error(
          `[pluggy-sync-transactions] Failed to save transaction ${transaction.id}:`,
          transactionError
        );
        continue;
      }

      savedCount++;

      // Se for duplicata, aprender associacao
      if (isDuplicate && duplicateExpense) {
        const transactionName = transaction.description?.toLowerCase().trim();
        const establishmentName = duplicateExpense.establishment_name
          ?.toLowerCase()
          .trim();

        if (
          transactionName &&
          establishmentName &&
          transactionName !== establishmentName
        ) {
          const aliasKey = `merchant_alias_${transactionName.replace(/[^a-z0-9]/g, '_')}`;

          try {
            const { data: existingAlias } = await supabase
              .from('walts_memory')
              .select('id, value, use_count')
              .eq('user_id', user.id)
              .eq('memory_type', 'merchant_alias')
              .eq('key', aliasKey)
              .single();

            if (existingAlias) {
              const newUseCount = (existingAlias.use_count || 0) + 1;
              const newConfidence = Math.min(0.95, 0.8 + newUseCount * 0.03);

              await supabase
                .from('walts_memory')
                .update({
                  use_count: newUseCount,
                  confidence: newConfidence,
                  updated_at: new Date().toISOString(),
                  last_used_at: new Date().toISOString(),
                })
                .eq('id', existingAlias.id);
            } else {
              await supabase.from('walts_memory').insert({
                user_id: user.id,
                memory_type: 'merchant_alias',
                key: aliasKey,
                value: {
                  pix_name: transaction.description,
                  establishment_name: duplicateExpense.establishment_name,
                  category: duplicateExpense.category,
                  subcategory: duplicateExpense.subcategory,
                  last_amount: Math.abs(transaction.amount),
                  match_count: 1,
                },
                confidence: 0.85,
                source: 'duplicate_detection',
              });
            }
          } catch (aliasError) {
            console.error(
              `[pluggy-sync-transactions] Error saving alias:`,
              aliasError
            );
          }
        }
        continue; // Nao adicionar duplicatas para categorizacao
      }

      // Guardar para categorização em batch
      if (insertedTransaction?.id) {
        insertedTransactions.push({
          dbId: insertedTransaction.id,
          pluggyId: transaction.id,
          description: transaction.description,
          amount: transaction.amount,
          type: transaction.type,
          pluggyCategory: transaction.category || null,
          isDuplicate,
        });
      }
    }

    // PASSO 2: Categorizar transações em batch (apenas débitos)
    const debitTransactions = insertedTransactions.filter(
      (tx) => tx.type === 'DEBIT' && !tx.isDuplicate
    );

    if (debitTransactions.length > 0) {
      console.log(
        `[pluggy-sync-transactions] Categorizing ${debitTransactions.length} transactions in batch`
      );

      // Preparar batch para categorização
      const batchInput: BatchTransaction[] = debitTransactions.map((tx) => ({
        id: tx.dbId,
        description: tx.description,
        amount: tx.amount,
        pluggyCategory: tx.pluggyCategory,
      }));

      try {
        // Categorizar todas de uma vez
        const categorizations = await categorizeInBatch(batchInput, {
          supabase,
          userId: user.id,
        });

        // Inserir categorizações
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
              `[pluggy-sync-transactions] Failed to save categorization:`,
              catError
            );
          } else {
            categorizedCount++;
          }
        }

        console.log(
          `[pluggy-sync-transactions] Batch categorization completed: ${categorizedCount} categorized`
        );
      } catch (batchError) {
        console.error(
          `[pluggy-sync-transactions] Batch categorization error:`,
          batchError
        );
      }
    }

    console.log(
      `[pluggy-sync-transactions] Sync completed: ${savedCount} saved, ${skippedCount} skipped, ${categorizedCount} categorized`
    );

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
    console.error('[pluggy-sync-transactions] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
