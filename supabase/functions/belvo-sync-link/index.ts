import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { linkId } = await req.json();

    if (!linkId) {
      return new Response(
        JSON.stringify({ error: 'Missing linkId parameter' }),
        { status: 400, headers }
      );
    }

    console.log(`[belvo-sync-link] Syncing link ${linkId} for user ${user.id}`);

    // Criar credenciais Basic Auth
    const credentials = btoa(`${BELVO_SECRET_ID}:${BELVO_SECRET_PASSWORD}`);

    // Buscar informações do Link na Belvo
    const linkResponse = await fetch(`${BELVO_API_URL}/api/links/${linkId}/`, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!linkResponse.ok) {
      const errorText = await linkResponse.text();
      console.error('[belvo-sync-link] Failed to fetch link:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch link from Belvo' }),
        { status: 500, headers }
      );
    }

    const link = await linkResponse.json();
    console.log(`[belvo-sync-link] Link fetched: ${link.institution}`);
    console.log(`[belvo-sync-link] Link status: ${link.status}`);

    // Salvar/atualizar link no banco
    const { error: linkError } = await supabase.from('belvo_links').upsert(
      {
        belvo_link_id: link.id,
        user_id: user.id,
        institution_name: link.institution,
        institution_type: link.institution_type || 'BANK',
        access_mode: link.access_mode,
        status: link.status,
        last_accessed_at: link.last_accessed_at,
        refresh_rate: link.refresh_rate,
        external_id: link.external_id,
      },
      { onConflict: 'belvo_link_id' }
    );

    if (linkError) {
      console.error('[belvo-sync-link] Failed to save link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to save link to database' }),
        { status: 500, headers }
      );
    }

    console.log('[belvo-sync-link] Link saved successfully');

    // Buscar o UUID do link no banco para usar como foreign key
    const { data: linkData } = await supabase
      .from('belvo_links')
      .select('id')
      .eq('belvo_link_id', linkId)
      .single();

    if (!linkData) {
      return new Response(
        JSON.stringify({ error: 'Link not found in database' }),
        { status: 500, headers }
      );
    }

    // Buscar contas do Link
    const accountsResponse = await fetch(
      `${BELVO_API_URL}/api/accounts/?link=${linkId}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    if (!accountsResponse.ok) {
      console.error('[belvo-sync-link] Failed to fetch accounts');
      return new Response(
        JSON.stringify({ error: 'Failed to fetch accounts from Belvo' }),
        { status: 500, headers }
      );
    }

    const accountsData = await accountsResponse.json();
    const accounts = accountsData.results || accountsData;
    console.log(`[belvo-sync-link] Found ${accounts.length} accounts`);

    // Salvar contas
    for (const account of accounts) {
      // Mapear categoria da Belvo para nosso formato
      let category = 'CHECKING_ACCOUNT';
      if (account.category) {
        category = account.category.toUpperCase().replace(/ /g, '_');
      }

      const { error: accountError } = await supabase
        .from('belvo_accounts')
        .upsert(
          {
            belvo_account_id: account.id,
            user_id: user.id,
            link_id: linkData.id,
            category: category,
            type: account.type,
            name: account.name,
            agency: account.agency,
            number: account.number,
            balance_current: account.balance?.current,
            balance_available: account.balance?.available,
            currency: account.currency || 'BRL',
            credit_limit: account.credit_data?.credit_limit,
            credit_available: account.credit_data?.available_credit,
            credit_used: account.credit_data?.used_credit,
            last_sync_at: new Date().toISOString(),
            institution_name: link.institution,
          },
          { onConflict: 'belvo_account_id' }
        );

      if (accountError) {
        console.error(
          `[belvo-sync-link] Failed to save account ${account.id}:`,
          accountError
        );
      }
    }

    console.log('[belvo-sync-link] Sync completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        link: {
          id: link.id,
          databaseId: linkData.id,
          institutionName: link.institution,
          status: link.status,
        },
        accountsCount: accounts.length,
      }),
      { headers }
    );
  } catch (error) {
    console.error('[belvo-sync-link] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
