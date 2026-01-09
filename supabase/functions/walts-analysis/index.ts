import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

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
    console.log('[walts-analysis] Request received');

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[walts-analysis] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers }
      );
    }

    console.log('[walts-analysis] Authorization header present');

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

    // Ler o prompt da requisição
    const { prompt } = await req.json();

    if (!prompt) {
      console.error('[walts-analysis] Missing prompt in request body');
      return new Response(JSON.stringify({ error: 'Missing prompt' }), {
        status: 400,
        headers,
      });
    }

    console.log('[walts-analysis] Generating analysis for user:', user.id);
    console.log('[walts-analysis] Prompt length:', prompt.length);

    // Verificar se API key está configurada
    if (!DEEPSEEK_API_KEY) {
      console.error('[walts-analysis] DEEPSEEK_API_KEY not configured');
      return new Response(
        JSON.stringify({
          error:
            'DeepSeek API key not configured. Please set DEEPSEEK_API_KEY environment variable.',
        }),
        { status: 500, headers }
      );
    }

    // Chamar DeepSeek para análise
    const response = await fetch(
      'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `Você é Walts, um consultor financeiro pessoal inteligente e experiente.

Sua especialidade é analisar dados financeiros e fornecer insights práticos e acionáveis.

Diretrizes:
- Seja direto e objetivo
- Use markdown para formatação (negrito, listas, etc.)
- Forneça recomendações específicas e práticas
- Seja encorajador mas honesto
- Use emojis ocasionalmente para tornar a leitura mais agradável
- Estruture sua resposta em seções claras
- Foque em ações que o usuário pode tomar HOJE

Responda SEMPRE em português do Brasil.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[walts-analysis] DeepSeek API error:', errorText);
      throw new Error('Failed to generate analysis');
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;

    console.log('[walts-analysis] Analysis generated successfully');

    return new Response(JSON.stringify({ analysis }), { headers });
  } catch (error) {
    console.error('[walts-analysis] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
