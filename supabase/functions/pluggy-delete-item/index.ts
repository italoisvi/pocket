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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers }
      );
    }

    // Ler body
    const { itemId } = await req.json();

    if (!itemId) {
      return new Response(
        JSON.stringify({ error: 'Missing itemId parameter' }),
        { status: 400, headers }
      );
    }

    console.log(`[pluggy-delete-item] Deleting item ${itemId} for user ${user.id}`);

    // Buscar o pluggy_item_id
    const { data: itemData, error: itemError } = await supabase
      .from('pluggy_items')
      .select('pluggy_item_id')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (itemError || !itemData) {
      console.error('[pluggy-delete-item] Item not found:', itemError);
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
      console.error('[pluggy-delete-item] Failed to generate API key');
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Pluggy' }),
        { status: 500, headers }
      );
    }

    const { apiKey } = await apiKeyResponse.json();

    // Deletar Item na Pluggy API
    const deleteResponse = await fetch(
      `https://api.pluggy.ai/items/${itemData.pluggy_item_id}`,
      {
        method: 'DELETE',
        headers: { 'X-API-KEY': apiKey },
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorText = await deleteResponse.text();
      console.error('[pluggy-delete-item] Failed to delete from Pluggy:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to delete item from Pluggy' }),
        { status: 500, headers }
      );
    }

    console.log('[pluggy-delete-item] Item deleted from Pluggy');

    // Deletar do banco de dados (CASCADE vai deletar accounts e transactions)
    const { error: deleteError } = await supabase
      .from('pluggy_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[pluggy-delete-item] Failed to delete from database:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete item from database' }),
        { status: 500, headers }
      );
    }

    console.log('[pluggy-delete-item] Item deleted from database');

    return new Response(
      JSON.stringify({ success: true }),
      { headers }
    );
  } catch (error) {
    console.error('[pluggy-delete-item] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
