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

    // Ler body - aceita tanto linkId (UUID do banco) quanto belvoLinkId
    const { linkId, belvoLinkId } = await req.json();

    if (!linkId && !belvoLinkId) {
      return new Response(
        JSON.stringify({ error: 'Missing linkId or belvoLinkId parameter' }),
        { status: 400, headers }
      );
    }

    console.log(
      `[belvo-delete-link] Deleting link for user ${user.id}. linkId: ${linkId}, belvoLinkId: ${belvoLinkId}`
    );

    // Buscar o link no banco de dados
    let linkData;

    if (linkId) {
      // Buscar por UUID do banco
      const { data, error } = await supabase
        .from('belvo_links')
        .select('id, belvo_link_id')
        .eq('id', linkId)
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        console.error('[belvo-delete-link] Link not found in database:', error);
        return new Response(
          JSON.stringify({ error: 'Link not found in database' }),
          { status: 404, headers }
        );
      }
      linkData = data;
    } else {
      // Buscar por belvo_link_id
      const { data, error } = await supabase
        .from('belvo_links')
        .select('id, belvo_link_id')
        .eq('belvo_link_id', belvoLinkId)
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        console.error('[belvo-delete-link] Link not found in database:', error);
        return new Response(
          JSON.stringify({ error: 'Link not found in database' }),
          { status: 404, headers }
        );
      }
      linkData = data;
    }

    // Criar credenciais Basic Auth
    const credentials = btoa(`${BELVO_SECRET_ID}:${BELVO_SECRET_PASSWORD}`);

    // Deletar na API da Belvo
    console.log(
      `[belvo-delete-link] Deleting link ${linkData.belvo_link_id} from Belvo API`
    );

    const deleteResponse = await fetch(
      `${BELVO_API_URL}/api/links/${linkData.belvo_link_id}/`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    // 204 No Content é sucesso para DELETE
    if (!deleteResponse.ok && deleteResponse.status !== 204) {
      const errorText = await deleteResponse.text();
      console.error(
        '[belvo-delete-link] Failed to delete from Belvo:',
        errorText
      );
      // Continuar mesmo se falhar na Belvo (pode já ter sido deletado)
      console.log('[belvo-delete-link] Continuing with local deletion...');
    } else {
      console.log('[belvo-delete-link] Successfully deleted from Belvo API');
    }

    // Deletar transações associadas
    const { error: txError } = await supabase
      .from('belvo_transactions')
      .delete()
      .eq('user_id', user.id)
      .in(
        'account_id',
        supabase.from('belvo_accounts').select('id').eq('link_id', linkData.id)
      );

    if (txError) {
      console.error(
        '[belvo-delete-link] Error deleting transactions:',
        txError
      );
    }

    // Deletar contas associadas
    const { error: accError } = await supabase
      .from('belvo_accounts')
      .delete()
      .eq('link_id', linkData.id);

    if (accError) {
      console.error('[belvo-delete-link] Error deleting accounts:', accError);
    }

    // Deletar consentimentos associados
    const { error: consentError } = await supabase
      .from('belvo_consents')
      .delete()
      .eq('link_id', linkData.id);

    if (consentError) {
      console.error(
        '[belvo-delete-link] Error deleting consents:',
        consentError
      );
    }

    // Deletar o link
    const { error: linkError } = await supabase
      .from('belvo_links')
      .delete()
      .eq('id', linkData.id);

    if (linkError) {
      console.error('[belvo-delete-link] Error deleting link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete link from database' }),
        { status: 500, headers }
      );
    }

    console.log('[belvo-delete-link] Successfully deleted link and all data');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Link and all associated data deleted successfully',
      }),
      { headers }
    );
  } catch (error) {
    console.error('[belvo-delete-link] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
