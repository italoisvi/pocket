import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { preloadUserContext, generateSystemPrompt } from './context.ts';
import { TOOL_DEFINITIONS } from './tools/registry.ts';
import { executeTool } from './tools/executor.ts';
import type {
  UserId,
  WaltsAgentRequest,
  WaltsAgentResponse,
  AgentThought,
  OpenAIMessage,
  OpenAIMessageContent,
  ToolCall,
} from './types.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const MAX_ITERATIONS = 3;

// ============================================================================
// OpenAI API Call
// ============================================================================

async function callOpenAI(
  messages: OpenAIMessage[],
  includeTools: boolean = true
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const body: Record<string, unknown> = {
    model: 'gpt-4o',
    messages,
    temperature: 0.7,
    max_tokens: 1500,
  };

  if (includeTools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[walts-agent] OpenAI API error:', errorText);
    throw new Error('Erro ao comunicar com o assistente');
  }

  const data = await response.json();
  const choice = data.choices[0].message;

  return {
    content: choice.content,
    tool_calls: choice.tool_calls,
  };
}

// ============================================================================
// Audio Transcription
// ============================================================================

async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    console.log('[walts-agent] Fetching audio from:', audioUrl);

    // Fetch the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();

    // Create FormData for Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    console.log('[walts-agent] Sending to Whisper API...');

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[walts-agent] Whisper API error:', errorText);
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[walts-agent] Transcription result:', data.text);

    return data.text || '';
  } catch (error) {
    console.error('[walts-agent] Transcription error:', error);
    return '';
  }
}

// ============================================================================
// ReAct Loop
// ============================================================================

function buildUserMessageContent(
  text: string,
  imageUrls?: string[]
): OpenAIMessageContent {
  if (!imageUrls || imageUrls.length === 0) {
    return text;
  }

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }
  > = [{ type: 'text', text }];

  for (const url of imageUrls) {
    content.push({
      type: 'image_url',
      image_url: { url, detail: 'auto' },
    });
  }

  return content;
}

