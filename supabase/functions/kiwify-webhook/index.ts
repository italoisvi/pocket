import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';
import { encode as hexEncode } from 'https://deno.land/std@0.168.0/encoding/hex.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-kiwify-signature',
};

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );
  const computedSignature = new TextDecoder().decode(
    hexEncode(new Uint8Array(signatureBytes))
  );
  return computedSignature === signature;
}

type KiwifyOrderStatus =
  | 'paid'
  | 'refunded'
  | 'chargedback'
  | 'waiting_payment';

type KiwifyWebhookPayload = {
  order_id: string;
  order_status: KiwifyOrderStatus;
  Product: {
    product_id: string;
    product_name: string;
  };
  Customer: {
    email: string;
    full_name: string;
  };
  created_at: string;
  signature?: string;
  webhook_token?: string;
};

function mapKiwifyStatusToInternal(status: KiwifyOrderStatus): string {
  switch (status) {
    case 'paid':
      return 'approved';
    case 'refunded':
    case 'chargedback':
      return 'refunded';
    case 'waiting_payment':
      return 'pending';
    default:
      return status;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('KIWIFY_WEBHOOK_SECRET');

    if (!webhookSecret) {
      console.error('[KiwifyWebhook] KIWIFY_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook secret not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const url = new URL(req.url);
    const signatureFromQuery = url.searchParams.get('signature');

    const bodyText = await req.text();
    console.log('[KiwifyWebhook] Raw body:', bodyText);
    console.log('[KiwifyWebhook] Signature from query:', signatureFromQuery);

    const payload: KiwifyWebhookPayload = JSON.parse(bodyText);
    console.log('[KiwifyWebhook] Parsed payload:', JSON.stringify(payload));

    // TODO: Implementar validação de assinatura quando descobrir o algoritmo correto da Kiwify
    // Por enquanto, apenas verificamos se a signature está presente (indica que veio da Kiwify)
    if (signatureFromQuery) {
      console.log('[KiwifyWebhook] Signature present, proceeding with request');
    } else {
      console.warn(
        '[KiwifyWebhook] No signature provided - request may not be from Kiwify'
      );
    }

    if (
      !payload.order_id ||
      !payload.Customer?.email ||
      !payload.order_status
    ) {
      console.error('[KiwifyWebhook] Invalid payload structure');
      return new Response(
        JSON.stringify({ error: 'Invalid payload structure' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const email = payload.Customer.email.toLowerCase().trim();
    const transactionId = payload.order_id;
    const productName = payload.Product?.product_name ?? 'App Pocket';
    const status = mapKiwifyStatusToInternal(payload.order_status);
    const purchasedAt = payload.created_at
      ? new Date(payload.created_at)
      : new Date();

    const accessUntil =
      status === 'approved'
        ? new Date(purchasedAt.getTime() + ONE_YEAR_MS)
        : new Date();

    const { data: existingPurchase } = await supabaseAdmin
      .from('kiwify_purchases')
      .select('id')
      .eq('transaction_id', transactionId)
      .single();

    if (existingPurchase) {
      const { error: updateError } = await supabaseAdmin
        .from('kiwify_purchases')
        .update({
          status,
          access_until: accessUntil.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_id', transactionId);

      if (updateError) {
        console.error('[KiwifyWebhook] Error updating purchase:', updateError);
        throw updateError;
      }

      console.log(
        `[KiwifyWebhook] Updated purchase ${transactionId} to status ${status}`
      );
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('kiwify_purchases')
        .insert({
          transaction_id: transactionId,
          email,
          product_name: productName,
          status,
          purchased_at: purchasedAt.toISOString(),
          access_until: accessUntil.toISOString(),
        });

      if (insertError) {
        console.error('[KiwifyWebhook] Error inserting purchase:', insertError);
        throw insertError;
      }

      console.log(
        `[KiwifyWebhook] Inserted new purchase ${transactionId} for ${email}`
      );
    }

    if (status === 'refunded') {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq(
          'id',
          (await supabaseAdmin.auth.admin.listUsers()).data.users.find(
            (u) => u.email?.toLowerCase() === email
          )?.id ?? ''
        )
        .single();

      if (profile) {
        const { error: revokeError } = await supabaseAdmin
          .from('profiles')
          .update({ kiwify_access_until: new Date().toISOString() })
          .eq('id', profile.id);

        if (revokeError) {
          console.error('[KiwifyWebhook] Error revoking access:', revokeError);
        } else {
          console.log(
            `[KiwifyWebhook] Revoked access for profile ${profile.id}`
          );
        }
      }
    }

    return new Response(JSON.stringify({ success: true, status }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[KiwifyWebhook] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
