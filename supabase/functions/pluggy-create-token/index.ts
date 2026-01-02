import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

serve(async (req) => {
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
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

    console.log(`[pluggy-create-token] Generating token for user: ${user.id}`);

    // Verificar credenciais da Pluggy
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      console.error('[pluggy-create-token] Missing Pluggy credentials');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers }
      );
    }

    // 1. Gerar API Key da Pluggy
    const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });

    if (!apiKeyResponse.ok) {
      const errorData = await apiKeyResponse.text();
      console.error(
        '[pluggy-create-token] Failed to generate API key:',
        errorData
      );
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Pluggy' }),
        { status: 500, headers }
      );
    }

    const { apiKey } = await apiKeyResponse.json();
    console.log('[pluggy-create-token] API Key generated successfully');

    // 2. Gerar Connect Token
    const connectTokenResponse = await fetch(
      'https://api.pluggy.ai/connect_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
          clientUserId: user.id,
          webhookUrl:
            'https://yiwkuqihujjrxejeybeg.supabase.co/functions/v1/pluggy-webhook',
          oauthRedirectUri: 'pocket://oauth-callback', // Connect Token usa "Uri"
          avoidDuplicates: true,
        }),
      }
    );

    if (!connectTokenResponse.ok) {
      const errorData = await connectTokenResponse.text();
      console.error(
        '[pluggy-create-token] Failed to generate connect token:',
        errorData
      );
      return new Response(
        JSON.stringify({ error: 'Failed to generate connect token' }),
        { status: 500, headers }
      );
    }

    const { accessToken } = await connectTokenResponse.json();
    console.log('[pluggy-create-token] Connect Token generated successfully');

    return new Response(JSON.stringify({ connectToken: accessToken }), {
      headers,
    });
  } catch (error) {
    console.error('[pluggy-create-token] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});