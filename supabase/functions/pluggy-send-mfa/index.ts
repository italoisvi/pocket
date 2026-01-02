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
    const { itemId, mfaParameter } = await req.json();

    if (!itemId || !mfaParameter) {
      return new Response(
        JSON.stringify({ error: 'Missing itemId or mfaParameter' }),
        { status: 400, headers }
      );
    }

    console.log(`[pluggy-send-mfa] Sending MFA for item ${itemId}`);
    console.log(`[pluggy-send-mfa] MFA parameter:`, mfaParameter);

    // Verificar se o item pertence ao usuário
    const { data: itemData, error: itemError } = await supabase
      .from('pluggy_items')
      .select('pluggy_item_id')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (itemError || !itemData) {
      console.error('[pluggy-send-mfa] Item not found:', itemError);
      return new Response(
        JSON.stringify({ error: 'Item not found or not owned by user' }),
        { status: 404, headers }
      );
    }

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
      console.error('[pluggy-send-mfa] Failed to generate API key');
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Pluggy' }),
        { status: 500, headers }
      );
    }

    const { apiKey } = await apiKeyResponse.json();

    // Enviar MFA para a Pluggy API
    const mfaResponse = await fetch(
      `https://api.pluggy.ai/items/${itemData.pluggy_item_id}/mfa`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify(mfaParameter),
      }
    );

    if (!mfaResponse.ok) {
      const errorText = await mfaResponse.text();
      console.error('[pluggy-send-mfa] Failed to send MFA:', errorText);

      let errorMessage = 'Failed to send MFA code';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        // errorText não é JSON válido
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: mfaResponse.status,
        headers,
      });
    }

    const result = await mfaResponse.json();
    console.log('[pluggy-send-mfa] MFA sent successfully');
    console.log('[pluggy-send-mfa] Result:', result);

    return new Response(
      JSON.stringify({
        success: true,
        item: {
          id: result.id,
          status: result.status,
          executionStatus: result.executionStatus || null,
        },
      }),
      { headers }
    );
  } catch (error) {
    console.error('[pluggy-send-mfa] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
