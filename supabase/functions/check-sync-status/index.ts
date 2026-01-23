import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Verificar status do cron job
    const { data: cronStatus, error: cronError } =
      await supabase.rpc('check_cron_status');

    // 2. Buscar contas e última sincronização
    const { data: accounts, error: accountsError } = await supabase
      .from('pluggy_accounts')
      .select('id, pluggy_account_id, name, last_sync_at')
      .order('last_sync_at', { ascending: true, nullsFirst: true });

    // 3. Verificar histórico de requisições pg_net
    const { data: pgnetRequests, error: pgnetError } = await supabase.rpc(
      'check_pgnet_requests'
    );

    // 4. Parâmetros de ação
    const url = new URL(req.url);
    const triggerSync = url.searchParams.get('trigger') === 'true';
    const testPgnet = url.searchParams.get('test_pgnet') === 'true';

    let syncResult = null;
    let pgnetTestResult = null;

    if (triggerSync) {
      const { data, error } = await supabase.rpc('manual_trigger_sync');
      syncResult = error ? `Error: ${error.message}` : data;
    }

    if (testPgnet) {
      const { data, error } = await supabase.rpc('test_pgnet_request');
      pgnetTestResult = error ? `Error: ${error.message}` : data;
    }

    return new Response(
      JSON.stringify({
        success: true,
        cronJobs: cronStatus || [],
        cronError: cronError?.message || null,
        accounts:
          accounts?.map((a) => ({
            id: a.id,
            accountId: a.pluggy_account_id,
            name: a.name,
            lastSync: a.last_sync_at,
          })) || [],
        accountsError: accountsError?.message || null,
        pgnetRequests: pgnetRequests || [],
        pgnetError: pgnetError?.message || null,
        syncTriggered: triggerSync,
        syncResult,
        pgnetTestResult,
        timestamp: new Date().toISOString(),
      }),
      { headers }
    );
  } catch (error) {
    console.error('[check-sync-status] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers }
    );
  }
});
