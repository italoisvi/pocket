import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

console.log('[pluggy-update-item] Env check:', {
  hasClientId: !!PLUGGY_CLIENT_ID,
  hasClientSecret: !!PLUGGY_CLIENT_SECRET,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasAnonKey: !!SUPABASE_ANON_KEY,
});

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
      `[pluggy-update-item] Triggering update for item ${itemId} for user ${user.id}`
    );

    // Validar env vars antes de usar
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      console.error(
        '[pluggy-update-item] Missing Pluggy credentials in environment'
      );
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers }
      );
    }

    // Gerar API Key
    console.log('[pluggy-update-item] Authenticating with Pluggy API...');
    const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });

    if (!apiKeyResponse.ok) {
      const errorText = await apiKeyResponse.text();
      console.error(
        `[pluggy-update-item] Failed to generate API key. Status: ${apiKeyResponse.status}, Response:`,
        errorText
      );
      return new Response(
        JSON.stringify({
          error: 'Failed to authenticate with Pluggy',
          details: errorText,
          statusCode: apiKeyResponse.status,
        }),
        { status: 500, headers }
      );
    }

    const authResult = await apiKeyResponse.json();
    const { apiKey } = authResult;
    console.log('[pluggy-update-item] Pluggy authentication successful');

    // Disparar UPDATE do item na API da Pluggy
    // Isso faz a Pluggy sincronizar novamente com o banco
    const updateResponse = await fetch(
      `https://api.pluggy.ai/items/${itemId}/update`,
      {
        method: 'PATCH',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(
        `[pluggy-update-item] Failed to update item. Status: ${updateResponse.status}, Response:`,
        errorText
      );

      // Se o erro for 429 (rate limit), retornar mensagem específica
      if (updateResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              'Muitas atualizações recentes. Aguarde alguns minutos e tente novamente.',
          }),
          { status: 429, headers }
        );
      }

      // Retornar erro mais detalhado
      return new Response(
        JSON.stringify({
          error: 'Failed to trigger item update at Pluggy',
          details: errorText,
          statusCode: updateResponse.status,
        }),
        { status: 500, headers }
      );
    }

    const updatedItem = await updateResponse.json();
    console.log(
      `[pluggy-update-item] Item update triggered successfully. Status: ${updatedItem.status}, ExecutionStatus: ${updatedItem.executionStatus}`
    );

    // Atualizar status no banco de dados
    const { error: updateError } = await supabase
      .from('pluggy_items')
      .update({
        status: updatedItem.status,
        last_updated_at: updatedItem.lastUpdatedAt || new Date().toISOString(),
        error_message: updatedItem.error?.message || null,
      })
      .eq('pluggy_item_id', itemId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error(
        '[pluggy-update-item] Failed to update item in database:',
        updateError
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        item: {
          id: updatedItem.id,
          status: updatedItem.status,
          executionStatus: updatedItem.executionStatus || null,
          message:
            'Atualização iniciada. Os dados serão sincronizados automaticamente.',
        },
      }),
      { headers }
    );
  } catch (error) {
    console.error('[pluggy-update-item] Error:', error);
    console.error('[pluggy-update-item] Error stack:', error.stack);
    console.error('[pluggy-update-item] Error name:', error.name);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        errorName: error.name,
        errorStack: error.stack,
      }),
      { status: 500, headers }
    );
  }
});
