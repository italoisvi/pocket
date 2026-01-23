import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Langfuse } from 'https://esm.sh/langfuse@3';
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
const LANGFUSE_SECRET_KEY = Deno.env.get('LANGFUSE_SECRET_KEY');
const LANGFUSE_PUBLIC_KEY = Deno.env.get('LANGFUSE_PUBLIC_KEY');
const LANGFUSE_HOST =
  Deno.env.get('LANGFUSE_HOST') || 'https://cloud.langfuse.com';

// Initialize Langfuse (optional - only if keys are configured)
const langfuse =
  LANGFUSE_SECRET_KEY && LANGFUSE_PUBLIC_KEY
    ? new Langfuse({
        secretKey: LANGFUSE_SECRET_KEY,
        publicKey: LANGFUSE_PUBLIC_KEY,
        baseUrl: LANGFUSE_HOST,
      })
    : null;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const CORS_HEADERS_STREAM = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const MAX_ITERATIONS = 3;

// ============================================================================
// Streaming Response for Voice Mode (no tools, direct response)
// ============================================================================

async function streamVoiceResponse(
  messages: OpenAIMessage[],
  onChunk: (text: string) => void
): Promise<string> {
  const body = {
    model: 'gpt-4o-mini', // Use faster model for voice
    messages,
    temperature: 0.7,
    max_tokens: 500, // Shorter responses for voice
    stream: true,
  };

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
    console.error('[walts-agent] OpenAI streaming error:', errorText);
    throw new Error('Erro ao comunicar com o assistente');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to get response reader');
  }

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }

  return fullText;
}

// ============================================================================
// OpenAI API Call
// ============================================================================

