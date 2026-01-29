import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import type { TelegramUpdate } from './types.ts';
import { handleMessage } from './handlers/message.ts';
import { handleCallback } from './handlers/callback.ts';
import { handleCommand } from './handlers/command.ts';
import { findTelegramAccount } from './services/auth.ts';

const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
      if (secretToken !== TELEGRAM_WEBHOOK_SECRET) {
        console.error('[telegram-webhook] Invalid secret token');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: CORS_HEADERS,
        });
      }
    }

    const update: TelegramUpdate = await req.json();
    console.log('[telegram-webhook] Received update:', update.update_id);

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return new Response(JSON.stringify({ ok: true }), {
        headers: CORS_HEADERS,
      });
    }

    if (update.message) {
      const message = update.message;
      const text = message.text || '';

      if (text.startsWith('/')) {
        const telegramUserId = message.from?.id;
        const telegramAccount = telegramUserId
          ? await findTelegramAccount(telegramUserId as any)
          : null;

        await handleCommand(message, telegramAccount);
      } else {
        await handleMessage(message);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: CORS_HEADERS,
      });
    }

    console.log('[telegram-webhook] Unhandled update type');
    return new Response(JSON.stringify({ ok: true }), {
      headers: CORS_HEADERS,
    });
  } catch (error) {
    console.error('[telegram-webhook] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