async function reactLoop(
  userMessage: string,
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    imageUrls?: string[];
  }>,
  systemPrompt: string,
  userId: UserId,
  sessionId: string,
  supabase: ReturnType<typeof createClient>,
  imageUrls?: string[]
): Promise<{ response: string; thoughts: AgentThought[] }> {
  const thoughts: AgentThought[] = [];

  const userContent = buildUserMessageContent(userMessage, imageUrls);

  // Construir mensagens do histórico incluindo imagens
  const historyMessages: OpenAIMessage[] = history.map((m) => {
    // Se a mensagem do histórico tem imagens, construir content multimodal
    if (m.role === 'user' && m.imageUrls && m.imageUrls.length > 0) {
      return {
        role: 'user' as const,
        content: buildUserMessageContent(m.content, m.imageUrls),
      };
    }
    // Caso contrário, usar content simples
    return {
      role: m.role as 'user' | 'assistant',
      content: m.content,
    };
  });

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userContent },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(
      `[walts-agent] ReAct iteration ${iteration + 1}/${MAX_ITERATIONS}`
    );

    // Call OpenAI
    const response = await callOpenAI(messages, iteration < MAX_ITERATIONS - 1);

    // If no tool calls, return the response
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log('[walts-agent] No tool calls, returning final response');
      return {
        response:
          response.content ||
          'Desculpe, não consegui processar sua solicitação.',
        thoughts,
      };
    }

    // Execute tools
    console.log(
      `[walts-agent] Executing ${response.tool_calls.length} tool(s)`
    );

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls,
    });

    // Execute each tool and add results
    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      let params: unknown;

      try {
        params = JSON.parse(toolCall.function.arguments);
      } catch {
        params = {};
      }

      console.log(`[walts-agent] Executing tool: ${toolName}`);

      const result = await executeTool(toolName as any, params, {
        userId,
        sessionId,
        supabase,
      });

      thoughts.push({
        tool: toolName,
        input: params,
        output: {
          success: result.success,
          data: result.data,
          error: result.error,
        },
        executionTimeMs: result.executionTimeMs,
      });

      // Add tool result to messages
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(
          result.success ? result.data : { error: result.error }
        ),
      });
    }

    // After executing tools, add instruction to respond
    if (iteration === MAX_ITERATIONS - 2) {
      messages.push({
        role: 'system',
        content:
          'IMPORTANTE: Esta é sua última chance de responder. Analise os dados obtidos e responda ao usuário de forma completa e direta. NÃO chame mais ferramentas.',
      });
    }
  }

  // Max iterations reached - force a response
  console.log('[walts-agent] Max iterations reached, forcing final response');

  const finalResponse = await callOpenAI(messages, false);

  return {
    response:
      finalResponse.content ||
      'Desculpe, precisei de muitas etapas para processar sua solicitação. Por favor, tente reformular sua pergunta.',
    thoughts,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    console.log('[walts-agent] Request received');

    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[walts-agent] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: CORS_HEADERS,
        }
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
      console.error('[walts-agent] Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    // Parse request
    const {
      message,
      conversationId,
      history = [],
      imageUrls,
      audioUrls,
    } = (await req.json()) as WaltsAgentRequest;

    // Check OpenAI key first (needed for transcription)
    if (!OPENAI_API_KEY) {
      console.error('[walts-agent] OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        {
          status: 500,
          headers: CORS_HEADERS,
        }
      );
    }

    // Transcribe audio if present
    let finalMessage = message || '';
    if (audioUrls && audioUrls.length > 0) {
      console.log('[walts-agent] Transcribing audio...');
      const transcriptions = await Promise.all(
        audioUrls.map((url) => transcribeAudio(url))
      );
      const audioText = transcriptions.filter((t) => t).join(' ');
      if (audioText) {
        finalMessage = finalMessage
          ? `${finalMessage}\n\n[Áudio transcrito]: ${audioText}`
          : audioText;
      }
    }

    if (!finalMessage && (!imageUrls || imageUrls.length === 0)) {
      return new Response(JSON.stringify({ error: 'Missing message' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const userId = user.id as UserId;
    const sessionId = conversationId || crypto.randomUUID();

    console.log('[walts-agent] Processing message for user:', userId);

    // Step 1: Preload user context
    console.log('[walts-agent] Preloading user context...');
    const userContext = await preloadUserContext(supabase, userId);

    console.log('[walts-agent] Context loaded:', {
      hasName: !!userContext.user.name,
      totalIncome: userContext.user.totalIncome,
      budgetsCount: userContext.budgets.length,
      expensesCount: userContext.recentExpenses.length,
    });

    // Step 2: Generate dynamic system prompt
    const systemPrompt = generateSystemPrompt(userContext);

    // Step 3: Run ReAct loop
    console.log('[walts-agent] Starting ReAct loop...', {
      hasImages: imageUrls && imageUrls.length > 0,
      imageCount: imageUrls?.length || 0,
      hasAudio: audioUrls && audioUrls.length > 0,
      audioCount: audioUrls?.length || 0,
    });
    const { response, thoughts } = await reactLoop(
      finalMessage,
      history,
      systemPrompt,
      userId,
      sessionId,
      supabase,
      imageUrls
    );

    console.log('[walts-agent] Response generated:', {
      toolsUsed: thoughts.map((t) => t.tool),
      totalExecutionTime: thoughts.reduce(
        (sum, t) => sum + t.executionTimeMs,
        0
      ),
    });

    // Return response
    const result: WaltsAgentResponse = {
      response,
      conversationId: sessionId,
      thoughts: thoughts.length > 0 ? thoughts : undefined,
      toolsUsed: thoughts.length > 0 ? thoughts.map((t) => t.tool) : undefined,
    };

    return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
  } catch (error) {
    console.error('[walts-agent] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