async function callOpenAI(
  messages: OpenAIMessage[],
  includeTools: boolean = true,
  traceSpan?: any
): Promise<{
  content: string | null;
  tool_calls?: ToolCall[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}> {
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

  const startTime = Date.now();

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

    // Log error to Langfuse if available
    if (traceSpan) {
      traceSpan.event({
        name: 'openai_error',
        level: 'ERROR',
        metadata: { status: response.status, error: errorText },
      });
    }

    throw new Error('Erro ao comunicar com o assistente');
  }

  const data = await response.json();
  const choice = data.choices[0].message;
  const latencyMs = Date.now() - startTime;

  // Log generation to Langfuse if available
  if (traceSpan) {
    const generation = traceSpan.generation({
      name: 'openai-gpt4o',
      model: 'gpt-4o',
      modelParameters: { temperature: 0.7, max_tokens: 1500 },
      input: messages,
      metadata: {
        includeTools,
        toolCallsCount: choice.tool_calls?.length || 0,
      },
    });
    generation.end({
      output: choice,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    });
  }

  return {
    content: choice.content,
    tool_calls: choice.tool_calls,
    usage: data.usage,
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

  // Include image URLs in text so the LLM can use them when calling create_expense
  const imageUrlsText = imageUrls
    .map((url, i) => `[IMAGEM_${i + 1}_URL: ${url}]`)
    .join('\n');
  const enrichedText = `${text}\n\n${imageUrlsText}`;

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }
  > = [{ type: 'text', text: enrichedText }];

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
  imageUrls?: string[],
  maxIterationsOverride?: number,
  trace?: any
): Promise<{
  response: string;
  thoughts: AgentThought[];
  iterations: number;
  traceId?: string;
}> {
  const thoughts: AgentThought[] = [];
  const maxIter = maxIterationsOverride ?? MAX_ITERATIONS;
  let iterationsUsed = 0;
  let totalTokens = 0;

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

  for (let iteration = 0; iteration < maxIter; iteration++) {
    iterationsUsed = iteration + 1;
    console.log(`[walts-agent] ReAct iteration ${iteration + 1}/${maxIter}`);

    // Create span for this iteration (Langfuse)
    const iterationSpan = trace?.span({
      name: `iteration-${iteration + 1}`,
      metadata: { iteration: iteration + 1, maxIterations: maxIter },
    });

    // Call OpenAI
    const response = await callOpenAI(
      messages,
      iteration < maxIter - 1,
      iterationSpan
    );

    // Track token usage
    if (response.usage) {
      totalTokens += response.usage.total_tokens;
    }

    // If no tool calls, return the response
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log('[walts-agent] No tool calls, returning final response');
      iterationSpan?.end();
      return {
        response:
          response.content ||
          'Desculpe, não consegui processar sua solicitação.',
        thoughts,
        iterations: iterationsUsed,
        traceId: trace?.id,
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

      // Create span for tool execution (Langfuse)
      const toolSpan = iterationSpan?.span({
        name: `tool:${toolName}`,
        input: params,
      });

      const result = await executeTool(toolName as any, params, {
        userId,
        sessionId,
        supabase,
      });

      // End tool span with result
      if (toolSpan) {
        toolSpan.update({
          metadata: {
            success: result.success,
            executionTimeMs: result.executionTimeMs,
          },
          level: result.success ? 'DEFAULT' : 'WARNING',
        });
        toolSpan.end({
          output: result.success ? result.data : { error: result.error },
        });
      }

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

    // End iteration span
    iterationSpan?.end();

    // After executing tools, add instruction to respond
    if (iteration === maxIter - 2) {
      messages.push({
        role: 'system',
        content:
          'IMPORTANTE: Esta é sua última chance de responder. Analise os dados obtidos e responda ao usuário de forma completa e direta. NÃO chame mais ferramentas.',
      });
    }
  }

  // Max iterations reached - force a response
  console.log('[walts-agent] Max iterations reached, forcing final response');

  const finalSpan = trace?.span({ name: 'final-response' });
  const finalResponse = await callOpenAI(messages, false, finalSpan);
  finalSpan?.end();

  return {
    response:
      finalResponse.content ||
      'Desculpe, precisei de muitas etapas para processar sua solicitação. Por favor, tente reformular sua pergunta.',
    thoughts,
    iterations: iterationsUsed,
    traceId: trace?.id,
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

    // Authenticate via JWT
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
    const userId = user.id;

    // Parse request
    const {
      message,
      conversationId,
      history = [],
      imageUrls,
      audioUrls,
      isVoiceMode = false,
      stream = false,
    } = (await req.json()) as WaltsAgentRequest & { stream?: boolean };

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

    const typedUserId = userId as UserId;
    const sessionId = conversationId || crypto.randomUUID();

    console.log('[walts-agent] Processing message for user:', typedUserId);

    // Step 1: Preload user context
    console.log('[walts-agent] Preloading user context...');
    const userContext = await preloadUserContext(supabase, typedUserId);

    console.log('[walts-agent] Context loaded:', {
      hasName: !!userContext.user.name,
      totalIncome: userContext.user.totalIncome,
      budgetsCount: userContext.budgets.length,
      expensesCount: userContext.recentExpenses.length,
    });

    // Step 2: Generate dynamic system prompt
    const systemPrompt = generateSystemPrompt(userContext, isVoiceMode);

    console.log('[walts-agent] Voice mode:', isVoiceMode, 'Stream:', stream);

    // ========================================================================
    // STREAMING MODE: For voice, return faster response without tools
    // ========================================================================
    if (isVoiceMode && stream) {
      console.log('[walts-agent] Using streaming mode for voice');

      // Build messages for streaming (no tools, direct response)
      const historyMessages: OpenAIMessage[] = history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const streamMessages: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: finalMessage },
      ];

      // Create a streaming response
      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        async start(controller) {
          try {
            const fullResponse = await streamVoiceResponse(
              streamMessages,
              (chunk) => {
                // Send each chunk as SSE
                const data = JSON.stringify({ chunk, done: false });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            );

            // Send final message with complete response
            const finalData = JSON.stringify({
              chunk: '',
              done: true,
              response: fullResponse,
              conversationId: sessionId,
            });
            controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
            controller.close();
          } catch (error) {
            console.error('[walts-agent] Streaming error:', error);
            const errorData = JSON.stringify({
              error:
                error instanceof Error ? error.message : 'Streaming failed',
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(streamBody, { headers: CORS_HEADERS_STREAM });
    }

    // ========================================================================
    // NON-STREAMING MODE: Full ReAct loop with tools
    // ========================================================================

    // Create Langfuse trace (if configured)
    const trace = langfuse?.trace({
      name: 'walts-agent',
      userId: typedUserId,
      sessionId: sessionId,
      metadata: {
        hasImages: imageUrls && imageUrls.length > 0,
        hasAudio: audioUrls && audioUrls.length > 0,
        historyLength: history.length,
        isVoiceMode,
      },
      input: { message: finalMessage, imageCount: imageUrls?.length || 0 },
    });

    // Step 3: Run ReAct loop
    console.log('[walts-agent] Starting ReAct loop...', {
      hasImages: imageUrls && imageUrls.length > 0,
      imageCount: imageUrls?.length || 0,
      hasAudio: audioUrls && audioUrls.length > 0,
      audioCount: audioUrls?.length || 0,
      traceId: trace?.id,
    });

    const startTime = Date.now();
    const { response, thoughts, iterations, traceId } = await reactLoop(
      finalMessage,
      history,
      systemPrompt,
      typedUserId,
      sessionId,
      supabase,
      imageUrls,
      undefined,
      trace
    );
    const totalDuration = Date.now() - startTime;

    // Finalize Langfuse trace
    if (trace) {
      trace.update({
        output: { response, toolsUsed: thoughts.map((t) => t.tool) },
        metadata: {
          iterations,
          totalDurationMs: totalDuration,
          toolCallsCount: thoughts.length,
        },
      });
      // Flush to ensure data is sent before response
      await langfuse?.shutdownAsync();
    }

    console.log('[walts-agent] Response generated:', {
      toolsUsed: thoughts.map((t) => t.tool),
      totalExecutionTime: thoughts.reduce(
        (sum, t) => sum + t.executionTimeMs,
        0
      ),
      iterations,
    });

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
