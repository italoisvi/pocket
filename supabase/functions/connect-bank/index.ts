import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_USERNAME = Deno.env.get('TELEGRAM_BOT_USERNAME') || 'pocketWalts';

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function generateConnectToken(
  userId: string,
  redirectUrl?: string
): Promise<string | null> {
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    console.error('[connect-bank] Missing Pluggy credentials');
    return null;
  }

  const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    }),
  });

  if (!apiKeyResponse.ok) {
    console.error('[connect-bank] Failed to get Pluggy API key');
    return null;
  }

  const { apiKey } = await apiKeyResponse.json();

  const webhookUrl = `${SUPABASE_URL}/functions/v1/pluggy-webhook`;

  const tokenPayload: Record<string, unknown> = {
    clientUserId: userId,
    webhookUrl,
    avoidDuplicates: true,
  };

  if (redirectUrl) {
    tokenPayload.redirectUrl = redirectUrl;
  }

  const connectTokenResponse = await fetch(
    'https://api.pluggy.ai/connect_token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(tokenPayload),
    }
  );

  if (!connectTokenResponse.ok) {
    console.error('[connect-bank] Failed to generate connect token');
    return null;
  }

  const { accessToken } = await connectTokenResponse.json();
  return accessToken;
}

serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');
  const source = url.searchParams.get('source');

  if (!userId) {
    return new Response('Link inválido', { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: user } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (!user) {
    return new Response('Usuário não encontrado', { status: 404 });
  }

  // Determine redirect URL based on source
  let redirectUrl: string | undefined;

  if (source === 'telegram') {
    // Redirect back to Telegram bot after connection
    redirectUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
  }
  // For app (no source param), Pluggy uses the default redirect configured in dashboard

  const connectToken = await generateConnectToken(userId, redirectUrl);

  if (!connectToken) {
    return new Response('Erro ao gerar conexão', { status: 500 });
  }

  const pluggyUrl = `https://connect.pluggy.ai/?connect_token=${connectToken}`;

  return Response.redirect(pluggyUrl, 302);
});
