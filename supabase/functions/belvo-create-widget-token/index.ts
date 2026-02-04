import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BELVO_SECRET_ID = Deno.env.get('BELVO_SECRET_ID');
const BELVO_SECRET_PASSWORD = Deno.env.get('BELVO_SECRET_PASSWORD');
const BELVO_ENV = Deno.env.get('BELVO_ENV') || 'sandbox'; // sandbox ou production
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
    // Verificar autenticação do usuário
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

    // Verificar credenciais Belvo
    if (!BELVO_SECRET_ID || !BELVO_SECRET_PASSWORD) {
      console.error('[belvo-create-widget-token] Missing Belvo credentials');
      return new Response(
        JSON.stringify({ error: 'Belvo credentials not configured' }),
        { status: 500, headers }
      );
    }

    // Ler parâmetros opcionais do body
    let institutionType = 'openfinance';
    let externalId: string | undefined;

    try {
      const body = await req.json();
      if (body.institutionType) institutionType = body.institutionType;
      if (body.externalId) externalId = body.externalId;
    } catch {
      // Body vazio é ok, usa defaults
    }

    console.log(
      `[belvo-create-widget-token] Generating widget token for user ${user.id}`
    );

    // Criar credenciais Basic Auth
    const credentials = btoa(`${BELVO_SECRET_ID}:${BELVO_SECRET_PASSWORD}`);

    // Gerar widget access token
    // Documentação: https://developers.belvo.com/reference/generatewidgetaccesstoken
    const tokenPayload: Record<string, unknown> = {
      id: user.id, // ID do usuário no nosso sistema
      scopes: 'read_institutions,write_links,read_links,delete_links',
      // Configurações do widget para Open Finance Brasil
      widget: {
        locale: 'pt',
        branding: {
          company_name: 'Pocket',
        },
        // Callback URL para deep link do app
        callback_urls: {
          success: 'pocket://belvo-callback/success',
          exit: 'pocket://belvo-callback/exit',
        },
        // Configurações específicas para Open Finance
        openfinance_feature: 'consent_link_creation',
        integration_type: institutionType,
        country_codes: ['BR'],
      },
    };

    // Adicionar external_id se fornecido
    if (externalId) {
      tokenPayload.external_id = externalId;
    }

    const tokenResponse = await fetch(`${BELVO_API_URL}/api/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(tokenPayload),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(
        '[belvo-create-widget-token] Failed to generate token:',
        errorText
      );
      console.error(
        '[belvo-create-widget-token] Status:',
        tokenResponse.status
      );
      return new Response(
        JSON.stringify({
          error: 'Failed to generate Belvo widget token',
          details: errorText,
        }),
        { status: 500, headers }
      );
    }

    const tokenData = await tokenResponse.json();

    console.log('[belvo-create-widget-token] Token generated successfully');

    return new Response(
      JSON.stringify({
        access: tokenData.access,
        refresh: tokenData.refresh,
        // O token expira em 10 minutos
        expires_in: 600,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[belvo-create-widget-token] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
