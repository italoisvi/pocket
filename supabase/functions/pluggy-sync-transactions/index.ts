import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { categorizeWithWalts } from '../_shared/categorize-with-walts.ts';

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
    const { data: existingExpenses } = await supabase
      .from('expenses')
      .select('establishment_name, amount, date')
      .eq('user_id', user.id)
      .or('source.is.null,source.eq.manual');

    // Criar mapa de expenses existentes para verificacao rapida
    const existingExpensesMap = new Set(
      (existingExpenses || []).map(
        (e) => `${e.establishment_name?.toLowerCase()}-${Math.abs(e.amount)}-${e.date}`
      )
    );

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

      // Verificar duplicidade com expenses manuais
      const transactionKey = `${transaction.description?.toLowerCase()}-${Math.abs(transaction.amount)}-${transaction.date.split('T')[0]}`;
      const isDuplicate = existingExpensesMap.has(transactionKey);

      // Inserir transacao
      const { data: insertedTransaction, error: transactionError } = await supabase
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
          synced: isDuplicate, // Marcar como synced se for duplicata
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

      // Se for duplicata, nao categorizar (usuario ja tem o expense manual)
      if (isDuplicate) {
        console.log(
          `[pluggy-sync-transactions] Transaction "${transaction.description}" is duplicate of manual expense, skipping categorization`
        );
        continue;
      }

      // Categorizar automaticamente apenas debitos (gastos)
      if (transaction.type === 'DEBIT' && insertedTransaction?.id) {
        try {
          // Verificar se ja existe categorizacao
          const { data: existingCat } = await supabase
            .from('transaction_categories')
            .select('id')
            .eq('transaction_id', insertedTransaction.id)
            .eq('user_id', user.id)
            .single();

          if (!existingCat) {
            // Categorizar com IA
            const categorization = await categorizeWithWalts(
              transaction.description,
              {
                amount: Math.abs(transaction.amount),
                pluggyCategory: transaction.category,
              }
            );

            // Inserir categorizacao
            const { error: catError } = await supabase
              .from('transaction_categories')
              .insert({
                user_id: user.id,
                transaction_id: insertedTransaction.id,
                category: categorization.category,
                subcategory: categorization.subcategory,
                is_fixed_cost: categorization.is_fixed_cost,
                categorized_by: 'walts_auto',
              });

            if (catError) {
              console.error(
                `[pluggy-sync-transactions] Failed to categorize transaction:`,
                catError
              );
            } else {
              categorizedCount++;
              console.log(
                `[pluggy-sync-transactions] Categorized "${transaction.description}" as ${categorization.category} (${categorization.is_fixed_cost ? 'fixed' : 'variable'})`
              );
            }
          }
        } catch (catError) {
          console.error(
            `[pluggy-sync-transactions] Error categorizing transaction:`,
            catError
          );
        }
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
