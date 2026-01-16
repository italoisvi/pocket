import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { categorizeWithWalts } from '../_shared/categorize-with-walts.ts';

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

    // Ler parâmetros
    const body = await req.json().catch(() => ({}));

    // CASO 1: Categorizar um único estabelecimento (chamado pelo app ao adicionar comprovante)
    if (body.action === 'categorize_single' && body.establishmentName) {
      console.log(
        `[recategorize-expenses] Categorizing single: "${body.establishmentName}"`
      );

      const categorization = await categorizeWithWalts(body.establishmentName, {
        amount: body.options?.amount,
        items: body.options?.items,
        pluggyCategory: body.options?.pluggyCategory,
        receiverName: body.options?.receiverName,
        payerName: body.options?.payerName,
      });

      console.log(
        `[recategorize-expenses] Result: ${categorization.category}/${categorization.subcategory}`
      );

      return new Response(JSON.stringify(categorization), { headers });
    }

    // CASO 2: Recategorizar expenses em batch
    const forceAll = body.forceAll === true;

    console.log(
      `[recategorize-expenses] Starting batch recategorization for user ${user.id}, forceAll=${forceAll}`
    );

    // Buscar expenses que precisam ser recategorizadas
    // Se forceAll, recategoriza todas. Senão, apenas as que estão como "outros"
    let query = supabase
      .from('expenses')
      .select('id, establishment_name, amount, category, subcategory')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (!forceAll) {
      query = query.eq('category', 'outros');
    }

    const { data: expenses, error: fetchError } = await query;

    if (fetchError) {
      console.error(
        '[recategorize-expenses] Error fetching expenses:',
        fetchError
      );
      return new Response(
        JSON.stringify({ error: 'Failed to fetch expenses' }),
        { status: 500, headers }
      );
    }

    if (!expenses || expenses.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No expenses to recategorize',
          recategorized: 0,
        }),
        { headers }
      );
    }

    console.log(
      `[recategorize-expenses] Found ${expenses.length} expenses to recategorize`
    );

    // Recategorizar cada expense
    let recategorized = 0;
    let failed = 0;
    const results: Array<{
      id: string;
      name: string;
      oldCategory: string;
      newCategory: string;
      newSubcategory: string;
    }> = [];

    // Processar em lotes de 5 para não sobrecarregar a API
    const batchSize = 5;
    for (let i = 0; i < expenses.length; i += batchSize) {
      const batch = expenses.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (expense) => {
          try {
            // Categorizar com Walts (IA)
            const categorization = await categorizeWithWalts(
              expense.establishment_name,
              { amount: expense.amount }
            );

            // Verificar se a categoria mudou
            if (
              categorization.category !== expense.category ||
              categorization.subcategory !== expense.subcategory
            ) {
              // Atualizar expense
              const { error: updateError } = await supabase
                .from('expenses')
                .update({
                  category: categorization.category,
                  subcategory: categorization.subcategory,
                })
                .eq('id', expense.id);

              if (updateError) {
                console.error(
                  `[recategorize-expenses] Error updating expense ${expense.id}:`,
                  updateError
                );
                failed++;
                return;
              }

              recategorized++;
              results.push({
                id: expense.id,
                name: expense.establishment_name,
                oldCategory: expense.category,
                newCategory: categorization.category,
                newSubcategory: categorization.subcategory,
              });

              console.log(
                `[recategorize-expenses] Recategorized "${expense.establishment_name}": ${expense.category} -> ${categorization.category}/${categorization.subcategory}`
              );
            }
          } catch (error) {
            console.error(
              `[recategorize-expenses] Error processing expense ${expense.id}:`,
              error
            );
            failed++;
          }
        })
      );

      // Pequeno delay entre lotes para não sobrecarregar
      if (i + batchSize < expenses.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `[recategorize-expenses] Completed. Recategorized: ${recategorized}, Failed: ${failed}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: expenses.length,
        recategorized,
        failed,
        unchanged: expenses.length - recategorized - failed,
        results,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[recategorize-expenses] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
