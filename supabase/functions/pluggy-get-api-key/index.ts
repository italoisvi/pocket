import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');

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
    console.log('[pluggy-get-api-key] Generating API key');

    // Gerar API Key da Pluggy
    const response = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      console.error('[pluggy-get-api-key] Failed to generate API key');
      return new Response(
        JSON.stringify({ error: 'Failed to generate API key' }),
        { status: 500, headers }
      );
    }

    const { apiKey } = await response.json();
    console.log('[pluggy-get-api-key] API key generated successfully');

    return new Response(JSON.stringify({ apiKey }), { headers });
  } catch (error) {
    console.error('[pluggy-get-api-key] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
