import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.2';
import { categorizeWithWalts } from '../_shared/categorize-with-walts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Helper para fetch com timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 60000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Função para transcrever áudio via Whisper
async function transcribeAudio(audioUrl: string): Promise<string> {
  const startTime = Date.now();

  try {
    console.log('[walts-agent] START transcription for:', audioUrl);

    if (!OPENAI_API_KEY) {
      console.error('[walts-agent] OPENAI_API_KEY not configured!');
      throw new Error('OpenAI API key not configured');
    }

    // Baixar o arquivo de áudio com timeout de 30s
    console.log('[walts-agent] Downloading audio file...');
    const downloadStart = Date.now();
    const audioResponse = await fetchWithTimeout(audioUrl, {}, 30000);
    console.log(
      '[walts-agent] Download took:',
      Date.now() - downloadStart,
      'ms'
    );

    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();
    const sizeKB = (audioBlob.size / 1024).toFixed(2);
    console.log('[walts-agent] Audio size:', sizeKB, 'KB');

    if (audioBlob.size === 0) {
      throw new Error('Downloaded audio file is empty');
    }

    // Verificar se o arquivo não é muito grande (max 25MB para Whisper)
    if (audioBlob.size > 25 * 1024 * 1024) {
      throw new Error('Audio file too large (max 25MB)');
    }

    // Criar FormData para enviar ao Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    console.log('[walts-agent] Sending to Whisper API...');
    const whisperStart = Date.now();

    // Enviar para OpenAI Whisper com timeout de 60s (Edge Functions podem ter limite)
    const whisperResponse = await fetchWithTimeout(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      },
      55000 // 55 segundos (abaixo do timeout da Edge Function)
    );

    console.log(
      '[walts-agent] Whisper API took:',
      Date.now() - whisperStart,
      'ms'
    );

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('[walts-agent] Whisper error:', errorText);
      throw new Error(
        `Whisper transcription failed: ${whisperResponse.status} - ${errorText}`
      );
    }

    const result = await whisperResponse.json();
    console.log(
      '[walts-agent] TOTAL transcription time:',
      Date.now() - startTime,
      'ms'
    );
    console.log(
      '[walts-agent] Transcription result:',
      result.text?.substring(0, 100)
    );

    return result.text || '';
  } catch (error: any) {
    console.error(
      '[walts-agent] Transcribe error after',
      Date.now() - startTime,
      'ms:',
      error.message
    );
    throw error;
  }
}

// Processa mensagens para transcrever áudios antes de enviar ao LLM
// IMPORTANTE: Só processa o ÚLTIMO áudio para evitar reprocessar histórico
async function processMessagesWithAudio(messages: any[]): Promise<any[]> {
  const processedMessages = [];

  console.log(
    '[walts-agent] Processing',
    messages.length,
    'messages for audio and images'
  );

  // Encontrar o índice da última mensagem com áudio (para processar apenas ela)
  let lastAudioMessageIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (
      msg.attachments &&
      Array.isArray(msg.attachments) &&
      msg.attachments.some((a: any) => a.type === 'audio' && a.url)
    ) {
      lastAudioMessageIndex = i;
      break;
    }
  }

  console.log('[walts-agent] Last audio message index:', lastAudioMessageIndex);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const attachments = message.attachments || [];

    // Separar tipos de attachments
    const audioAttachments = attachments.filter((a: any) => a.type === 'audio' && a.url);
    const imageAttachments = attachments.filter((a: any) => a.type === 'image' && a.url);

    // Só processar áudio se for a ÚLTIMA mensagem com áudio
    const shouldProcessAudio = i === lastAudioMessageIndex && audioAttachments.length > 0;

    // Processar imagens da última mensagem do usuário (para visão)
    const isLastUserMessage = i === messages.length - 1 && message.role === 'user';
    const shouldProcessImages = isLastUserMessage && imageAttachments.length > 0;

    console.log(`[walts-agent] Message ${i}:`, {
      role: message.role,
      audioCount: audioAttachments.length,
      imageCount: imageAttachments.length,
      shouldProcessAudio,
      shouldProcessImages,
    });

    let textContent = message.content || '';

    // Processar áudio (transcrever)
    if (shouldProcessAudio) {
      console.log('[walts-agent] Processing', audioAttachments.length, 'audio attachments');

      const MAX_TRANSCRIPTION_LENGTH = 1500;
      const transcriptions: string[] = [];

      for (const audio of audioAttachments) {
        console.log('[walts-agent] Processing audio:', audio.url);
        try {
          let transcription = await transcribeAudio(audio.url);
          if (transcription && transcription.trim().length > 0) {
            transcription = transcription.trim();
            if (transcription.length > MAX_TRANSCRIPTION_LENGTH) {
              console.warn(`[walts-agent] Transcription truncated from ${transcription.length} to ${MAX_TRANSCRIPTION_LENGTH} chars`);
              transcription = transcription.substring(0, MAX_TRANSCRIPTION_LENGTH) + '... [áudio longo, transcrição parcial]';
            }
            transcriptions.push(transcription);
            console.log('[walts-agent] Transcription added:', transcription.substring(0, 50) + '...');
          } else {
            console.warn('[walts-agent] Transcription returned empty');
            transcriptions.push('[Áudio recebido - transcrição vazia]');
          }
        } catch (error: any) {
          console.error('[walts-agent] Failed to transcribe audio:', error?.message || error);
          transcriptions.push(`[Erro ao transcrever áudio: ${error?.message || 'erro desconhecido'}]`);
        }
      }

      if (transcriptions.length > 0) {
        const audioText = transcriptions.join(' ');
        textContent = textContent ? `${textContent}\n\n${audioText}` : audioText;
      }
    }

    // Se não tem imagens para processar, usar formato simples
    if (!shouldProcessImages) {
      // Para mensagens antigas de áudio sem conteúdo, adicionar placeholder
      if (!textContent && audioAttachments.length > 0) {
        textContent = '[Mensagem de áudio anterior]';
      }
      if (!textContent && imageAttachments.length > 0) {
        textContent = '[Imagem enviada anteriormente]';
      }

      processedMessages.push({
        role: message.role,
        content: textContent || '',
      });
      continue;
    }

    // Processar imagens para a API da OpenAI (formato multimodal)
    // OpenAI espera: content: [{type: "text", text: "..."}, {type: "image_url", image_url: {url: "..."}}]
    console.log('[walts-agent] Processing', imageAttachments.length, 'images for vision');

    try {
      const contentParts: any[] = [];

      // Adicionar texto primeiro (se houver)
      if (textContent) {
        contentParts.push({
          type: 'text',
          text: textContent,
        });
      } else {
        // Se não tem texto, adicionar instrução para analisar a imagem
        contentParts.push({
          type: 'text',
          text: 'Analise esta imagem e me ajude com o que você vê.',
        });
      }

      // Adicionar cada imagem (validar URL antes)
      for (const img of imageAttachments) {
        if (img.url && typeof img.url === 'string' && img.url.startsWith('http')) {
          console.log('[walts-agent] Adding image to content:', img.url.substring(0, 80) + '...');
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: img.url,
              detail: 'low', // Usar 'low' para reduzir tokens e evitar erros
            },
          });
        } else {
          console.warn('[walts-agent] Invalid image URL:', img.url?.substring(0, 50));
        }
      }

      // Se não conseguiu adicionar nenhuma imagem válida, usar só texto
      if (contentParts.length === 1) {
        processedMessages.push({
          role: message.role,
          content: textContent || 'Não consegui processar a imagem enviada.',
        });
      } else {
        processedMessages.push({
          role: message.role,
          content: contentParts,
        });
      }
    } catch (imgError: any) {
      console.error('[walts-agent] Error processing images:', imgError?.message || imgError);
      // Fallback: só texto
      processedMessages.push({
        role: message.role,
        content: textContent || '[Erro ao processar imagem]',
      });
    }
  }

  console.log('[walts-agent] Processed messages count:', processedMessages.length);
  return processedMessages;
}

// ============================================================================
// LIMPEZA DE RESPOSTAS
// Remove XML/DSML que o DeepSeek às vezes vaza no content
// ============================================================================

function cleanResponseContent(content: string | null | undefined): string {
  if (!content) return '';

  // CORREÇÃO BUG #5: Regex mais agressivo para limpar XML/DSML
  // Padrões observados: < | DSML | function_calls>, <| DSML |invoke>, etc.
  let cleaned = content
    // 1. Remover QUALQUER coisa que pareça XML/DSML de function calling (mais agressivo)
    .replace(/<[^>]*DSML[^>]*>[\s\S]*?<\/[^>]*DSML[^>]*>/gi, '')
    // 2. Remover do início de XML até o fim da string (quando tag não fechou)
    .replace(/<[^>]*function_calls[^>]*>[\s\S]*$/gi, '')
    .replace(/<[^>]*invoke[^>]*>[\s\S]*$/gi, '')
    // 3. Remover blocos completos de function_calls (várias variações de espaçamento)
    .replace(
      /<\s*\|?\s*DSML\s*\|?\s*function_calls[\s\S]*?<\/?\s*\|?\s*DSML\s*\|?\s*function_calls\s*>/gi,
      ''
    )
    // 4. Remover invoke com conteúdo
    .replace(
      /<\s*\|?\s*DSML\s*\|?\s*invoke[^>]*>[\s\S]*?<\/?\s*\|?\s*DSML\s*\|?\s*invoke\s*>/gi,
      ''
    )
    // 5. Remover parameter com conteúdo
    .replace(
      /<\s*\|?\s*DSML\s*\|?\s*parameter[^>]*>[^<]*<\/?\s*\|?\s*DSML\s*\|?\s*parameter\s*>/gi,
      ''
    )
    // 6. Remover tags DSML abertas/fechadas individualmente
    .replace(/<\s*\|?\s*DSML\s*\|?[^>]*>/gi, '')
    .replace(/<\/?\s*\|?\s*DSML\s*\|?[^>]*>/gi, '')
    // 7. Remover blocos XML de function calls genéricos (antml, etc)
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
    .replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/gi, '')
    .replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/gi, '')
    .replace(/<invoke[^>]*>[\s\S]*?<\/antml:invoke>/gi, '')
    .replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/gi, '')
    .replace(/<parameter[^>]*>[^<]*<\/parameter>/gi, '')
    .replace(/<parameter[^>]*>[^<]*<\/antml:parameter>/gi, '')
    // 8. Remover tags < | ... > (com espaços e pipes)
    .replace(/<\s*\|[^>]*>/g, '')
    .replace(/<\/\s*\|[^>]*>/g, '')
    // 9. Remover linhas que são apenas tags ou símbolos de tags
    .replace(/^<\s*\/?\s*\|[^>]*>\s*$/gm, '')
    .replace(/^<\s*\|[^>]*>\s*$/gm, '')
    .replace(/^[<>|\/\s]+$/gm, '')
    // 10. Remover >texto< órfãos de tags
    .replace(/^>[^<\n]+<$/gm, '')
    // 11. Limpar espaços extras
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Se ficou só com lixo XML, retornar vazio
  if (cleaned.match(/^[\s<>|\/]*$/)) {
    return '';
  }

  // Se após limpeza ficou vazio ou muito curto, retornar mensagem padrão
  if (cleaned.length < 5) {
    return '';
  }

  return cleaned;
}

// ============================================================================
// FERRAMENTAS CONSOLIDADAS (7 ao invés de 20)
// Menos ferramentas = DeepSeek escolhe melhor e responde mais rápido
// ============================================================================

const WALTS_TOOLS = [
  // 1. GERENCIAR GASTOS (criar, editar, deletar)
  {
    type: 'function',
    function: {
      name: 'manage_expense',
      description:
        'Gerencia gastos/comprovantes do usuário. Use para criar novos gastos, editar existentes ou deletar.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description: 'Ação a ser executada',
          },
          expense_id: {
            type: 'string',
            description: 'ID do gasto (obrigatório para update/delete)',
          },
          establishment_name: {
            type: 'string',
            description: 'Nome do estabelecimento (ex: Subway, Uber)',
          },
          amount: {
            type: 'number',
            description: 'Valor em reais',
          },
          category: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'outros',
            ],
            description: 'Categoria do gasto',
          },
          subcategory: {
            type: 'string',
            description: 'Subcategoria opcional',
          },
          date: {
            type: 'string',
            description: 'Data no formato YYYY-MM-DD',
          },
          confirm_delete: {
            type: 'boolean',
            description: 'Confirmar exclusão (necessário para delete)',
          },
          force_create: {
            type: 'boolean',
            description:
              'Forçar criação mesmo se existir gasto similar (usar quando usuário confirmar que quer duplicar)',
          },
        },
        required: ['action'],
      },
    },
  },

  // 2. GERENCIAR ORÇAMENTOS (criar, editar, deletar, verificar)
  {
    type: 'function',
    function: {
      name: 'manage_budget',
      description:
        'Gerencia orçamentos do usuário. Use para criar, editar, deletar ou verificar status de orçamentos.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete', 'check'],
            description: 'Ação a ser executada',
          },
          category_id: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'outros',
            ],
            description: 'Categoria do orçamento',
          },
          amount: {
            type: 'number',
            description: 'Valor limite em reais',
          },
          period_type: {
            type: 'string',
            enum: ['monthly', 'weekly', 'yearly'],
            description: 'Período do orçamento',
          },
          notifications_enabled: {
            type: 'boolean',
            description: 'Habilitar notificações',
          },
          confirm_delete: {
            type: 'boolean',
            description: 'Confirmar exclusão',
          },
        },
        required: ['action'],
      },
    },
  },

  // 3. SINCRONIZAR BANCO (Open Finance)
  {
    type: 'function',
    function: {
      name: 'sync_bank',
      description:
        'Gerencia transações do banco via Open Finance. QUANDO O USUÁRIO PEDIR PARA CATEGORIZAR AS TRANSAÇÕES/EXTRATO, USE action=categorize_and_save.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'categorize_and_save',
              'statement',
              'preview',
            ],
            description:
              'categorize_and_save=CATEGORIZAR transações do extrato e SALVAR no app (use quando usuário pedir para categorizar), statement=ver extrato bancário, preview=apenas visualizar categorias sugeridas SEM salvar',
          },
          days: {
            type: 'number',
            description: 'Número de dias para buscar (padrão: 30)',
          },
          account_name: {
            type: 'string',
            description: 'Nome do banco específico (opcional)',
          },
        },
        required: ['action'],
      },
    },
  },

  // 4. ANALISAR FINANÇAS (padrões, sugestões, previsões)
  {
    type: 'function',
    function: {
      name: 'analyze_finances',
      description:
        'Analisa as finanças do usuário. Use para detectar padrões, sugerir economias, prever fim do mês ou detectar anomalias.',
      parameters: {
        type: 'object',
        properties: {
          analysis_type: {
            type: 'string',
            enum: ['patterns', 'savings', 'forecast', 'anomaly'],
            description:
              'patterns=análise de padrões, savings=sugestões de economia, forecast=previsão fim do mês, anomaly=detectar gastos anormais',
          },
          category: {
            type: 'string',
            description: 'Categoria específica para análise (opcional)',
          },
          months: {
            type: 'number',
            description: 'Número de meses para análise (padrão: 3)',
          },
          savings_goal: {
            type: 'number',
            description: 'Meta de economia em reais (para savings)',
          },
        },
        required: ['analysis_type'],
      },
    },
  },

  // 5. BUSCAR DADOS (qualquer dado do app)
  {
    type: 'function',
    function: {
      name: 'get_data',
      description:
        'Busca dados específicos do Pocket. Use APENAS se a informação não estiver no contexto acima.',
      parameters: {
        type: 'object',
        properties: {
          data_type: {
            type: 'string',
            enum: [
              'expenses',
              'profile',
              'bank_accounts',
              'credit_cards',
              'transactions',
              'all',
            ],
            description: 'Tipo de dados a buscar',
          },
          category: {
            type: 'string',
            description: 'Filtrar por categoria (para expenses)',
          },
          days: {
            type: 'number',
            description: 'Número de dias de histórico (padrão: 30)',
          },
          limit: {
            type: 'number',
            description: 'Limite de registros (padrão: 50)',
          },
        },
        required: ['data_type'],
      },
    },
  },

  // 6. GERENCIAR MEMÓRIA (preferências do usuário)
  {
    type: 'function',
    function: {
      name: 'manage_memory',
      description:
        'Salva ou busca preferências e contextos do usuário para personalização.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['save', 'get'],
            description: 'save=salvar preferência, get=buscar contexto',
          },
          memory_type: {
            type: 'string',
            enum: ['preference', 'context', 'goal', 'habit'],
            description: 'Tipo de memória',
          },
          key: {
            type: 'string',
            description: 'Chave da preferência (ex: spending_priority)',
          },
          value: {
            type: 'string',
            description: 'Valor a salvar',
          },
        },
        required: ['action'],
      },
    },
  },

  // 7. EXPORTAR DADOS
  {
    type: 'function',
    function: {
      name: 'export_data',
      description: 'Exporta dados financeiros em CSV ou JSON.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['csv', 'json'],
            description: 'Formato de exportação',
          },
          data_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['expenses', 'budgets', 'profile'],
            },
            description: 'Tipos de dados a exportar',
          },
          date_from: {
            type: 'string',
            description: 'Data inicial YYYY-MM-DD',
          },
          date_to: {
            type: 'string',
            description: 'Data final YYYY-MM-DD',
          },
        },
      },
    },
  },
];

// Manter ferramentas antigas como alias para compatibilidade
const LEGACY_TOOL_MAPPING: { [key: string]: string } = {
  create_expense_from_description: 'manage_expense',
  update_expense: 'manage_expense',
  delete_expense: 'manage_expense',
  create_budget: 'manage_budget',
  update_budget: 'manage_budget',
  delete_budget: 'manage_budget',
  check_budget_status: 'manage_budget',
  sync_open_finance_transactions: 'sync_bank',
  categorize_open_finance_transactions: 'sync_bank',
  recategorize_expenses: 'sync_bank',
  get_bank_statement: 'sync_bank',
  analyze_spending_pattern: 'analyze_finances',
  suggest_savings: 'analyze_finances',
  forecast_month_end: 'analyze_finances',
  check_if_anomaly: 'analyze_finances',
  get_financial_patterns: 'analyze_finances',
  get_pocket_data: 'get_data',
  save_user_preference: 'manage_memory',
  get_user_context: 'manage_memory',
};

// ============================================================================
// FERRAMENTAS ANTIGAS (mantidas para compatibilidade, serão removidas depois)
// ============================================================================

const WALTS_TOOLS_LEGACY = [
  {
    type: 'function',
    function: {
      name: 'create_budget',
      description:
        'Cria um novo orçamento para uma categoria específica. Use quando o usuário pedir para criar um limite de gastos.',
      parameters: {
        type: 'object',
        properties: {
          category_id: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'outros',
            ],
            description: 'Categoria do orçamento',
          },
          amount: {
            type: 'number',
            description: 'Valor limite do orçamento em reais (ex: 500.00)',
          },
          period_type: {
            type: 'string',
            enum: ['monthly', 'weekly', 'yearly'],
            description: 'Tipo de período do orçamento',
            default: 'monthly',
          },
          notifications_enabled: {
            type: 'boolean',
            description:
              'Habilitar notificações quando atingir 80%, 90% e 100% do orçamento',
            default: true,
          },
        },
        required: ['category_id', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_budget',
      description:
        'Atualiza um orçamento existente. Use quando o usuário pedir para alterar o limite ou configurações de um orçamento.',
      parameters: {
        type: 'object',
        properties: {
          category_id: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'outros',
            ],
            description: 'Categoria do orçamento a ser atualizado',
          },
          amount: {
            type: 'number',
            description: 'Novo valor limite do orçamento em reais',
          },
          period_type: {
            type: 'string',
            enum: ['monthly', 'weekly', 'yearly'],
            description: 'Novo tipo de período do orçamento',
          },
          notifications_enabled: {
            type: 'boolean',
            description: 'Habilitar/desabilitar notificações',
          },
        },
        required: ['category_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_budget_status',
      description:
        'Verifica o status de todos os orçamentos ou de uma categoria específica. Use quando o usuário pedir para ver como estão os orçamentos.',
      parameters: {
        type: 'object',
        properties: {
          category_id: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'outros',
            ],
            description:
              'Categoria específica para verificar. Se não especificado, retorna todos os orçamentos.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bank_statement',
      description:
        'Busca o extrato bancário das contas conectadas via Open Finance. Use quando o usuário pedir para ver transações, extrato, movimentações bancárias ou perguntar sobre gastos/receitas específicos.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description:
              'Número de dias para buscar no histórico (ex: 7 para última semana, 30 para último mês, 90 para últimos 3 meses)',
            default: 30,
          },
          account_name: {
            type: 'string',
            description:
              'Nome específico da conta/banco (ex: Nubank, Inter). Se não especificado, busca de todas as contas.',
          },
          transaction_type: {
            type: 'string',
            enum: ['DEBIT', 'CREDIT', 'ALL'],
            description:
              'Tipo de transação: DEBIT (saídas/despesas), CREDIT (entradas/receitas), ALL (todas)',
            default: 'ALL',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_spending_pattern',
      description:
        'Analisa padrões de gastos do usuário e detecta anomalias. Use quando o usuário pedir para analisar seus gastos, identificar padrões ou verificar se está gastando mais que o normal.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'outros',
            ],
            description:
              'Categoria específica para analisar. Se não especificado, analisa todas as categorias.',
          },
          months: {
            type: 'number',
            description:
              'Número de meses de histórico para análise (ex: 3 para trimestre, 6 para semestre)',
            default: 3,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_savings',
      description:
        'Sugere onde o usuário pode economizar com base em seus gastos. Use quando o usuário pedir dicas de economia, onde pode cortar gastos ou como economizar mais.',
      parameters: {
        type: 'object',
        properties: {
          target_amount: {
            type: 'number',
            description:
              'Valor alvo que o usuário quer economizar (opcional). Se especificado, as sugestões serão direcionadas para atingir esse valor.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forecast_month_end',
      description:
        'Prevê como será o fim do mês com base nos gastos atuais. Use quando o usuário perguntar se vai passar do orçamento, quanto vai sobrar no final do mês ou pedir projeções.',
      parameters: {
        type: 'object',
        properties: {
          include_recommendations: {
            type: 'boolean',
            description:
              'Se deve incluir recomendações de ajustes de gastos para melhorar a projeção',
            default: true,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_user_preference',
      description:
        'Salva uma preferência ou contexto do usuário para uso futuro. Use quando o usuário mencionar preferências, padrões de comportamento ou informações importantes que devem ser lembradas.',
      parameters: {
        type: 'object',
        properties: {
          memory_type: {
            type: 'string',
            enum: ['preference', 'context', 'insight'],
            description:
              'Tipo de memória: preference (preferência do usuário), context (contexto importante), insight (padrão/comportamento aprendido)',
          },
          key: {
            type: 'string',
            description:
              'Identificador único da memória (ex: favorite_category, spending_priority, payment_day_reminder)',
          },
          value: {
            type: 'object',
            description:
              'Valor da memória em formato JSON (pode conter qualquer estrutura de dados)',
          },
          confidence: {
            type: 'number',
            description:
              'Nível de confiança da memória (0.0 a 1.0). Use 1.0 para informações explícitas do usuário, 0.5-0.8 para inferências',
            default: 1.0,
          },
          source: {
            type: 'string',
            description:
              'Contexto de onde a memória foi aprendida (ex: "usuário mencionou preferência", "observado padrão de gastos")',
          },
        },
        required: ['memory_type', 'key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_context',
      description:
        'Busca preferências e contextos salvos do usuário. Use no início de conversas importantes ou quando precisar personalizar respostas baseado no histórico.',
      parameters: {
        type: 'object',
        properties: {
          memory_type: {
            type: 'string',
            enum: ['preference', 'context', 'insight', 'all'],
            description:
              'Tipo de memória a buscar. Use "all" para buscar todos os tipos.',
            default: 'all',
          },
          key: {
            type: 'string',
            description:
              'Chave específica para buscar. Se não especificado, retorna todas as memórias do tipo selecionado.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_financial_patterns',
      description:
        'Busca padrões financeiros aprendidos sobre o usuário. Use para personalizar sugestões, detectar anomalias e entender os hábitos do usuário. SEMPRE use esta ferramenta antes de dar conselhos financeiros.',
      parameters: {
        type: 'object',
        properties: {
          pattern_type: {
            type: 'string',
            enum: [
              'spending_habit',
              'favorite_place',
              'time_pattern',
              'payment_cycle',
              'category_trend',
              'anomaly_threshold',
              'all',
            ],
            description:
              'Tipo de padrão a buscar. spending_habit = médias de gasto por categoria, favorite_place = lugares frequentes, time_pattern = padrões de horário/dia, payment_cycle = ciclo de pagamento, category_trend = tendências, anomaly_threshold = limiares para detectar gastos anormais. Use "all" para buscar todos.',
            default: 'all',
          },
          category: {
            type: 'string',
            description:
              'Categoria específica para filtrar padrões. Se não especificado, retorna de todas as categorias.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_if_anomaly',
      description:
        'Verifica se um gasto específico é uma anomalia baseado nos padrões aprendidos do usuário. Use quando o usuário registrar um gasto e você quiser verificar se é fora do normal.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Categoria do gasto a verificar',
          },
          amount: {
            type: 'number',
            description: 'Valor do gasto em reais',
          },
        },
        required: ['category', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recategorize_expenses',
      description:
        'Recategoriza despesas existentes usando IA. Use quando o usuário pedir para recategorizar gastos que estão como "outros" ou com categoria errada.',
      parameters: {
        type: 'object',
        properties: {
          force_all: {
            type: 'boolean',
            description:
              'Se true, recategoriza TODOS os gastos. Se false (padrão), apenas recategoriza os que estão como "outros".',
            default: false,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'categorize_extract',
      description:
        'APENAS CATEGORIZA transacoes do extrato bancario SEM REGISTRAR como gastos no app. Use esta ferramenta quando o usuario pedir para "categorizar", "classificar" ou "ver categorias" das transacoes do extrato. NAO afeta o saldo do app. As categorias sao salvas para visualizacao em Custos Fixos/Variaveis.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Numero de dias para buscar transacoes (padrao: 30)',
            default: 30,
          },
          account_name: {
            type: 'string',
            description: 'Nome do banco/conta especifica (ex: Nubank, Inter)',
          },
          only_uncategorized: {
            type: 'boolean',
            description: 'Se true (padrao), categoriza apenas transacoes ainda nao categorizadas',
            default: true,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pocket_data',
      description:
        'Busca TODOS os dados do Pocket do usuário. Use esta ferramenta para responder perguntas sobre comprovantes, gastos, perfil, cartões, faturas, gastos fixos/variáveis, resumos financeiros. SEMPRE use esta ferramenta quando o usuário perguntar sobre seus dados no app.',
      parameters: {
        type: 'object',
        properties: {
          data_type: {
            type: 'string',
            enum: [
              'expenses',
              'profile',
              'credit_cards',
              'credit_card_transactions',
              'bank_accounts',
              'connected_banks',
              'budgets',
              'fixed_costs',
              'variable_costs',
              'analysis_history',
              'summary',
              'all',
            ],
            description:
              'Tipo de dados a buscar: expenses (comprovantes/gastos), profile (perfil com salário), credit_cards (cartões de crédito), credit_card_transactions (faturas), bank_accounts (contas bancárias), connected_banks (bancos conectados e status), budgets (orçamentos), fixed_costs (gastos fixos), variable_costs (gastos variáveis), analysis_history (histórico de Raio-X), summary (resumo geral), all (tudo)',
          },
          days: {
            type: 'number',
            description:
              'Número de dias para buscar histórico. Padrão: 30 dias (mês atual).',
            default: 30,
          },
          category: {
            type: 'string',
            description:
              'Filtrar por categoria específica (ex: alimentacao, transporte, moradia).',
          },
        },
        required: ['data_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_expense',
      description:
        'Exclui gastos do usuário. Pode deletar um, vários ou TODOS. Use quando o usuário pedir para remover, apagar ou deletar gastos.',
      parameters: {
        type: 'object',
        properties: {
          expense_id: {
            type: 'string',
            description: 'ID de um gasto específico para excluir.',
          },
          expense_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de IDs de gastos para excluir múltiplos de uma vez.',
          },
          delete_all: {
            type: 'boolean',
            description: 'Se true, deleta TODOS os gastos do usuário. Use com cuidado!',
            default: false,
          },
          source_filter: {
            type: 'string',
            enum: ['all', 'manual', 'import'],
            description: 'Filtrar por origem: all=todos, manual=apenas manuais, import=apenas importados do extrato',
            default: 'all',
          },
          confirm: {
            type: 'boolean',
            description: 'Confirmação de exclusão. SEMPRE false primeiro para mostrar o que será deletado, depois true para confirmar.',
            default: false,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_expense',
      description:
        'Atualiza um comprovante/gasto existente. Use quando o usuário pedir para editar, alterar, corrigir um gasto.',
      parameters: {
        type: 'object',
        properties: {
          expense_id: {
            type: 'string',
            description: 'ID do gasto a ser atualizado',
          },
          establishment_name: {
            type: 'string',
            description: 'Novo nome do estabelecimento',
          },
          amount: {
            type: 'number',
            description: 'Novo valor do gasto',
          },
          category: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'beleza',
              'eletronicos',
              'delivery',
              'transferencias',
              'outros',
            ],
            description: 'Nova categoria',
          },
          subcategory: {
            type: 'string',
            description: 'Nova subcategoria',
          },
          date: {
            type: 'string',
            description: 'Nova data no formato YYYY-MM-DD',
          },
          notes: {
            type: 'string',
            description: 'Novas observações/notas',
          },
        },
        required: ['expense_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_budget',
      description:
        'Exclui um orçamento existente. Use quando o usuário pedir para remover um limite/orçamento de gastos. SEMPRE peça confirmação.',
      parameters: {
        type: 'object',
        properties: {
          category_id: {
            type: 'string',
            enum: [
              'alimentacao',
              'transporte',
              'lazer',
              'saude',
              'educacao',
              'moradia',
              'vestuario',
              'outros',
            ],
            description: 'Categoria do orçamento a excluir',
          },
          confirm: {
            type: 'boolean',
            description:
              'Confirmação de exclusão. SEMPRE defina como false primeiro para mostrar o orçamento, depois true para confirmar.',
            default: false,
          },
        },
        required: ['category_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_data',
      description:
        'Exporta dados financeiros do usuário e gera link para download. Use quando o usuário pedir para exportar, baixar, fazer backup ou gerar relatório dos dados.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['csv', 'json'],
            description: 'Formato de exportação',
            default: 'csv',
          },
          data_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['expenses', 'budgets', 'profile', 'transactions'],
            },
            description: 'Tipos de dados a exportar. Se vazio, exporta tudo.',
          },
          date_from: {
            type: 'string',
            description: 'Data inicial no formato YYYY-MM-DD (opcional)',
          },
          date_to: {
            type: 'string',
            description: 'Data final no formato YYYY-MM-DD (opcional)',
          },
        },
      },
    },
  },
];

// ============================================================================
// PRÉ-CARREGAMENTO DE CONTEXTO DO USUÁRIO
// Busca dados essenciais ANTES de cada conversa para reduzir chamadas de ferramentas
// ============================================================================

// Categorias de custos fixos (essenciais) - definição única para todo o arquivo
const PRELOAD_FIXED_CATEGORIES = ['moradia', 'alimentacao', 'transporte', 'saude', 'educacao'];
// Categorias de custos variáveis (não-essenciais)
const PRELOAD_VARIABLE_CATEGORIES = ['lazer', 'vestuario', 'beleza', 'eletronicos', 'delivery', 'outros'];

type ExpenseItem = {
  id: string;
  establishment_name: string;
  amount: number;
  category: string;
  date: string;
};

type UserContext = {
  // ========== DADOS DO PERFIL ==========
  profile: {
    name: string | null;
    monthly_salary: number | null;
    salary_payment_day: number | null;
  } | null;
  // Fontes de renda completas
  incomeCards: Array<{
    name: string;
    salary: number;
    paymentDay: number;
    type: string;
  }>;
  // ========== ORÇAMENTOS ==========
  budgets: Array<{
    category_id: string;
    amount: number;
    period_type: string;
    spent: number;
    remaining: number;
    percent_used: number;
  }>;
  // ========== DESPESAS - TODAS ==========
  recentExpenses: ExpenseItem[];
  // ========== CUSTOS FIXOS E VARIÁVEIS SEPARADOS ==========
  fixedCosts: {
    items: ExpenseItem[];
    totalMonth: number;
    byCategory: Array<{ category: string; total: number; count: number }>;
  };
  variableCosts: {
    items: ExpenseItem[];
    totalMonth: number;
    byCategory: Array<{ category: string; total: number; count: number }>;
  };
  // ========== MEMÓRIA DO WALTS ==========
  preferences: Array<{
    key: string;
    value: string;
    memory_type: string;
  }>;
  // ========== RESUMO DO MÊS ==========
  summary: {
    total_spent_this_month: number;
    expense_count_this_month: number;
    top_categories: Array<{ category: string; total: number }>;
    fixedCostsTotal: number;
    variableCostsTotal: number;
  };
  // ========== COMPARATIVOS E GRÁFICOS ==========
  comparisons: {
    // Mês anterior
    lastMonth: {
      total: number;
      fixedCosts: number;
      variableCosts: number;
      byCategory: Array<{ category: string; total: number }>;
    };
    // Variações
    monthOverMonth: {
      totalChange: number; // % de mudança
      fixedCostsChange: number;
      variableCostsChange: number;
      trend: 'up' | 'down' | 'stable';
    };
    // Média mensal
    averageMonthly: {
      total: number;
      fixedCosts: number;
      variableCosts: number;
    };
  };
  // Dados para gráficos
  chartData: {
    // Distribuição por categoria (para gráfico de pizza)
    categoryDistribution: Array<{
      category: string;
      total: number;
      percentage: number;
    }>;
    // Últimos 3 meses (para gráfico de barras)
    last3Months: Array<{
      month: string;
      total: number;
      fixedCosts: number;
      variableCosts: number;
    }>;
  };
  // ========== OPEN FINANCE - SEPARADO CORRETAMENTE ==========
  // Contas Correntes = DINHEIRO REAL (saldo)
  checkingAccounts: Array<{
    id: string;
    name: string;
    bank: string;
    balance: number; // SALDO REAL em dinheiro
  }>;
  // Cartões de Crédito = CRÉDITO (limite, não é saldo!)
  creditCards: Array<{
    id: string;
    name: string;
    bank: string;
    creditLimit: number;
    availableLimit: number;
    usedAmount: number;
    billAmount: number; // Valor da fatura atual
  }>;
  // Transações recentes do extrato
  recentTransactions: Array<{
    id: string;
    description: string;
    amount: number;
    type: string; // DEBIT ou CREDIT
    date: string;
    account_name: string;
  }>;
  // Conexões bancárias (Open Finance)
  bankConnections: Array<{
    id: string;
    bank: string;
    status: string;
    lastUpdate: string;
  }>;
  // ========== TOTAIS CALCULADOS ==========
  totals: {
    realBalance: number; // Soma das contas correntes = DINHEIRO REAL
    totalCreditLimit: number;
    totalCreditUsed: number;
    totalCreditAvailable: number;
    totalIncome: number; // Soma de todas as fontes de renda
    totalBillsAmount: number; // Soma das faturas dos cartões
  };
  // ========== PADRÕES E ANÁLISES ==========
  financialPatterns: Array<{
    pattern_type: string;
    description: string;
    value: number;
    detected_at: string;
  }>;
  recentAnalyses: Array<{
    analysis_type: string;
    summary: string;
    created_at: string;
  }>;
};

async function preloadUserContext(
  supabase: any,
  userId: string
): Promise<UserContext> {
  console.log('[walts-agent] Preloading user context...');
  const startTime = Date.now();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

  // ========== BUSCAR TUDO EM PARALELO - WALTS ONISCIENTE ==========
  const [
    profileResult,
    budgetsResult,
    expensesResult,
    preferencesResult,
    accountsResult,
    pluggyItemsResult,
    patternsResult,
    analysesResult,
  ] = await Promise.all([
    // Perfil do usuário com income_cards completo
    supabase
      .from('profiles')
      .select('name, monthly_salary, salary_payment_day, income_cards')
      .eq('id', userId)
      .single(),

    // Orçamentos ativos
    supabase.from('budgets').select('*').eq('user_id', userId),

    // Gastos dos últimos 90 dias (para ter 3 meses de dados para comparativos)
    supabase
      .from('expenses')
      .select('id, establishment_name, amount, category, date')
      .eq('user_id', userId)
      .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false }),

    // Preferências salvas do usuário
    supabase
      .from('walts_memory')
      .select('key, value, memory_type')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20),

    // Contas bancárias do Open Finance - COM CAMPOS DE CRÉDITO!
    supabase
      .from('pluggy_accounts')
      .select('id, name, type, balance, credit_limit, available_credit_limit, pluggy_items(connector_name)')
      .eq('user_id', userId),

    // Conexões Open Finance (pluggy_items)
    supabase
      .from('pluggy_items')
      .select('id, connector_name, status, last_updated_at')
      .eq('user_id', userId),

    // Padrões financeiros detectados
    supabase
      .from('user_financial_patterns')
      .select('pattern_type, description, value, detected_at')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .limit(10),

    // Últimas análises do Walts
    supabase
      .from('walts_analyses')
      .select('analysis_type, summary, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // Processar perfil e income_cards COMPLETOS
  let profile = null;
  let incomeCards: UserContext['incomeCards'] = [];
  let totalIncome = 0;

  if (profileResult.data) {
    let monthlySalary = profileResult.data.monthly_salary;
    let paymentDay = profileResult.data.salary_payment_day;

    // Processar income_cards completos
    if (
      profileResult.data.income_cards &&
      Array.isArray(profileResult.data.income_cards) &&
      profileResult.data.income_cards.length > 0
    ) {
      incomeCards = profileResult.data.income_cards.map((card: any) => {
        const salary = parseFloat(
          String(card.salary || '0').replace(/\./g, '').replace(',', '.')
        );
        const salaryValue = isNaN(salary) ? 0 : salary;
        totalIncome += salaryValue;
        return {
          name: card.name || 'Fonte de renda',
          salary: salaryValue,
          paymentDay: parseInt(card.paymentDay) || 1,
          type: card.type || 'salary',
        };
      });

      if (totalIncome > 0) {
        monthlySalary = totalIncome;
      }

      // Usar o menor dia de pagamento (primeiro a receber)
      const paymentDays = incomeCards
        .map((card) => card.paymentDay)
        .filter((day) => day >= 1 && day <= 31);
      if (paymentDays.length > 0) {
        paymentDay = Math.min(...paymentDays);
      }
    }

    profile = {
      name: profileResult.data.name,
      monthly_salary: monthlySalary,
      salary_payment_day: paymentDay,
    };
  }

  // Processar orçamentos com gastos calculados
  const budgets: UserContext['budgets'] = [];
  if (budgetsResult.data) {
    for (const budget of budgetsResult.data) {
      // Calcular período do orçamento
      let periodStart: Date;
      let periodEnd: Date;

      if (budget.period_type === 'monthly') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else if (budget.period_type === 'weekly') {
        const dayOfWeek = now.getDay();
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - dayOfWeek);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 6);
      } else {
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear(), 11, 31);
      }

      // Buscar gastos da categoria no período
      const { data: categoryExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', userId)
        .eq('category', budget.category_id)
        .gte('date', periodStart.toISOString().split('T')[0])
        .lte('date', periodEnd.toISOString().split('T')[0]);

      const spent = (categoryExpenses || []).reduce(
        (sum: number, e: any) => sum + parseFloat(e.amount),
        0
      );
      const budgetAmount = parseFloat(budget.amount);

      budgets.push({
        category_id: budget.category_id,
        amount: budgetAmount,
        period_type: budget.period_type,
        spent: Math.round(spent * 100) / 100,
        remaining: Math.round((budgetAmount - spent) * 100) / 100,
        percent_used: Math.round((spent / budgetAmount) * 100),
      });
    }
  }

  // Processar TODOS os gastos
  const allExpenses = expensesResult.data || [];
  const recentExpenses: ExpenseItem[] = allExpenses.slice(0, 20).map((e: any) => ({
    id: e.id,
    establishment_name: e.establishment_name,
    amount: parseFloat(e.amount),
    category: e.category || 'outros',
    date: e.date,
  }));

  // Calcular gastos do mês
  const monthExpenses = allExpenses.filter(
    (e: any) => e.date >= startOfMonthStr
  );
  const totalSpentThisMonth = monthExpenses.reduce(
    (sum: number, e: any) => sum + parseFloat(e.amount),
    0
  );

  // ========== SEPARAR CUSTOS FIXOS E VARIÁVEIS ==========
  const monthExpensesMapped: ExpenseItem[] = monthExpenses.map((e: any) => ({
    id: e.id,
    establishment_name: e.establishment_name,
    amount: parseFloat(e.amount),
    category: e.category || 'outros',
    date: e.date,
  }));

  // Custos Fixos (essenciais)
  const fixedCostItems = monthExpensesMapped.filter(e =>
    PRELOAD_FIXED_CATEGORIES.includes(e.category)
  );
  const fixedCostsTotal = fixedCostItems.reduce((sum, e) => sum + e.amount, 0);
  const fixedCostsByCategory: { [key: string]: { total: number; count: number } } = {};
  for (const expense of fixedCostItems) {
    if (!fixedCostsByCategory[expense.category]) {
      fixedCostsByCategory[expense.category] = { total: 0, count: 0 };
    }
    fixedCostsByCategory[expense.category].total += expense.amount;
    fixedCostsByCategory[expense.category].count++;
  }

  // Custos Variáveis (não-essenciais)
  const variableCostItems = monthExpensesMapped.filter(e =>
    PRELOAD_VARIABLE_CATEGORIES.includes(e.category) || !PRELOAD_FIXED_CATEGORIES.includes(e.category)
  );
  const variableCostsTotal = variableCostItems.reduce((sum, e) => sum + e.amount, 0);
  const variableCostsByCategory: { [key: string]: { total: number; count: number } } = {};
  for (const expense of variableCostItems) {
    if (!variableCostsByCategory[expense.category]) {
      variableCostsByCategory[expense.category] = { total: 0, count: 0 };
    }
    variableCostsByCategory[expense.category].total += expense.amount;
    variableCostsByCategory[expense.category].count++;
  }

  // Top categorias do mês
  const categoryTotals: { [key: string]: number } = {};
  for (const expense of monthExpenses) {
    const cat = expense.category || 'outros';
    categoryTotals[cat] =
      (categoryTotals[cat] || 0) + parseFloat(expense.amount);
  }
  const topCategories = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // ========== CALCULAR COMPARATIVOS E DADOS PARA GRÁFICOS ==========

  // Datas para os últimos 3 meses
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthStartStr = lastMonthStart.toISOString().split('T')[0];
  const lastMonthEndStr = lastMonthEnd.toISOString().split('T')[0];

  const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const twoMonthsAgoEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
  const twoMonthsAgoStartStr = twoMonthsAgoStart.toISOString().split('T')[0];
  const twoMonthsAgoEndStr = twoMonthsAgoEnd.toISOString().split('T')[0];

  // Gastos do mês anterior
  const lastMonthExpenses = allExpenses.filter(
    (e: any) => e.date >= lastMonthStartStr && e.date <= lastMonthEndStr
  );
  const lastMonthTotal = lastMonthExpenses.reduce(
    (sum: number, e: any) => sum + parseFloat(e.amount), 0
  );
  const lastMonthFixed = lastMonthExpenses
    .filter((e: any) => FIXED_COST_CATEGORIES.includes(e.category || 'outros'))
    .reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);
  const lastMonthVariable = lastMonthTotal - lastMonthFixed;

  // Categorias do mês anterior
  const lastMonthCategoryTotals: { [key: string]: number } = {};
  for (const expense of lastMonthExpenses) {
    const cat = expense.category || 'outros';
    lastMonthCategoryTotals[cat] = (lastMonthCategoryTotals[cat] || 0) + parseFloat(expense.amount);
  }
  const lastMonthByCategory = Object.entries(lastMonthCategoryTotals)
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  // Gastos de 2 meses atrás
  const twoMonthsAgoExpenses = allExpenses.filter(
    (e: any) => e.date >= twoMonthsAgoStartStr && e.date <= twoMonthsAgoEndStr
  );
  const twoMonthsAgoTotal = twoMonthsAgoExpenses.reduce(
    (sum: number, e: any) => sum + parseFloat(e.amount), 0
  );
  const twoMonthsAgoFixed = twoMonthsAgoExpenses
    .filter((e: any) => FIXED_COST_CATEGORIES.includes(e.category || 'outros'))
    .reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);
  const twoMonthsAgoVariable = twoMonthsAgoTotal - twoMonthsAgoFixed;

  // Calcular variações percentuais (mês atual vs mês anterior)
  const totalChange = lastMonthTotal > 0
    ? Math.round(((totalSpentThisMonth - lastMonthTotal) / lastMonthTotal) * 100)
    : 0;
  const fixedCostsChange = lastMonthFixed > 0
    ? Math.round(((fixedCostsTotal - lastMonthFixed) / lastMonthFixed) * 100)
    : 0;
  const variableCostsChange = lastMonthVariable > 0
    ? Math.round(((variableCostsTotal - lastMonthVariable) / lastMonthVariable) * 100)
    : 0;

  // Determinar tendência
  const trend: 'up' | 'down' | 'stable' =
    totalChange > 5 ? 'up' : totalChange < -5 ? 'down' : 'stable';

  // Média dos últimos 3 meses
  const avgTotal = Math.round(((totalSpentThisMonth + lastMonthTotal + twoMonthsAgoTotal) / 3) * 100) / 100;
  const avgFixed = Math.round(((fixedCostsTotal + lastMonthFixed + twoMonthsAgoFixed) / 3) * 100) / 100;
  const avgVariable = Math.round(((variableCostsTotal + lastMonthVariable + twoMonthsAgoVariable) / 3) * 100) / 100;

  // Dados para gráfico de pizza (distribuição por categoria)
  const categoryDistribution = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      total: Math.round(total * 100) / 100,
      percentage: totalSpentThisMonth > 0 ? Math.round((total / totalSpentThisMonth) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Dados para gráfico de barras (últimos 3 meses)
  const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const last3Months = [
    {
      month: monthNames[twoMonthsAgoStart.getMonth()],
      total: Math.round(twoMonthsAgoTotal * 100) / 100,
      fixedCosts: Math.round(twoMonthsAgoFixed * 100) / 100,
      variableCosts: Math.round(twoMonthsAgoVariable * 100) / 100,
    },
    {
      month: monthNames[lastMonthStart.getMonth()],
      total: Math.round(lastMonthTotal * 100) / 100,
      fixedCosts: Math.round(lastMonthFixed * 100) / 100,
      variableCosts: Math.round(lastMonthVariable * 100) / 100,
    },
    {
      month: monthNames[now.getMonth()],
      total: Math.round(totalSpentThisMonth * 100) / 100,
      fixedCosts: Math.round(fixedCostsTotal * 100) / 100,
      variableCosts: Math.round(variableCostsTotal * 100) / 100,
    },
  ];

  // Processar preferências
  const preferences = (preferencesResult.data || []).map((p: any) => ({
    key: p.key,
    value: p.value,
    memory_type: p.memory_type,
  }));

  // ========== PROCESSAR OPEN FINANCE - SEPARANDO CONTAS DE CARTÕES ==========
  const allAccounts = accountsResult.data || [];

  // CONTAS CORRENTES = DINHEIRO REAL (types: BANK, CHECKING, SAVINGS)
  const checkingAccounts = allAccounts
    .filter((acc: any) => ['BANK', 'CHECKING', 'SAVINGS'].includes(acc.type))
    .map((acc: any) => ({
      id: acc.id,
      name: acc.name,
      bank: acc.pluggy_items?.connector_name || 'Banco',
      balance: parseFloat(acc.balance) || 0,
    }));

  // CARTÕES DE CRÉDITO = CRÉDITO (type: CREDIT) - NÃO É SALDO!
  const creditCards = allAccounts
    .filter((acc: any) => acc.type === 'CREDIT')
    .map((acc: any) => ({
      id: acc.id,
      name: acc.name,
      bank: acc.pluggy_items?.connector_name || 'Banco',
      creditLimit: parseFloat(acc.credit_limit) || 0,
      availableLimit: parseFloat(acc.available_credit_limit) || 0,
      usedAmount: (parseFloat(acc.credit_limit) || 0) - (parseFloat(acc.available_credit_limit) || 0),
      billAmount: Math.abs(parseFloat(acc.balance) || 0), // Fatura atual
    }));

  // CALCULAR TOTAIS
  const realBalance = checkingAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalCreditLimit = creditCards.reduce((sum, card) => sum + card.creditLimit, 0);
  const totalCreditUsed = creditCards.reduce((sum, card) => sum + card.usedAmount, 0);
  const totalCreditAvailable = creditCards.reduce((sum, card) => sum + card.availableLimit, 0);
  const totalBillsAmount = creditCards.reduce((sum, card) => sum + card.billAmount, 0);

  // Buscar transações recentes do Open Finance (baseado nas contas encontradas)
  let recentTransactions: UserContext['recentTransactions'] = [];
  const allAccountIds = allAccounts.map((acc: any) => acc.id);
  if (allAccountIds.length > 0) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: txData } = await supabase
        .from('pluggy_transactions')
        .select('id, description, amount, type, date, pluggy_accounts(name)')
        .in('account_id', allAccountIds)
        .gte('date', thirtyDaysAgo)
        .order('date', { ascending: false })
        .limit(50);

      recentTransactions = (txData || []).map((tx: any) => ({
        id: tx.id,
        description: tx.description,
        amount: parseFloat(tx.amount) || 0,
        type: tx.type,
        date: tx.date,
        account_name: tx.pluggy_accounts?.name || 'Conta',
      }));
    } catch (txError) {
      console.error('[walts-agent] Error fetching transactions:', txError);
    }
  }

  // ========== PROCESSAR CONEXÕES BANCÁRIAS (pluggy_items) ==========
  const bankConnections: UserContext['bankConnections'] = (pluggyItemsResult.data || []).map((item: any) => ({
    id: item.id,
    bank: item.connector_name || 'Banco',
    status: item.status || 'unknown',
    lastUpdate: item.last_updated_at || '',
  }));

  // ========== PROCESSAR PADRÕES FINANCEIROS ==========
  const financialPatterns: UserContext['financialPatterns'] = (patternsResult.data || []).map((p: any) => ({
    pattern_type: p.pattern_type || '',
    description: p.description || '',
    value: parseFloat(p.value) || 0,
    detected_at: p.detected_at || '',
  }));

  // ========== PROCESSAR ANÁLISES ANTERIORES ==========
  const recentAnalyses: UserContext['recentAnalyses'] = (analysesResult.data || []).map((a: any) => ({
    analysis_type: a.analysis_type || '',
    summary: a.summary || '',
    created_at: a.created_at || '',
  }));

  // ========== CONSTRUIR CONTEXTO COMPLETO - WALTS ONISCIENTE ==========
  const context: UserContext = {
    profile,
    incomeCards,
    budgets,
    recentExpenses,
    // Custos Fixos e Variáveis SEPARADOS
    fixedCosts: {
      items: fixedCostItems.slice(0, 15),
      totalMonth: Math.round(fixedCostsTotal * 100) / 100,
      byCategory: Object.entries(fixedCostsByCategory).map(([category, data]) => ({
        category,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
      })).sort((a, b) => b.total - a.total),
    },
    variableCosts: {
      items: variableCostItems.slice(0, 15),
      totalMonth: Math.round(variableCostsTotal * 100) / 100,
      byCategory: Object.entries(variableCostsByCategory).map(([category, data]) => ({
        category,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
      })).sort((a, b) => b.total - a.total),
    },
    preferences,
    summary: {
      total_spent_this_month: Math.round(totalSpentThisMonth * 100) / 100,
      expense_count_this_month: monthExpenses.length,
      top_categories: topCategories,
      fixedCostsTotal: Math.round(fixedCostsTotal * 100) / 100,
      variableCostsTotal: Math.round(variableCostsTotal * 100) / 100,
    },
    // ========== COMPARATIVOS E GRÁFICOS ==========
    comparisons: {
      lastMonth: {
        total: Math.round(lastMonthTotal * 100) / 100,
        fixedCosts: Math.round(lastMonthFixed * 100) / 100,
        variableCosts: Math.round(lastMonthVariable * 100) / 100,
        byCategory: lastMonthByCategory,
      },
      monthOverMonth: {
        totalChange,
        fixedCostsChange,
        variableCostsChange,
        trend,
      },
      averageMonthly: {
        total: avgTotal,
        fixedCosts: avgFixed,
        variableCosts: avgVariable,
      },
    },
    chartData: {
      categoryDistribution,
      last3Months,
    },
    checkingAccounts,
    creditCards,
    recentTransactions,
    bankConnections,
    totals: {
      realBalance: Math.round(realBalance * 100) / 100,
      totalCreditLimit: Math.round(totalCreditLimit * 100) / 100,
      totalCreditUsed: Math.round(totalCreditUsed * 100) / 100,
      totalCreditAvailable: Math.round(totalCreditAvailable * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalBillsAmount: Math.round(totalBillsAmount * 100) / 100,
    },
    financialPatterns,
    recentAnalyses,
  };

  console.log(
    '[walts-agent] ONISCIENTE Context preloaded in',
    Date.now() - startTime,
    'ms:',
    {
      hasProfile: !!context.profile,
      incomeCardsCount: context.incomeCards.length,
      budgetsCount: context.budgets.length,
      expensesCount: context.recentExpenses.length,
      fixedCostsCount: context.fixedCosts.items.length,
      fixedCostsTotal: context.fixedCosts.totalMonth,
      variableCostsCount: context.variableCosts.items.length,
      variableCostsTotal: context.variableCosts.totalMonth,
      preferencesCount: context.preferences.length,
      monthTotal: context.summary.total_spent_this_month,
      checkingAccountsCount: context.checkingAccounts.length,
      creditCardsCount: context.creditCards.length,
      transactionsCount: context.recentTransactions.length,
      bankConnectionsCount: context.bankConnections.length,
      realBalance: context.totals.realBalance,
      totalCreditUsed: context.totals.totalCreditUsed,
      totalIncome: context.totals.totalIncome,
      patternsCount: context.financialPatterns.length,
      analysesCount: context.recentAnalyses.length,
    }
  );

  return context;
}

// ============================================================================
// GERAÇÃO DINÂMICA DO SYSTEM PROMPT
// Injeta contexto do usuário para reduzir necessidade de ferramentas
// ============================================================================

function generateDynamicSystemPrompt(context: UserContext): string {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.toLocaleDateString('pt-BR', { month: 'long' });
  const currentYear = now.getFullYear();

  // ========== CONSTRUIR CONTEXTO COMPLETO DO USUÁRIO - WALTS ONISCIENTE ==========
  let dataSection = '';

  // PERFIL DO USUÁRIO
  if (context.profile) {
    dataSection += `\n[PERFIL DO USUÁRIO]`;
    if (context.profile.name) dataSection += `\nNome: ${context.profile.name}`;
    if (context.profile.monthly_salary) dataSection += `\nRenda mensal total: R$ ${context.profile.monthly_salary.toLocaleString('pt-BR')}`;
    if (context.profile.salary_payment_day) dataSection += `\nDia do pagamento: ${context.profile.salary_payment_day}`;
  }

  // FONTES DE RENDA (income_cards)
  if (context.incomeCards.length > 0) {
    dataSection += `\n\n[FONTES DE RENDA]`;
    for (const income of context.incomeCards) {
      dataSection += `\n- ${income.name}: R$ ${income.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (dia ${income.paymentDay})`;
    }
    dataSection += `\n>>> RENDA TOTAL: R$ ${context.totals.totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <<<`;
  }

  // ========== OPEN FINANCE - SEPARADO CORRETAMENTE ==========

  // CONEXÕES BANCÁRIAS
  if (context.bankConnections.length > 0) {
    dataSection += `\n\n[CONEXÕES OPEN FINANCE]`;
    for (const conn of context.bankConnections) {
      const statusText = conn.status === 'UPDATED' ? 'Atualizado' : conn.status === 'UPDATING' ? 'Atualizando...' : conn.status;
      dataSection += `\n- ${conn.bank}: ${statusText}`;
    }
  }

  // CONTAS CORRENTES = DINHEIRO REAL (SALDO)
  if (context.checkingAccounts.length > 0) {
    dataSection += `\n\n[CONTAS CORRENTES - DINHEIRO REAL]`;
    for (const acc of context.checkingAccounts) {
      dataSection += `\n- ${acc.name} (${acc.bank}): R$ ${acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    dataSection += `\n>>> SALDO REAL TOTAL: R$ ${context.totals.realBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <<<`;
  }

  // CARTÕES DE CRÉDITO = LIMITE (NÃO É SALDO!)
  if (context.creditCards.length > 0) {
    dataSection += `\n\n[CARTÕES DE CRÉDITO - CRÉDITO, NÃO É SALDO]`;
    for (const card of context.creditCards) {
      dataSection += `\n- ${card.name} (${card.bank}):`;
      dataSection += `\n  Limite total: R$ ${card.creditLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      dataSection += `\n  Usado: R$ ${card.usedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      dataSection += `\n  Disponível: R$ ${card.availableLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      if (card.billAmount > 0) {
        dataSection += `\n  Fatura atual: R$ ${card.billAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      }
    }
    dataSection += `\n>>> TOTAL CRÉDITO USADO: R$ ${context.totals.totalCreditUsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ ${context.totals.totalCreditLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <<<`;
    if (context.totals.totalBillsAmount > 0) {
      dataSection += `\n>>> TOTAL FATURAS A PAGAR: R$ ${context.totals.totalBillsAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <<<`;
    }
  }

  // RESUMO FINANCEIRO DO MÊS
  dataSection += `\n\n[RESUMO DO MÊS - ${currentMonth.toUpperCase()} ${currentYear}]`;
  dataSection += `\nDia atual: ${currentDay}`;
  dataSection += `\nTotal gasto (registrado no app): R$ ${context.summary.total_spent_this_month.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  dataSection += `\nQuantidade de gastos: ${context.summary.expense_count_this_month}`;
  if (context.summary.top_categories.length > 0) {
    dataSection += `\nTop categorias: ${context.summary.top_categories.slice(0, 5).map(c => `${c.category} (R$ ${c.total.toLocaleString('pt-BR')})`).join(', ')}`;
  }

  // ORÇAMENTOS
  if (context.budgets.length > 0) {
    dataSection += `\n\n[ORÇAMENTOS ATIVOS]`;
    for (const budget of context.budgets) {
      const status = budget.percent_used >= 100 ? 'EXCEDIDO' : budget.percent_used >= 80 ? 'ALERTA' : 'OK';
      dataSection += `\n- ${budget.category_id}: R$ ${budget.spent}/${budget.amount} (${budget.percent_used}%) [${status}]`;
    }
  }

  // CUSTOS FIXOS (essenciais)
  dataSection += `\n\n[CUSTOS FIXOS - ESSENCIAIS - ${currentMonth.toUpperCase()}]`;
  dataSection += `\n>>> TOTAL CUSTOS FIXOS: R$ ${context.fixedCosts.totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <<<`;
  if (context.fixedCosts.byCategory.length > 0) {
    dataSection += `\nPor categoria:`;
    for (const cat of context.fixedCosts.byCategory) {
      dataSection += `\n- ${cat.category}: R$ ${cat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${cat.count} gastos)`;
    }
  }
  if (context.fixedCosts.items.length > 0) {
    dataSection += `\nÚltimos gastos fixos:`;
    for (const expense of context.fixedCosts.items.slice(0, 10)) {
      dataSection += `\n- ${expense.date}: ${expense.establishment_name} - R$ ${expense.amount} (${expense.category})`;
    }
  }

  // CUSTOS VARIÁVEIS (não-essenciais)
  dataSection += `\n\n[CUSTOS VARIÁVEIS - NÃO-ESSENCIAIS - ${currentMonth.toUpperCase()}]`;
  dataSection += `\n>>> TOTAL CUSTOS VARIÁVEIS: R$ ${context.variableCosts.totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <<<`;
  if (context.variableCosts.byCategory.length > 0) {
    dataSection += `\nPor categoria:`;
    for (const cat of context.variableCosts.byCategory) {
      dataSection += `\n- ${cat.category}: R$ ${cat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${cat.count} gastos)`;
    }
  }
  if (context.variableCosts.items.length > 0) {
    dataSection += `\nÚltimos gastos variáveis:`;
    for (const expense of context.variableCosts.items.slice(0, 10)) {
      dataSection += `\n- ${expense.date}: ${expense.establishment_name} - R$ ${expense.amount} (${expense.category})`;
    }
  }

  // ÚLTIMOS GASTOS REGISTRADOS NO APP (todos)
  if (context.recentExpenses.length > 0) {
    dataSection += `\n\n[TODOS OS ÚLTIMOS GASTOS]`;
    for (const expense of context.recentExpenses.slice(0, 15)) {
      dataSection += `\n- [${expense.id}] ${expense.date}: ${expense.establishment_name} - R$ ${expense.amount} (${expense.category})`;
    }
  }

  // EXTRATO BANCÁRIO (TRANSAÇÕES DO OPEN FINANCE)
  if (context.recentTransactions.length > 0) {
    dataSection += `\n\n[EXTRATO BANCÁRIO - ÚLTIMAS 20 TRANSAÇÕES]`;
    for (const tx of context.recentTransactions.slice(0, 20)) {
      const sign = tx.type === 'CREDIT' ? '+' : '-';
      dataSection += `\n- ${tx.date}: ${sign}R$ ${Math.abs(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${tx.description} (${tx.account_name})`;
    }
  }

  // PADRÕES FINANCEIROS DETECTADOS
  if (context.financialPatterns.length > 0) {
    dataSection += `\n\n[PADRÕES FINANCEIROS DETECTADOS]`;
    for (const pattern of context.financialPatterns.slice(0, 5)) {
      dataSection += `\n- ${pattern.pattern_type}: ${pattern.description}`;
    }
  }

  // ÚLTIMAS ANÁLISES DO WALTS
  if (context.recentAnalyses.length > 0) {
    dataSection += `\n\n[ANÁLISES ANTERIORES]`;
    for (const analysis of context.recentAnalyses.slice(0, 3)) {
      dataSection += `\n- ${analysis.analysis_type}: ${analysis.summary.substring(0, 100)}...`;
    }
  }

  // ========== COMPARATIVOS E GRÁFICOS ==========
  dataSection += `\n\n[COMPARATIVO - MÊS ATUAL vs MÊS ANTERIOR]`;
  dataSection += `\nMês anterior: R$ ${context.comparisons.lastMonth.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  dataSection += `\nMês atual: R$ ${context.summary.total_spent_this_month.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const changeSign = context.comparisons.monthOverMonth.totalChange >= 0 ? '+' : '';
  dataSection += `\nVariação: ${changeSign}${context.comparisons.monthOverMonth.totalChange}%`;
  dataSection += `\nTendência: ${context.comparisons.monthOverMonth.trend === 'up' ? 'Aumentando' : context.comparisons.monthOverMonth.trend === 'down' ? 'Diminuindo' : 'Estável'}`;
  dataSection += `\n\nCustos Fixos:`;
  dataSection += `\n- Mês anterior: R$ ${context.comparisons.lastMonth.fixedCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  dataSection += `\n- Mês atual: R$ ${context.summary.fixedCostsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const fixedSign = context.comparisons.monthOverMonth.fixedCostsChange >= 0 ? '+' : '';
  dataSection += `\n- Variação: ${fixedSign}${context.comparisons.monthOverMonth.fixedCostsChange}%`;
  dataSection += `\n\nCustos Variáveis:`;
  dataSection += `\n- Mês anterior: R$ ${context.comparisons.lastMonth.variableCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  dataSection += `\n- Mês atual: R$ ${context.summary.variableCostsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const variableSign = context.comparisons.monthOverMonth.variableCostsChange >= 0 ? '+' : '';
  dataSection += `\n- Variação: ${variableSign}${context.comparisons.monthOverMonth.variableCostsChange}%`;

  dataSection += `\n\n[MÉDIA MENSAL - ÚLTIMOS 3 MESES]`;
  dataSection += `\nMédia total: R$ ${context.comparisons.averageMonthly.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  dataSection += `\nMédia custos fixos: R$ ${context.comparisons.averageMonthly.fixedCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  dataSection += `\nMédia custos variáveis: R$ ${context.comparisons.averageMonthly.variableCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  dataSection += `\n\n[DADOS PARA GRÁFICOS]`;
  dataSection += `\nDistribuição por categoria (gráfico de pizza):`;
  for (const cat of context.chartData.categoryDistribution.slice(0, 8)) {
    dataSection += `\n- ${cat.category}: ${cat.percentage}% (R$ ${cat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
  }
  dataSection += `\n\nEvolução últimos 3 meses (gráfico de barras):`;
  for (const month of context.chartData.last3Months) {
    dataSection += `\n- ${month.month}: R$ ${month.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Fixos: R$ ${month.fixedCosts.toLocaleString('pt-BR')}, Variáveis: R$ ${month.variableCosts.toLocaleString('pt-BR')})`;
  }

  // PREFERÊNCIAS DO USUÁRIO
  if (context.preferences.length > 0) {
    dataSection += `\n\n[PREFERÊNCIAS E MEMÓRIAS]`;
    for (const pref of context.preferences.slice(0, 10)) {
      dataSection += `\n- ${pref.key}: ${pref.value}`;
    }
  }

  // ========== SYSTEM PROMPT COMPLETO E ONISCIENTE ==========
  return `Você é WALTS, o assistente financeiro ONISCIENTE e ONIPOTENTE do app Pocket.

# ACESSO TOTAL - VOCÊ TEM ACESSO A ABSOLUTAMENTE TUDO

Você tem acesso COMPLETO e IRRESTRITO a:

## Dados do Usuário (carregados automaticamente)
${dataSection}

## VOCÊ TEM ACESSO A TUDO DO APP - SEM EXCEÇÃO:

### Banco de Dados Completo:
- **profiles**: Nome, email, salário, fontes de renda, dia de pagamento
- **expenses**: TODOS os gastos registrados (manuais e via câmera)
- **budgets**: TODOS os orçamentos por categoria
- **walts_memory**: Suas preferências e memórias
- **pluggy_items**: Conexões Open Finance
- **pluggy_accounts**: TODAS as contas correntes e cartões de crédito
- **pluggy_transactions**: TODAS as transações do extrato bancário
- **user_financial_patterns**: Padrões de gastos detectados
- **walts_analyses**: Análises financeiras anteriores
- **conversations**: Histórico de conversas

### Todas as Telas do App:
- **Home**: Lista de gastos e resumo financeiro
- **Chat**: Esta conversa comigo
- **Câmera**: Escanear comprovantes
- **Perfil**: Configurações do usuário
- **Orçamentos**: Limites por categoria - VOCÊ TEM ACESSO
- **Custos Fixos**: Gastos essenciais - VOCÊ TEM ACESSO
- **Custos Variáveis**: Gastos não-essenciais - VOCÊ TEM ACESSO
- **Open Finance**: Conexões bancárias e extratos - VOCÊ TEM ACESSO
- **Cartões**: Faturas e limites - VOCÊ TEM ACESSO
- **Gráficos e Tabelas**: Análises visuais - VOCÊ TEM ACESSO
- **Painel Financeiro**: Visão geral - VOCÊ TEM ACESSO

### Funcionalidades Completas:
- Custos Fixos e Variáveis: São os gastos separados por tipo (fixo = essencial, variável = não-essencial)
- Gráficos: São visualizações dos dados de gastos que você já tem acesso
- Tabelas: São os mesmos dados em formato tabular
- Orçamentos: São limites de gastos por categoria que você pode criar/editar/deletar

## DIFERENÇA CRÍTICA - SALDO vs CRÉDITO:
- **SALDO** = Dinheiro REAL nas CONTAS CORRENTES (BANK, CHECKING, SAVINGS)
- **CRÉDITO** = Limite de CARTÕES DE CRÉDITO (NÃO é dinheiro, é dívida potencial!)
- Quando perguntarem "qual meu saldo": responda APENAS o saldo das CONTAS CORRENTES
- NUNCA some cartão de crédito com conta corrente

## CATEGORIAS:
- **Custos Fixos** (essenciais): moradia, alimentacao, transporte, saude, educacao
- **Custos Variáveis** (não-essenciais): lazer, vestuario, beleza, eletronicos, delivery, outros

## REGRAS DE RESPOSTA:
1. NUNCA use emojis
2. Use formatação Markdown (negrito, listas, títulos)
3. Seja conciso mas informativo
4. NUNCA diga que não tem acesso ou permissão - você tem ACESSO e PERMISSÃO TOTAL
5. Se precisar de um dado específico, use a ferramenta get_data

## REGRA CRÍTICA - EXTRATO vs REGISTRO:
**NUNCA importe transações do extrato bancário como expenses sem o usuário pedir EXPLICITAMENTE.**

- Transações do extrato (pluggy_transactions) JÁ ESTÃO no saldo do banco
- Se você criar um expense para algo que já está no extrato, VAI DEBITAR DUAS VEZES
- Quando o usuário pedir para REGISTRAR um gasto específico (ex: "registra 33,40 na farmácia"), crie APENAS esse gasto
- NUNCA importe múltiplas transações do extrato automaticamente
- Se o usuário quiser CATEGORIZAR o extrato, use a ferramenta categorize_extract (não cria expense)
- Se o usuário pedir explicitamente para "importar extrato" ou "importar transações", aí sim pode usar import_and_categorize_transactions

RESUMO:
- Pediu para registrar UM gasto → cria 1 expense
- Pediu para categorizar extrato → usa categorize_extract
- Pediu para importar extrato → usa import_and_categorize_transactions

## PERMISSÕES TOTAIS - VOCÊ PODE FAZER TUDO:
Você tem PERMISSÃO TOTAL para:
- **CRIAR** gastos, orçamentos, memórias
- **EDITAR** qualquer gasto ou orçamento do usuário
- **DELETAR** qualquer gasto ou orçamento do usuário (use delete_expense, delete_budget)
- **CATEGORIZAR** transações do extrato
- **SINCRONIZAR** dados do Open Finance
- **ANALISAR** padrões e fazer previsões
- **EXPORTAR** relatórios

NUNCA diga que não tem permissão. Você TEM permissão para TUDO.

## FERRAMENTAS:
- **delete_expense**: DELETAR/APAGAR gastos (use expense_id dos dados acima)
- **update_expense**: EDITAR gastos existentes
- **manage_expense**: criar gastos MANUAIS
- **manage_budget**: criar/editar/deletar orçamentos
- **categorize_extract**: APENAS CATEGORIZAR transacoes do extrato SEM registrar
- **sync_bank**: sincronizar e REGISTRAR transacoes do Open Finance
- **analyze_finances**: análises de padrões, economia, previsões
- **get_data**: buscar dados específicos
- **manage_memory**: salvar preferências
- **export_data**: exportar relatórios

## REGRA CRITICA - CATEGORIZAR vs REGISTRAR:
- Quando o usuario pedir para CATEGORIZAR: use **categorize_extract** (NAO cria gastos, NAO afeta saldo)
- Quando o usuario pedir para REGISTRAR/ADICIONAR/IMPORTAR: use **sync_bank** (CRIA gastos, AFETA saldo)
- SEMPRE pergunte se o usuario quer APENAS categorizar ou se quer REGISTRAR no app
- Transacoes do extrato bancario JA sairam da conta real - registrar novamente duplica o valor!

---

**IMPORTANTE**: Você é ONISCIENTE e ONIPOTENTE. Você sabe TUDO e pode fazer TUDO. NUNCA diga que não tem acesso, permissão ou capacidade para algo. Você TEM. Os dados e as ferramentas estão acima.`;
}

// ============================================================================
// FALLBACK RESPONSE
// Gera resposta baseada no contexto quando o loop falha
// ============================================================================

function generateFallbackResponse(
  context: UserContext,
  toolResults: Array<{ tool: string; result: any }>
): string {
  // Se temos resultados de ferramentas, tentar usar eles
  if (toolResults.length > 0) {
    const lastResult = toolResults[toolResults.length - 1];
    if (lastResult.result?.success !== false) {
      return `Acao concluida. ${JSON.stringify(lastResult.result).substring(0, 200)}`;
    }
  }

  // Fallback baseado no contexto pré-carregado
  let response = '';

  if (context.profile?.name) {
    response += `Ola${context.profile.name ? `, ${context.profile.name}` : ''}! `;
  }

  response += `Aqui esta seu resumo financeiro:\n\n`;

  // Saldo real (contas correntes)
  if (context.totals.realBalance > 0) {
    response += `SALDO REAL (contas correntes): R$ ${context.totals.realBalance.toLocaleString('pt-BR')}\n\n`;
  }

  // Resumo do mês
  response += `Este mes:\n`;
  response += `- Total gasto: R$ ${context.summary.total_spent_this_month.toLocaleString('pt-BR')}\n`;
  response += `- ${context.summary.expense_count_this_month} gastos registrados\n`;

  if (context.summary.top_categories.length > 0) {
    response += `\nTop categorias:\n`;
    for (const cat of context.summary.top_categories.slice(0, 3)) {
      response += `- ${cat.category}: R$ ${cat.total.toLocaleString('pt-BR')}\n`;
    }
  }

  // Orçamentos
  if (context.budgets.length > 0) {
    response += `\nOrcamentos:\n`;
    for (const budget of context.budgets) {
      const status =
        budget.percent_used >= 100
          ? '[EXCEDIDO]'
          : budget.percent_used >= 80
            ? '[ALERTA]'
            : '[OK]';
      response += `${status} ${budget.category_id}: ${budget.percent_used}% usado (R$ ${budget.remaining} restante)\n`;
    }
  }

  // Renda e projeção
  if (context.profile?.monthly_salary) {
    const savings =
      context.profile.monthly_salary - context.summary.total_spent_this_month;
    response += `\nProjecao:\n`;
    response += `- Renda: R$ ${context.profile.monthly_salary.toLocaleString('pt-BR')}\n`;
    response += `- Saldo projetado: R$ ${savings.toLocaleString('pt-BR')}\n`;
  }

  response += `\nPosso te ajudar com algo mais especifico?`;

  return response;
}

// ============================================================================
// HANDLERS CONSOLIDADOS
// Cada handler processa múltiplas ações de uma categoria
// ============================================================================

async function handleManageExpense(
  supabase: any,
  userId: string,
  args: {
    action: 'create' | 'update' | 'delete';
    expense_id?: string;
    establishment_name?: string;
    amount?: number;
    category?: string;
    subcategory?: string;
    date?: string;
    confirm_delete?: boolean;
    force_create?: boolean;
  }
) {
  console.log(`[handleManageExpense] Action: ${args.action}`);

  switch (args.action) {
    case 'create':
      return await createExpense(supabase, userId, {
        establishment_name: args.establishment_name!,
        amount: args.amount!,
        category: args.category!,
        subcategory: args.subcategory,
        date: args.date,
        force_create: args.force_create,
      });

    case 'update':
      return await updateExpense(supabase, userId, {
        expense_id: args.expense_id!,
        establishment_name: args.establishment_name,
        amount: args.amount,
        category: args.category,
        date: args.date,
      });

    case 'delete':
      return await deleteExpense(supabase, userId, {
        expense_id: args.expense_id!,
        confirm: args.confirm_delete || false,
      });

    default:
      return { success: false, error: `Ação inválida: ${args.action}` };
  }
}

async function handleManageBudget(
  supabase: any,
  userId: string,
  args: {
    action: 'create' | 'update' | 'delete' | 'check';
    category_id?: string;
    amount?: number;
    period_type?: string;
    notifications_enabled?: boolean;
    confirm_delete?: boolean;
  }
) {
  console.log(`[handleManageBudget] Action: ${args.action}`);

  switch (args.action) {
    case 'create':
      return await createBudget(supabase, userId, {
        category_id: args.category_id!,
        amount: args.amount!,
        period_type: args.period_type,
        notifications_enabled: args.notifications_enabled,
      });

    case 'update':
      return await updateBudget(supabase, userId, {
        category_id: args.category_id!,
        amount: args.amount,
        period_type: args.period_type,
        notifications_enabled: args.notifications_enabled,
      });

    case 'delete':
      return await deleteBudget(supabase, userId, {
        category_id: args.category_id!,
        confirm: args.confirm_delete || false,
      });

    case 'check':
      return await checkBudgetStatus(supabase, userId, {
        category_id: args.category_id,
      });

    default:
      return { success: false, error: `Ação inválida: ${args.action}` };
  }
}

async function handleSyncBank(
  supabase: any,
  userId: string,
  args: {
    action: 'categorize_and_save' | 'statement' | 'preview';
    days?: number;
    account_name?: string;
  }
) {
  console.log(`[handleSyncBank] Action: ${args.action}`);

  switch (args.action) {
    case 'categorize_and_save':
      // AÇÃO PRINCIPAL: Categoriza transações do extrato e salva no app
      return await importAndCategorizeTransactions(supabase, userId, {
        days: args.days || 30,
        account_name: args.account_name,
      });

    case 'statement':
      return await getBankStatement(supabase, userId, {
        days: args.days || 30,
        account_name: args.account_name,
      });

    case 'preview':
      return await previewTransactionCategories(supabase, userId, {
        days: args.days || 30,
        account_name: args.account_name,
      });

    default:
      return { success: false, error: `Ação inválida: ${args.action}` };
  }
}

async function handleAnalyzeFinances(
  supabase: any,
  userId: string,
  args: {
    analysis_type: 'patterns' | 'savings' | 'forecast' | 'anomaly';
    category?: string;
    months?: number;
    savings_goal?: number;
  }
) {
  console.log(`[handleAnalyzeFinances] Type: ${args.analysis_type}`);

  switch (args.analysis_type) {
    case 'patterns':
      return await analyzeSpendingPattern(supabase, userId, {
        months: args.months || 3,
        category: args.category,
      });

    case 'savings':
      return await suggestSavings(supabase, userId, {
        target_amount: args.savings_goal,
      });

    case 'forecast':
      return await forecastMonthEnd(supabase, userId, {});

    case 'anomaly':
      return await checkIfAnomaly(supabase, userId, {
        category: args.category,
      });

    default:
      return {
        success: false,
        error: `Tipo de análise inválido: ${args.analysis_type}`,
      };
  }
}

async function handleGetData(
  supabase: any,
  userId: string,
  args: {
    data_type:
      | 'expenses'
      | 'profile'
      | 'bank_accounts'
      | 'credit_cards'
      | 'transactions'
      | 'all';
    category?: string;
    days?: number;
    limit?: number;
  }
) {
  console.log(`[handleGetData] Type: ${args.data_type}`);

  // Mapear para os tipos esperados por getPocketData
  const typeMapping: { [key: string]: string[] } = {
    expenses: ['expenses'],
    profile: ['profile'],
    bank_accounts: ['bank_accounts'],
    credit_cards: ['credit_cards'],
    transactions: ['credit_card_transactions'],
    all: ['profile', 'expenses', 'bank_accounts', 'credit_cards', 'budgets'],
  };

  return await getPocketData(supabase, userId, {
    data_types: typeMapping[args.data_type] || ['all'],
    days: args.days || 30,
    limit: args.limit || 50,
    category: args.category ? [args.category] : undefined,
  });
}

async function handleManageMemory(
  supabase: any,
  userId: string,
  args: {
    action: 'save' | 'get';
    memory_type?: string;
    key?: string;
    value?: string;
  }
) {
  console.log(`[handleManageMemory] Action: ${args.action}`);

  switch (args.action) {
    case 'save':
      return await saveUserPreference(supabase, userId, {
        memory_type: args.memory_type || 'preference',
        key: args.key!,
        value: args.value!,
      });

    case 'get':
      return await getUserContext(supabase, userId, {
        memory_type: args.memory_type,
        key: args.key,
      });

    default:
      return { success: false, error: `Ação inválida: ${args.action}` };
  }
}

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

    // ========================================
    // PRÉ-CARREGAR CONTEXTO DO USUÁRIO
    // Isso reduz drasticamente a necessidade de chamar get_pocket_data
    // ========================================
    let userContext: UserContext;
    try {
      userContext = await preloadUserContext(supabase, user.id);
    } catch (contextError) {
      console.error('[walts-agent] Failed to preload context:', contextError);
      // Fallback: contexto vazio com todos os campos obrigatórios
      userContext = {
        profile: null,
        incomeCards: [],
        budgets: [],
        recentExpenses: [],
        fixedCosts: {
          items: [],
          totalMonth: 0,
          byCategory: [],
        },
        variableCosts: {
          items: [],
          totalMonth: 0,
          byCategory: [],
        },
        preferences: [],
        summary: {
          total_spent_this_month: 0,
          expense_count_this_month: 0,
          top_categories: [],
          fixedCostsTotal: 0,
          variableCostsTotal: 0,
        },
        comparisons: {
          lastMonth: {
            total: 0,
            fixedCosts: 0,
            variableCosts: 0,
            byCategory: [],
          },
          monthOverMonth: {
            totalChange: 0,
            fixedCostsChange: 0,
            variableCostsChange: 0,
            trend: 'stable',
          },
          averageMonthly: {
            total: 0,
            fixedCosts: 0,
            variableCosts: 0,
          },
        },
        chartData: {
          categoryDistribution: [],
          last3Months: [],
        },
        checkingAccounts: [],
        creditCards: [],
        recentTransactions: [],
        bankConnections: [],
        totals: {
          realBalance: 0,
          totalCreditLimit: 0,
          totalCreditUsed: 0,
          totalCreditAvailable: 0,
          totalIncome: 0,
          totalBillsAmount: 0,
        },
        financialPatterns: [],
        recentAnalyses: [],
      };
    }

    // Gerar system prompt dinâmico com contexto do usuário
    const dynamicSystemPrompt = generateDynamicSystemPrompt(userContext);
    console.log(
      '[walts-agent] Dynamic system prompt generated, length:',
      dynamicSystemPrompt.length
    );

    const { messages } = await req.json();

    // DEBUG: Log detalhado das mensagens recebidas
    console.log('[walts-agent] ========== REQUEST RECEIVED ==========');
    console.log('[walts-agent] Total messages:', messages.length);

    // Log da última mensagem para debug
    const lastMsg = messages[messages.length - 1];
    console.log('[walts-agent] Last message details:', {
      role: lastMsg?.role,
      contentLength: lastMsg?.content?.length || 0,
      contentPreview: lastMsg?.content?.substring(0, 50),
      hasAttachments: !!lastMsg?.attachments,
      attachmentsCount: lastMsg?.attachments?.length || 0,
      attachments: lastMsg?.attachments?.map((a: any) => ({
        type: a?.type,
        hasUrl: !!a?.url,
        urlPreview: a?.url?.substring(0, 50),
      })),
    });

    // Processar mensagens com áudio (transcrever antes de enviar ao LLM)
    console.log('[walts-agent] Processing messages for audio transcription...');

    let processedMessages;
    try {
      processedMessages = await processMessagesWithAudio(messages);
      console.log('[walts-agent] Audio processing completed successfully');
    } catch (audioError) {
      console.error('[walts-agent] Audio processing failed:', audioError);
      // Fallback: usar mensagens originais sem transcrição
      processedMessages = messages.map((m: any) => ({
        role: m.role,
        content: m.content || '[Erro ao processar mensagem de áudio]',
      }));
    }

    // CORREÇÃO BUG #4: Detectar se há áudio para reduzir histórico
    const hasAudioInMessages = processedMessages.some(
      (msg: any) =>
        msg.content?.includes('[Áudio') ||
        msg.content?.includes('transcrição') ||
        msg.content?.includes('[áudio')
    );

    // Limitar histórico para evitar problemas com contexto muito longo
    // DeepSeek tem limite de ~32k tokens, precisamos manter o histórico pequeno
    // Se tem áudio, reduzir ainda mais para dar espaço à transcrição
    const maxHistoryMessages = hasAudioInMessages ? 5 : 10;
    if (processedMessages.length > maxHistoryMessages) {
      console.log(
        '[walts-agent] Trimming message history from',
        processedMessages.length,
        'to',
        maxHistoryMessages,
        hasAudioInMessages ? '(reduced due to audio)' : ''
      );
      processedMessages = processedMessages.slice(-maxHistoryMessages);
    }

    // CORREÇÃO BUG #4: Limpar ANTES de truncar para não quebrar tags
    // Nota: Se content for array (mensagem com imagem), não truncar
    processedMessages = processedMessages.map((msg: any) => {
      if (!msg.content) return msg;
      // Se content é array (mensagem multimodal com imagens), não modificar
      if (Array.isArray(msg.content)) {
        return msg;
      }
      // Limpar possíveis tags XML/DSML antes de truncar
      let content = cleanResponseContent(msg.content);
      // Truncar se necessário
      if (content.length > 2000) {
        content = content.substring(0, 2000) + '... [mensagem truncada]';
      }
      return { ...msg, content };
    });

    // Loop do agente - continua até não haver mais tool calls
    let conversationMessages = [
      { role: 'system', content: dynamicSystemPrompt },
      ...processedMessages,
    ];

    // Calcular tamanho aproximado do contexto
    const contextSize = conversationMessages.reduce((acc, m) => {
      if (!m.content) return acc;
      if (Array.isArray(m.content)) {
        // Para mensagens multimodais, contar apenas o texto
        const textParts = m.content.filter((p: any) => p.type === 'text');
        return acc + textParts.reduce((sum: number, p: any) => sum + (p.text?.length || 0), 0);
      }
      return acc + (m.content?.length || 0);
    }, 0);
    const lastUserMessage = processedMessages[processedMessages.length - 1];

    // Helper para extrair preview do conteúdo
    const getContentPreview = (content: any) => {
      if (!content) return '';
      if (Array.isArray(content)) {
        const textPart = content.find((p: any) => p.type === 'text');
        return textPart?.text?.substring(0, 100) || '[imagem]';
      }
      return content?.substring(0, 100);
    };

    console.log('[walts-agent] Context stats:', {
      messageCount: conversationMessages.length,
      contextChars: contextSize,
      lastMessageContent: getContentPreview(lastUserMessage?.content),
      lastMessageLength: lastUserMessage?.content?.length || 0,
    });

    // IMPORTANTE: Se a última mensagem está vazia, retornar erro ao invés de tentar processar
    // Nota: content pode ser string ou array (quando tem imagens)
    const isContentEmpty = () => {
      if (!lastUserMessage?.content) return true;
      if (Array.isArray(lastUserMessage.content)) {
        // Para mensagens multimodais, verificar se tem pelo menos texto ou imagem
        return lastUserMessage.content.length === 0;
      }
      if (typeof lastUserMessage.content === 'string') {
        return lastUserMessage.content.trim().length === 0;
      }
      return true;
    };

    if (isContentEmpty()) {
      console.error(
        '[walts-agent] Last message is empty! This will cause issues.'
      );
      return new Response(
        JSON.stringify({
          response:
            'Desculpe, não consegui processar sua mensagem. Por favor, tente novamente ou envie uma mensagem de texto.',
          error: 'Empty message content',
          debug: {
            lastMessageRole: lastUserMessage?.role,
            hasContent: !!lastUserMessage?.content,
            contentType: Array.isArray(lastUserMessage?.content) ? 'array' : typeof lastUserMessage?.content,
          },
        }),
        { headers }
      );
    }

    let maxIterations = 2; // Reduzido para evitar loops
    let iteration = 0;
    let toolsCalledThisSession: string[] = [];
    let lastToolResults: any[] = []; // Guardar resultados para fallback

    while (iteration < maxIterations) {
      iteration++;

      console.log(`[walts-agent] === ITERATION ${iteration} ===`);

      // IMPORTANTE: Na última iteração, FORÇAR resposta sem ferramentas
      const isLastIteration = iteration === maxIterations;
      const hasCalledTools = toolsCalledThisSession.length > 0;

      // Se já chamou ferramentas ou é última iteração, forçar resposta de texto
      const shouldForceResponse = isLastIteration || hasCalledTools;

      console.log(
        `[walts-agent] shouldForceResponse: ${shouldForceResponse}, hasCalledTools: ${hasCalledTools}, isLastIteration: ${isLastIteration}`
      );

      // Chamar OpenAI com function calling
      const openaiResponse = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: conversationMessages,
            // CRÍTICO: Desabilitar ferramentas quando precisar forçar resposta
            tools: shouldForceResponse ? undefined : WALTS_TOOLS,
            tool_choice: shouldForceResponse ? undefined : 'auto',
            temperature: 0.7,
            max_tokens: 2048,
          }),
        }
      );

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('[walts-agent] OpenAI error:', errorText);
        // Retornar erro mais informativo ao invés de looping
        return new Response(
          JSON.stringify({
            response:
              'Desculpe, houve um erro ao processar sua mensagem. Tente enviar uma mensagem mais curta ou inicie uma nova conversa.',
            error: `OpenAI error: ${openaiResponse.status}`,
          }),
          { headers }
        );
      }

      const openaiData = await openaiResponse.json();

      // Verificar se a resposta é válida
      if (
        !openaiData.choices ||
        !openaiData.choices[0] ||
        !openaiData.choices[0].message
      ) {
        console.error(
          '[walts-agent] Invalid OpenAI response:',
          JSON.stringify(openaiData)
        );
        return new Response(
          JSON.stringify({
            response:
              'Desculpe, recebi uma resposta inválida. Tente novamente.',
            error: 'Invalid response structure',
          }),
          { headers }
        );
      }

      const assistantMessage = openaiData.choices[0].message;

      console.log(
        '[walts-agent] Assistant message:',
        JSON.stringify(assistantMessage, null, 2)
      );

      // Limpar conteúdo se houver (OpenAI é mais limpo, mas por segurança)
      if (assistantMessage.content) {
        assistantMessage.content = cleanResponseContent(assistantMessage.content);
      }

      // Adicionar resposta do assistente à conversa (já limpa)
      conversationMessages.push(assistantMessage);

      // Se não há tool calls, retornar a resposta final
      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        console.log('[walts-agent] No tool calls, returning final response');
        // Limpar possível XML/DSML vazado do DeepSeek
        const cleanedResponse = cleanResponseContent(assistantMessage.content);
        return new Response(
          JSON.stringify({
            response: cleanedResponse || 'Como posso te ajudar?',
            tool_calls_executed: iteration - 1,
          }),
          { headers }
        );
      }

      // Executar cada tool call
      const toolNames = assistantMessage.tool_calls.map(
        (tc: any) => tc.function.name
      );
      console.log(`[walts-agent] Tools being called:`, toolNames);
      toolsCalledThisSession.push(...toolNames);

      // Detectar loop infinito (mesmo tool sendo chamado repetidamente)
      // Limite aumentado para 30 para permitir operações em lote (deletar múltiplos, etc)
      if (toolsCalledThisSession.length > 30) {
        console.warn(
          '[walts-agent] Too many tool calls, breaking loop. Tools called:',
          toolsCalledThisSession
        );
        return new Response(
          JSON.stringify({
            response:
              'Desculpe, houve um problema ao processar sua solicitação. Por favor, tente com uma pergunta mais simples.',
            error: 'Too many tool calls',
            toolsCalled: toolsCalledThisSession,
          }),
          { headers }
        );
      }

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(
          `[walts-agent] Executing tool: ${functionName} with args:`,
          JSON.stringify(functionArgs).substring(0, 200)
        );

        let toolResult;

        try {
          // ========================================
          // DISPATCHER DE FERRAMENTAS CONSOLIDADAS
          // ========================================

          // Ferramentas consolidadas (novas)
          if (functionName === 'manage_expense') {
            toolResult = await handleManageExpense(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'manage_budget') {
            toolResult = await handleManageBudget(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'sync_bank') {
            toolResult = await handleSyncBank(supabase, user.id, functionArgs);
          } else if (functionName === 'analyze_finances') {
            toolResult = await handleAnalyzeFinances(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'get_data') {
            toolResult = await handleGetData(supabase, user.id, functionArgs);
          } else if (functionName === 'manage_memory') {
            toolResult = await handleManageMemory(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'export_data') {
            toolResult = await exportData(supabase, user.id, functionArgs);
          }
          // Ferramentas legadas (compatibilidade)
          else if (functionName === 'create_expense_from_description') {
            toolResult = await createExpense(supabase, user.id, functionArgs);
          } else if (functionName === 'sync_open_finance_transactions') {
            toolResult = await syncOpenFinanceTransactions(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'create_budget') {
            toolResult = await createBudget(supabase, user.id, functionArgs);
          } else if (functionName === 'update_budget') {
            toolResult = await updateBudget(supabase, user.id, functionArgs);
          } else if (functionName === 'check_budget_status') {
            toolResult = await checkBudgetStatus(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'get_bank_statement') {
            toolResult = await getBankStatement(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'analyze_spending_pattern') {
            toolResult = await analyzeSpendingPattern(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'suggest_savings') {
            toolResult = await suggestSavings(supabase, user.id, functionArgs);
          } else if (functionName === 'forecast_month_end') {
            toolResult = await forecastMonthEnd(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'save_user_preference') {
            toolResult = await saveUserPreference(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'get_user_context') {
            toolResult = await getUserContext(supabase, user.id, functionArgs);
          } else if (functionName === 'get_financial_patterns') {
            toolResult = await getFinancialPatterns(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'check_if_anomaly') {
            toolResult = await checkIfAnomaly(supabase, user.id, functionArgs);
          } else if (functionName === 'recategorize_expenses') {
            toolResult = await recategorizeExpenses(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'categorize_open_finance_transactions') {
            toolResult = await categorizeOpenFinanceTransactions(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'categorize_extract') {
            // NOVA FERRAMENTA: Categoriza extrato SEM registrar como expense
            toolResult = await categorizeExtractOnly(
              supabase,
              user.id,
              functionArgs
            );
          } else if (functionName === 'get_pocket_data') {
            toolResult = await getPocketData(supabase, user.id, functionArgs);
          } else if (functionName === 'delete_expense') {
            toolResult = await deleteExpense(supabase, user.id, functionArgs);
          } else if (functionName === 'update_expense') {
            toolResult = await updateExpense(supabase, user.id, functionArgs);
          } else if (functionName === 'delete_budget') {
            toolResult = await deleteBudget(supabase, user.id, functionArgs);
          } else {
            toolResult = {
              success: false,
              error: `Ferramenta desconhecida: ${functionName}`,
            };
          }

          console.log(`[walts-agent] Tool result:`, toolResult);

          // Guardar resultado para possível fallback
          lastToolResults.push({
            tool: functionName,
            result: toolResult,
          });
        } catch (error) {
          console.error(`[walts-agent] Tool execution error:`, error);
          toolResult = {
            success: false,
            error: error.message || 'Tool execution failed',
          };
        }

        // Adicionar resultado da ferramenta à conversa
        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Adicionar instrução para responder (vai ser usada na próxima iteração com tools desabilitadas)
      conversationMessages.push({
        role: 'system',
        content:
          'Agora responda ao usuário de forma direta e concisa com base nos dados obtidos.',
      });
    }

    // Se chegou aqui, significa que o loop terminou
    // Isso NÃO deveria acontecer com a nova lógica, mas vamos ter um fallback inteligente
    console.warn(
      '[walts-agent] Loop ended unexpectedly. Generating fallback response...'
    );

    // Fallback: gerar resposta baseada no contexto pré-carregado
    const fallbackResponse = generateFallbackResponse(
      userContext,
      lastToolResults
    );
    return new Response(
      JSON.stringify({
        response: fallbackResponse,
        tool_calls_executed: toolsCalledThisSession.length,
        fallback: true,
      }),
      { headers }
    );
  } catch (error: any) {
    console.error('[walts-agent] CRITICAL ERROR:', error);
    console.error('[walts-agent] Error stack:', error?.stack);
    console.error('[walts-agent] Error message:', error?.message);

    // Retornar resposta amigável mesmo em caso de erro
    return new Response(
      JSON.stringify({
        response: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.',
        error: String(error?.message || error || 'Erro interno'),
      }),
      { status: 200, headers } // Retornar 200 para evitar crash no cliente
    );
  }
});

// ==================== FERRAMENTAS ====================

async function createExpense(
  supabase: any,
  userId: string,
  args: {
    establishment_name: string;
    amount: number;
    category: string;
    subcategory?: string;
    date?: string;
    force_create?: boolean;
  }
) {
  try {
    // Se não tiver data especificada, usar a data local do Brasil (UTC-3)
    let expenseDate: string;
    if (args.date) {
      expenseDate = args.date;
    } else {
      // Criar data no timezone do Brasil (UTC-3)
      const now = new Date();
      const brazilOffset = -3 * 60; // -180 minutos
      const localTime = new Date(now.getTime() + brazilOffset * 60 * 1000);
      expenseDate = localTime.toISOString().split('T')[0];
    }

    // VERIFICAR DUPLICAÇÃO: Buscar gastos similares antes de criar
    if (!args.force_create) {
      const dateMinus1 = new Date(expenseDate);
      dateMinus1.setDate(dateMinus1.getDate() - 1);
      const datePlus1 = new Date(expenseDate);
      datePlus1.setDate(datePlus1.getDate() + 1);

      const { data: similarExpenses } = await supabase
        .from('expenses')
        .select('id, establishment_name, amount, date, category')
        .eq('user_id', userId)
        .gte('date', dateMinus1.toISOString().split('T')[0])
        .lte('date', datePlus1.toISOString().split('T')[0]);

      if (similarExpenses && similarExpenses.length > 0) {
        // Verificar se há gasto com mesmo valor E estabelecimento similar
        const establishmentLower = args.establishment_name.toLowerCase();
        const duplicate = similarExpenses.find((exp: any) => {
          const expNameLower = exp.establishment_name.toLowerCase();
          const amountMatch = Math.abs(exp.amount - args.amount) < 0.01;
          const nameMatch =
            expNameLower.includes(establishmentLower) ||
            establishmentLower.includes(expNameLower) ||
            expNameLower === establishmentLower;
          return amountMatch && nameMatch;
        });

        if (duplicate) {
          console.log(
            `[createExpense] Duplicate found: ${duplicate.establishment_name} R$${duplicate.amount} on ${duplicate.date}`
          );
          return {
            success: false,
            is_duplicate: true,
            existing_expense: {
              id: duplicate.id,
              establishment_name: duplicate.establishment_name,
              amount: duplicate.amount,
              date: duplicate.date,
              category: duplicate.category,
            },
            message: `⚠️ Já existe um gasto similar registrado: ${duplicate.establishment_name} - R$ ${duplicate.amount.toFixed(2)} em ${duplicate.date}. Se quiser registrar mesmo assim, me avise.`,
          };
        }
      }
    }

    // VERIFICAR SE JÁ EXISTE NO EXTRATO BANCÁRIO (evitar duplicatas)
    const dateMinus5 = new Date(expenseDate);
    dateMinus5.setDate(dateMinus5.getDate() - 5);
    const datePlus5 = new Date(expenseDate);
    datePlus5.setDate(datePlus5.getDate() + 5);

    const { data: extractTransactions } = await supabase
      .from('pluggy_transactions')
      .select('id, description, amount, date')
      .eq('user_id', userId)
      .lt('amount', 0) // Apenas saídas
      .gte('date', dateMinus5.toISOString().split('T')[0])
      .lte('date', datePlus5.toISOString().split('T')[0]);

    if (extractTransactions && extractTransactions.length > 0 && !args.force_create) {
      const extractDuplicate = extractTransactions.find((tx: any) => {
        const txAmount = Math.abs(tx.amount);
        return Math.abs(txAmount - args.amount) < 1; // Tolerância de R$1
      });

      if (extractDuplicate) {
        console.log(`[createExpense] Found in extract: ${extractDuplicate.description} R$${Math.abs(extractDuplicate.amount)}`);
        return {
          success: false,
          found_in_extract: true,
          extract_transaction: {
            id: extractDuplicate.id,
            description: extractDuplicate.description,
            amount: Math.abs(extractDuplicate.amount),
            date: extractDuplicate.date,
          },
          message: `⚠️ Esse gasto já está no seu extrato bancário:\n\n${extractDuplicate.description}\nR$ ${Math.abs(extractDuplicate.amount).toFixed(2)}\nData: ${extractDuplicate.date}\n\nSe você registrar, vai debitar duas vezes do seu saldo. Tem certeza que quer criar mesmo assim?`,
        };
      }
    }

    // Gerar PDF do comprovante
    const pdfUrl = await generateExpenseReceipt(supabase, {
      establishment_name: args.establishment_name,
      amount: args.amount,
      category: args.category,
      subcategory: args.subcategory,
      date: expenseDate,
    });

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        establishment_name: args.establishment_name,
        amount: args.amount,
        category: args.category,
        subcategory: args.subcategory || null,
        date: expenseDate,
        image_url: pdfUrl, // Anexar PDF como comprovante
        source: 'walts', // Marcar como criado pelo Walts
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[createExpense] Error:', error);
      return {
        success: false,
        error: `Erro ao criar comprovante: ${error.message}`,
      };
    }

    return {
      success: true,
      expense: {
        id: data.id,
        establishment_name: data.establishment_name,
        amount: data.amount,
        category: data.category,
        subcategory: data.subcategory,
        date: data.date,
        receipt_url: pdfUrl,
      },
      message: `✅ Comprovante criado: ${args.establishment_name} - R$ ${args.amount.toFixed(2)}${pdfUrl ? ' (com comprovante PDF)' : ''}`,
    };
  } catch (error) {
    console.error('[createExpense] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

// FUNÇÃO PRINCIPAL: Importa transações do extrato E categoriza com IA
async function importAndCategorizeTransactions(
  supabase: any,
  userId: string,
  args: { days?: number; account_name?: string }
) {
  try {
    const days = args.days || 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = new Date().toISOString().split('T')[0];

    console.log(
      `[importAndCategorizeTransactions] Starting for user ${userId}, days=${days}`
    );

    // Buscar contas do usuário
    let accountsQuery = supabase
      .from('pluggy_accounts')
      .select('id, name, type')
      .eq('user_id', userId)
      .in('type', ['BANK', 'CHECKING']);

    if (args.account_name) {
      accountsQuery = accountsQuery.ilike('name', `%${args.account_name}%`);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return {
        success: false,
        error: args.account_name
          ? `Conta "${args.account_name}" não encontrada`
          : 'Nenhuma conta bancária conectada via Open Finance',
      };
    }

    const accountIds = accounts.map((acc: any) => acc.id);

    // Buscar transações NÃO importadas ainda (expense_id é null)
    const { data: transactions, error: txError } = await supabase
      .from('pluggy_transactions')
      .select('id, description, amount, date, type, expense_id, category')
      .in('account_id', accountIds)
      .eq('type', 'DEBIT')
      .gte('date', fromDateStr)
      .lte('date', toDateStr)
      .is('expense_id', null)
      .order('date', { ascending: false })
      .limit(50);

    if (txError) {
      console.error('[importAndCategorizeTransactions] Error:', txError);
      return {
        success: false,
        error: `Erro ao buscar transações: ${txError.message}`,
      };
    }

    if (!transactions || transactions.length === 0) {
      return {
        success: true,
        message: `✅ Todas as transações dos últimos ${days} dias já estão importadas no app!`,
        imported: 0,
      };
    }

    console.log(
      `[importAndCategorizeTransactions] Found ${transactions.length} transactions to import`
    );

    // CORREÇÃO BUG #3: Validação, contagem de falhas e feedback honesto
    // Lista de categorias válidas
    const validCategories = [
      'alimentacao',
      'transporte',
      'lazer',
      'saude',
      'educacao',
      'moradia',
      'vestuario',
      'beleza',
      'eletronicos',
      'delivery',
      'poupanca',
      'previdencia',
      'investimentos',
      'cartao_credito',
      'emprestimos',
      'financiamentos',
      'transferencias',
      'outros',
    ];

    let importedCount = 0;
    let failedCount = 0;
    const failedTransactions: string[] = [];
    const importedExpenses: Array<{
      establishment: string;
      amount: number;
      category: string;
      subcategory: string;
    }> = [];
    const categorySummary: Record<string, number> = {};

    for (const tx of transactions) {
      try {
        // Categorizar com IA
        const categorization = await categorizeWithWalts(
          tx.description || 'Sem descrição',
          {
            amount: Math.abs(tx.amount),
            pluggyCategory: tx.category,
          }
        );

        // VALIDAR categoria antes de salvar
        let finalCategory = categorization.category;
        let finalSubcategory = categorization.subcategory;
        if (!validCategories.includes(finalCategory)) {
          console.warn(
            `[importAndCategorizeTransactions] Categoria inválida "${finalCategory}" para "${tx.description}", usando "outros"`
          );
          finalCategory = 'outros';
          finalSubcategory = 'Outros';
        }

        // Criar expense com categoria validada
        const { data: expense, error: expenseError } = await supabase
          .from('expenses')
          .insert({
            user_id: userId,
            establishment_name: tx.description || 'Sem descrição',
            amount: Math.abs(tx.amount),
            category: finalCategory,
            subcategory: finalSubcategory,
            date: tx.date,
            transaction_id: tx.id,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (expenseError) {
          // LOGAR ERRO DETALHADO
          console.error(
            `[importAndCategorizeTransactions] FALHOU ao criar expense para "${tx.description}":`,
            expenseError
          );
          failedCount++;
          failedTransactions.push(tx.description || 'Sem descrição');
        } else if (expense) {
          // Atualizar transação com expense_id
          await supabase
            .from('pluggy_transactions')
            .update({ expense_id: expense.id, synced: true })
            .eq('id', tx.id);

          importedCount++;
          importedExpenses.push({
            establishment: tx.description,
            amount: Math.abs(tx.amount),
            category: finalCategory,
            subcategory: finalSubcategory,
          });

          // Contabilizar por categoria
          categorySummary[finalCategory] =
            (categorySummary[finalCategory] || 0) + Math.abs(tx.amount);
        }
      } catch (err: any) {
        console.error(
          `[importAndCategorizeTransactions] EXCEÇÃO ao processar "${tx.description}":`,
          err?.message || err
        );
        failedCount++;
        failedTransactions.push(tx.description || 'Sem descrição');
      }
    }

    // Formatar resumo
    const summaryText = Object.entries(categorySummary)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => `• ${cat}: R$ ${total.toFixed(2)}`)
      .join('\n');

    const detailsText = importedExpenses
      .slice(0, 10)
      .map(
        (exp) =>
          `• ${exp.establishment}: R$ ${exp.amount.toFixed(2)} → ${exp.category}`
      )
      .join('\n');

    // CORREÇÃO BUG #3: Feedback honesto sobre falhas
    let statusEmoji = '✅';
    let statusMessage = `Importadas e categorizadas ${importedCount} transações`;
    if (failedCount > 0 && importedCount === 0) {
      statusEmoji = '❌';
      statusMessage = `Falha ao importar ${failedCount} transações`;
    } else if (failedCount > 0) {
      statusEmoji = '⚠️';
      statusMessage = `${importedCount} importadas, ${failedCount} falharam`;
    }

    const failedText =
      failedCount > 0
        ? `\n\n**Falharam (${failedCount}):**\n${failedTransactions.slice(0, 5).map((t) => `• ${t}`).join('\n')}${failedCount > 5 ? `\n... e mais ${failedCount - 5}` : ''}`
        : '';

    return {
      success: importedCount > 0,
      message: `${statusEmoji} ${statusMessage} dos últimos ${days} dias!${summaryText ? `\n\n**Por categoria:**\n${summaryText}` : ''}${detailsText ? `\n\n**Detalhes:**\n${detailsText}${importedCount > 10 ? `\n... e mais ${importedCount - 10} transações` : ''}` : ''}${failedText}`,
      imported: importedCount,
      failed: failedCount,
      summary: categorySummary,
      expenses: importedExpenses,
    };
  } catch (error: any) {
    console.error('[importAndCategorizeTransactions] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function syncOpenFinanceTransactions(
  supabase: any,
  userId: string,
  args: { days?: number; account_name?: string }
) {
  try {
    const days = args.days || 7;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = new Date().toISOString().split('T')[0];

    console.log(
      `[syncOpenFinanceTransactions] Fetching transactions from ${fromDateStr} to ${toDateStr}`
    );

    // Buscar contas do usuário
    let accountsQuery = supabase
      .from('pluggy_accounts')
      .select('id, name, type')
      .eq('user_id', userId)
      .in('type', ['BANK', 'CHECKING']);

    if (args.account_name) {
      accountsQuery = accountsQuery.ilike('name', `%${args.account_name}%`);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return {
        success: false,
        error: args.account_name
          ? `Conta "${args.account_name}" não encontrada`
          : 'Nenhuma conta bancária conectada',
      };
    }

    console.log(
      `[syncOpenFinanceTransactions] Found ${accounts.length} account(s)`
    );

    // Buscar transações de todas as contas
    const accountIds = accounts.map((acc) => acc.id);

    const { data: transactions, error: txError } = await supabase
      .from('pluggy_transactions')
      .select('*')
      .in('account_id', accountIds)
      .eq('type', 'DEBIT')
      .gte('date', fromDateStr)
      .lte('date', toDateStr)
      .is('synced', false); // Apenas transações não sincronizadas

    if (txError) {
      console.error(
        '[syncOpenFinanceTransactions] Error fetching transactions:',
        txError
      );
      return {
        success: false,
        error: `Erro ao buscar transações: ${txError.message}`,
      };
    }

    if (!transactions || transactions.length === 0) {
      return {
        success: true,
        transactions_found: 0,
        expenses_created: 0,
        message: `Nenhuma transação nova encontrada nos últimos ${days} dias.`,
      };
    }

    console.log(
      `[syncOpenFinanceTransactions] Found ${transactions.length} transactions`
    );

    // Criar expense para cada transação (simplificado - categorização automática virá depois)
    let createdCount = 0;
    const createdExpenses = [];

    for (const tx of transactions) {
      // Criar expense
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          user_id: userId,
          establishment_name: tx.description || 'Sem descrição',
          amount: Math.abs(tx.amount),
          category: 'outros', // Por enquanto, depois implementamos categorização
          date: tx.date,
          transaction_id: tx.id, // Vincular à transação
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!expenseError && expense) {
        createdCount++;
        createdExpenses.push({
          establishment: tx.description,
          amount: Math.abs(tx.amount),
        });

        // Marcar transação como sincronizada E vincular ao expense criado
        await supabase
          .from('pluggy_transactions')
          .update({ synced: true, expense_id: expense.id })
          .eq('id', tx.id);
      }
    }

    return {
      success: true,
      transactions_found: transactions.length,
      expenses_created: createdCount,
      expenses: createdExpenses,
      message: `✅ Sincronizadas ${createdCount} transações dos últimos ${days} dias!`,
    };
  } catch (error) {
    console.error('[syncOpenFinanceTransactions] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function createBudget(
  supabase: any,
  userId: string,
  args: {
    category_id: string;
    amount: number;
    period_type?: string;
    notifications_enabled?: boolean;
  }
) {
  try {
    const periodType = args.period_type || 'monthly';
    const notificationsEnabled = args.notifications_enabled ?? true;
    const startDate = new Date().toISOString().split('T')[0];

    // Verificar se já existe orçamento para esta categoria
    const { data: existingBudget } = await supabase
      .from('budgets')
      .select('id, amount')
      .eq('user_id', userId)
      .eq('category_id', args.category_id)
      .eq('period_type', periodType)
      .single();

    if (existingBudget) {
      return {
        success: false,
        error: `Já existe um orçamento ${periodType === 'monthly' ? 'mensal' : periodType === 'weekly' ? 'semanal' : 'anual'} de R$ ${parseFloat(existingBudget.amount).toFixed(2)} para ${args.category_id}. Use update_budget para alterá-lo.`,
      };
    }

    const { data, error } = await supabase
      .from('budgets')
      .insert({
        user_id: userId,
        category_id: args.category_id,
        amount: args.amount.toString(),
        period_type: periodType,
        start_date: startDate,
        notifications_enabled: notificationsEnabled,
      })
      .select()
      .single();

    if (error) {
      console.error('[createBudget] Error:', error);
      return {
        success: false,
        error: `Erro ao criar orçamento: ${error.message}`,
      };
    }

    const periodLabel =
      periodType === 'monthly'
        ? 'mensal'
        : periodType === 'weekly'
          ? 'semanal'
          : 'anual';

    return {
      success: true,
      budget: {
        id: data.id,
        category_id: data.category_id,
        amount: parseFloat(data.amount),
        period_type: data.period_type,
      },
      message: `✅ Orçamento ${periodLabel} criado para ${args.category_id}: R$ ${args.amount.toFixed(2)}`,
    };
  } catch (error) {
    console.error('[createBudget] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function updateBudget(
  supabase: any,
  userId: string,
  args: {
    category_id: string;
    amount?: number;
    period_type?: string;
    notifications_enabled?: boolean;
  }
) {
  try {
    // Buscar orçamento existente
    const { data: existingBudget, error: fetchError } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', args.category_id)
      .single();

    if (fetchError || !existingBudget) {
      return {
        success: false,
        error: `Orçamento para ${args.category_id} não encontrado. Use create_budget para criar um novo.`,
      };
    }

    // Preparar dados de atualização
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (args.amount !== undefined) {
      updateData.amount = args.amount.toString();
    }
    if (args.period_type !== undefined) {
      updateData.period_type = args.period_type;
    }
    if (args.notifications_enabled !== undefined) {
      updateData.notifications_enabled = args.notifications_enabled;
    }

    const { data, error } = await supabase
      .from('budgets')
      .update(updateData)
      .eq('id', existingBudget.id)
      .select()
      .single();

    if (error) {
      console.error('[updateBudget] Error:', error);
      return {
        success: false,
        error: `Erro ao atualizar orçamento: ${error.message}`,
      };
    }

    const changes = [];
    if (args.amount !== undefined) {
      changes.push(`valor: R$ ${args.amount.toFixed(2)}`);
    }
    if (args.period_type !== undefined) {
      const periodLabel =
        args.period_type === 'monthly'
          ? 'mensal'
          : args.period_type === 'weekly'
            ? 'semanal'
            : 'anual';
      changes.push(`período: ${periodLabel}`);
    }
    if (args.notifications_enabled !== undefined) {
      changes.push(
        `notificações: ${args.notifications_enabled ? 'ativadas' : 'desativadas'}`
      );
    }

    return {
      success: true,
      budget: {
        id: data.id,
        category_id: data.category_id,
        amount: parseFloat(data.amount),
        period_type: data.period_type,
      },
      message: `✅ Orçamento de ${args.category_id} atualizado (${changes.join(', ')})`,
    };
  } catch (error) {
    console.error('[updateBudget] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function checkBudgetStatus(
  supabase: any,
  userId: string,
  args: { category_id?: string }
) {
  try {
    // Buscar orçamentos
    let budgetsQuery = supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId);

    if (args.category_id) {
      budgetsQuery = budgetsQuery.eq('category_id', args.category_id);
    }

    const { data: budgets, error: budgetsError } = await budgetsQuery;

    if (budgetsError) {
      console.error('[checkBudgetStatus] Error:', budgetsError);
      return {
        success: false,
        error: `Erro ao buscar orçamentos: ${budgetsError.message}`,
      };
    }

    if (!budgets || budgets.length === 0) {
      return {
        success: true,
        budgets: [],
        message: args.category_id
          ? `Nenhum orçamento encontrado para ${args.category_id}`
          : 'Nenhum orçamento configurado ainda',
      };
    }

    // Para cada orçamento, calcular quanto foi gasto
    const budgetStatuses = [];

    for (const budget of budgets) {
      // Calcular período atual
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      if (budget.period_type === 'monthly') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );
      } else if (budget.period_type === 'weekly') {
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // yearly
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      }

      // Buscar gastos da categoria no período
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', userId)
        .eq('category', budget.category_id)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);

      const totalSpent = expenses
        ? expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0)
        : 0;

      const budgetLimit = parseFloat(budget.amount);
      const remaining = budgetLimit - totalSpent;
      const percentage = (totalSpent / budgetLimit) * 100;

      const periodLabel =
        budget.period_type === 'monthly'
          ? 'mensal'
          : budget.period_type === 'weekly'
            ? 'semanal'
            : 'anual';

      budgetStatuses.push({
        category: budget.category_id,
        period_type: periodLabel,
        limit: budgetLimit,
        spent: totalSpent,
        remaining: Math.max(0, remaining),
        percentage: Math.min(100, percentage),
        status:
          percentage >= 100
            ? 'excedido'
            : percentage >= 90
              ? 'crítico'
              : percentage >= 80
                ? 'alerta'
                : 'normal',
      });
    }

    // Gerar mensagem formatada
    const statusMessages = budgetStatuses.map((status) => {
      const emoji =
        status.status === 'excedido'
          ? '🔴'
          : status.status === 'crítico'
            ? '🟠'
            : status.status === 'alerta'
              ? '🟡'
              : '🟢';

      return `${emoji} ${status.category} (${status.period_type}): R$ ${status.spent.toFixed(2)} / R$ ${status.limit.toFixed(2)} (${status.percentage.toFixed(1)}% usado) - Restam R$ ${status.remaining.toFixed(2)}`;
    });

    return {
      success: true,
      budgets: budgetStatuses,
      message: `📊 Status dos Orçamentos:\n\n${statusMessages.join('\n')}`,
    };
  } catch (error) {
    console.error('[checkBudgetStatus] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

// ============================================================================
// PREVIEW DE CATEGORIAS PARA TRANSAÇÕES DO EXTRATO
// Mostra categorias sugeridas SEM registrar como expenses
// ============================================================================

async function previewTransactionCategories(
  supabase: any,
  userId: string,
  args: { days?: number; account_name?: string }
) {
  try {
    const days = args.days || 30;

    console.log(
      `[previewTransactionCategories] Starting for user ${userId}, days=${days}`
    );

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = new Date().toISOString().split('T')[0];

    // Buscar contas do Open Finance
    let accountsQuery = supabase
      .from('pluggy_accounts')
      .select('id, name, type')
      .eq('user_id', userId);

    if (args.account_name) {
      accountsQuery = accountsQuery.ilike('name', `%${args.account_name}%`);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return {
        success: false,
        error: args.account_name
          ? `Conta "${args.account_name}" não encontrada`
          : 'Nenhuma conta bancária conectada via Open Finance',
      };
    }

    const accountIds = accounts.map((acc: any) => acc.id);

    // Buscar transações do período (débitos = gastos)
    const { data: allTransactions, error: txError } = await supabase
      .from('pluggy_transactions')
      .select('id, description, amount, date, type, expense_id')
      .in('account_id', accountIds)
      .eq('type', 'DEBIT')
      .gte('date', fromDateStr)
      .lte('date', toDateStr)
      .order('date', { ascending: false })
      .limit(100);

    if (txError) {
      console.error('[previewTransactionCategories] Error:', txError);
      return {
        success: false,
        error: `Erro ao buscar transações: ${txError.message}`,
      };
    }

    if (!allTransactions || allTransactions.length === 0) {
      return {
        success: true,
        message: `Nenhuma transação encontrada nos últimos ${days} dias.`,
        transactions: [],
      };
    }

    // Separar transações já importadas das não importadas
    const alreadyImportedTx = allTransactions.filter(
      (tx: any) => tx.expense_id
    );
    const notImportedTx = allTransactions.filter((tx: any) => !tx.expense_id);

    console.log(
      `[previewTransactionCategories] Found ${allTransactions.length} transactions: ${notImportedTx.length} not imported, ${alreadyImportedTx.length} already imported`
    );

    // Se não há transações novas para categorizar
    if (notImportedTx.length === 0) {
      return {
        success: true,
        message: `✅ Todas as ${alreadyImportedTx.length} transações dos últimos ${days} dias já estão registradas no app!`,
        transactions: [],
        total_transactions: allTransactions.length,
        already_imported: alreadyImportedTx.length,
        not_imported: 0,
      };
    }

    // Categorizar APENAS transações NÃO importadas (sem salvar, apenas preview)
    const categorizedTransactions: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      suggested_category: string;
      suggested_subcategory: string;
      confidence: string;
    }> = [];

    // Processar em lotes de 5 para não sobrecarregar
    const batchSize = 5;
    const transactionsToProcess = notImportedTx.slice(0, 30); // Limitar a 30 para não demorar muito

    for (let i = 0; i < transactionsToProcess.length; i += batchSize) {
      const batch = transactionsToProcess.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (tx: any) => {
          try {
            const categorization = await categorizeWithWalts(tx.description, {
              amount: Math.abs(tx.amount),
            });

            return {
              id: tx.id,
              description: tx.description,
              amount: Math.abs(tx.amount),
              date: tx.date,
              suggested_category: categorization.category,
              suggested_subcategory: categorization.subcategory,
              confidence: categorization.confidence || 'medium',
            };
          } catch (err) {
            console.error(
              `[previewTransactionCategories] Error categorizing ${tx.id}:`,
              err
            );
            return {
              id: tx.id,
              description: tx.description,
              amount: Math.abs(tx.amount),
              date: tx.date,
              suggested_category: 'outros',
              suggested_subcategory: 'Outros',
              confidence: 'low',
            };
          }
        })
      );

      categorizedTransactions.push(...results);
    }

    // Agrupar por categoria para resumo
    const categorySummary: { [key: string]: { count: number; total: number } } =
      {};
    for (const tx of categorizedTransactions) {
      if (!categorySummary[tx.suggested_category]) {
        categorySummary[tx.suggested_category] = { count: 0, total: 0 };
      }
      categorySummary[tx.suggested_category].count++;
      categorySummary[tx.suggested_category].total += tx.amount;
    }

    // Formatar para exibição
    const summaryText = Object.entries(categorySummary)
      .sort((a, b) => b[1].total - a[1].total)
      .map(
        ([cat, data]) =>
          `${cat}: ${data.count} transações (R$ ${data.total.toFixed(2)})`
      )
      .join('\n');

    // Formatar lista de transações categorizadas
    const txListText = categorizedTransactions
      .slice(0, 10)
      .map(
        (tx) =>
          `• ${tx.description}: R$ ${tx.amount.toFixed(2)} → ${tx.suggested_category}/${tx.suggested_subcategory}`
      )
      .join('\n');

    return {
      success: true,
      message: `📊 Categorização de ${categorizedTransactions.length} transações NÃO registradas (últimos ${days} dias):\n\n**Por categoria:**\n${summaryText}\n\n**Detalhes:**\n${txListText}${categorizedTransactions.length > 10 ? `\n... e mais ${categorizedTransactions.length - 10} transações` : ''}\n\n📌 ${alreadyImportedTx.length} transações já estão registradas no app (não foram processadas)`,
      transactions: categorizedTransactions,
      summary: categorySummary,
      total_transactions: allTransactions.length,
      already_imported: alreadyImportedTx.length,
      not_imported: notImportedTx.length,
      categorized: categorizedTransactions.length,
    };
  } catch (error: any) {
    console.error('[previewTransactionCategories] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro ao processar preview de categorias',
    };
  }
}

async function getBankStatement(
  supabase: any,
  userId: string,
  args: { days?: number; account_name?: string; transaction_type?: string }
) {
  try {
    const days = args.days || 30;
    const transactionType = args.transaction_type || 'ALL';

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = new Date().toISOString().split('T')[0];

    console.log(
      `[getBankStatement] Fetching transactions from ${fromDateStr} to ${toDateStr}`
    );

    // Buscar contas do usuário
    let accountsQuery = supabase
      .from('pluggy_accounts')
      .select('id, name, type, balance, pluggy_items(connector_name)')
      .eq('user_id', userId);

    if (args.account_name) {
      accountsQuery = accountsQuery.ilike('name', `%${args.account_name}%`);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return {
        success: false,
        error: args.account_name
          ? `Conta "${args.account_name}" não encontrada`
          : 'Nenhuma conta bancária conectada',
      };
    }

    console.log(`[getBankStatement] Found ${accounts.length} account(s)`);

    // Buscar transações de todas as contas
    const accountIds = accounts.map((acc) => acc.id);

    let transactionsQuery = supabase
      .from('pluggy_transactions')
      .select('*')
      .in('account_id', accountIds)
      .gte('date', fromDateStr)
      .lte('date', toDateStr)
      .order('date', { ascending: false });

    // Filtrar por tipo de transação se especificado
    if (transactionType !== 'ALL') {
      transactionsQuery = transactionsQuery.eq('type', transactionType);
    }

    const { data: transactions, error: txError } = await transactionsQuery;

    if (txError) {
      console.error('[getBankStatement] Error fetching transactions:', txError);
      return {
        success: false,
        error: `Erro ao buscar transações: ${txError.message}`,
      };
    }

    if (!transactions || transactions.length === 0) {
      return {
        success: true,
        transactions: [],
        summary: {
          total_transactions: 0,
          total_debit: 0,
          total_credit: 0,
          accounts_count: accounts.length,
        },
        message: `Nenhuma transação encontrada nos últimos ${days} dias.`,
      };
    }

    console.log(`[getBankStatement] Found ${transactions.length} transactions`);

    // Calcular totais
    let totalDebit = 0;
    let totalCredit = 0;

    const formattedTransactions = transactions.map((tx) => {
      if (tx.type === 'DEBIT') {
        totalDebit += Math.abs(tx.amount);
      } else {
        totalCredit += Math.abs(tx.amount);
      }

      // Encontrar nome da conta
      const account = accounts.find((acc) => acc.id === tx.account_id);
      const accountName = account ? account.name : 'Desconhecida';

      return {
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        status: tx.status,
        account: accountName,
      };
    });

    // Agrupar por conta para resumo
    const accountSummaries = accounts.map((account) => {
      const accountTxs = transactions.filter(
        (tx) => tx.account_id === account.id
      );
      const accountDebit = accountTxs
        .filter((tx) => tx.type === 'DEBIT')
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const accountCredit = accountTxs
        .filter((tx) => tx.type === 'CREDIT')
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      return {
        name: account.name,
        balance: account.balance || 0,
        transactions_count: accountTxs.length,
        total_debit: accountDebit,
        total_credit: accountCredit,
      };
    });

    // Formatar mensagem de resposta
    const periodLabel =
      days === 7
        ? 'última semana'
        : days === 30
          ? 'último mês'
          : `últimos ${days} dias`;

    let message = `💳 Extrato Bancário - ${periodLabel}\n\n`;
    message += `📊 RESUMO GERAL:\n`;
    message += `• ${transactions.length} transações\n`;
    message += `• Saídas: R$ ${totalDebit.toFixed(2)}\n`;
    message += `• Entradas: R$ ${totalCredit.toFixed(2)}\n`;
    message += `• Saldo: ${totalCredit > totalDebit ? '+' : ''}R$ ${(totalCredit - totalDebit).toFixed(2)}\n\n`;

    message += `🏦 POR CONTA:\n`;
    accountSummaries.forEach((acc) => {
      message += `• ${acc.name}: ${acc.transactions_count} transações\n`;
      message += `  Saídas: R$ ${acc.total_debit.toFixed(2)} | Entradas: R$ ${acc.total_credit.toFixed(2)}\n`;
    });

    // Mostrar últimas transações (máximo 10)
    message += `\n📝 ÚLTIMAS TRANSAÇÕES:\n`;
    formattedTransactions.slice(0, 10).forEach((tx) => {
      const emoji = tx.type === 'DEBIT' ? '🔴' : '🟢';
      const sign = tx.type === 'DEBIT' ? '-' : '+';
      message += `${emoji} ${tx.date} | ${tx.account}\n`;
      message += `   ${tx.description}: ${sign}R$ ${Math.abs(tx.amount).toFixed(2)}\n`;
    });

    if (transactions.length > 10) {
      message += `\n... e mais ${transactions.length - 10} transações`;
    }

    return {
      success: true,
      transactions: formattedTransactions,
      summary: {
        total_transactions: transactions.length,
        total_debit: totalDebit,
        total_credit: totalCredit,
        net_balance: totalCredit - totalDebit,
        accounts: accountSummaries,
        period: { from: fromDateStr, to: toDateStr, days },
      },
      message,
    };
  } catch (error) {
    console.error('[getBankStatement] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function analyzeSpendingPattern(
  supabase: any,
  userId: string,
  args: { category?: string; months?: number }
) {
  try {
    const months = args.months || 3;
    const categoryFilter = args.category;

    // Calcular período de análise
    const now = new Date();
    const analysisStartDate = new Date(now);
    analysisStartDate.setMonth(now.getMonth() - months);

    console.log(
      `[analyzeSpendingPattern] Analyzing ${months} months${categoryFilter ? ` for category ${categoryFilter}` : ''}`
    );

    // Buscar gastos do período
    let expensesQuery = supabase
      .from('expenses')
      .select('amount, category, date, establishment_name')
      .eq('user_id', userId)
      .gte('date', analysisStartDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (categoryFilter) {
      expensesQuery = expensesQuery.eq('category', categoryFilter);
    }

    const { data: expenses, error: expensesError } = await expensesQuery;

    if (expensesError) {
      console.error('[analyzeSpendingPattern] Error:', expensesError);
      return {
        success: false,
        error: `Erro ao buscar gastos: ${expensesError.message}`,
      };
    }

    if (!expenses || expenses.length === 0) {
      return {
        success: true,
        patterns: [],
        message: categoryFilter
          ? `Nenhum gasto encontrado em ${categoryFilter} nos últimos ${months} meses`
          : `Nenhum gasto encontrado nos últimos ${months} meses`,
      };
    }

    // Agrupar gastos por mês e categoria
    const monthlyData: {
      [key: string]: { [category: string]: { total: number; count: number } };
    } = {};

    expenses.forEach((expense) => {
      const expenseDate = new Date(expense.date);
      const monthKey = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
      const category = expense.category;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {};
      }
      if (!monthlyData[monthKey][category]) {
        monthlyData[monthKey][category] = { total: 0, count: 0 };
      }

      monthlyData[monthKey][category].total += parseFloat(expense.amount);
      monthlyData[monthKey][category].count += 1;
    });

    // Calcular médias e detectar anomalias
    const patterns: any[] = [];
    const categoriesToAnalyze = categoryFilter
      ? [categoryFilter]
      : Array.from(new Set(expenses.map((e) => e.category)));

    for (const category of categoriesToAnalyze) {
      const monthlyTotals: number[] = [];

      Object.keys(monthlyData).forEach((month) => {
        if (monthlyData[month][category]) {
          monthlyTotals.push(monthlyData[month][category].total);
        } else {
          monthlyTotals.push(0);
        }
      });

      if (monthlyTotals.length === 0) continue;

      const average =
        monthlyTotals.reduce((sum, val) => sum + val, 0) / monthlyTotals.length;
      const currentMonth = monthlyTotals[monthlyTotals.length - 1];
      const previousMonth =
        monthlyTotals.length > 1 ? monthlyTotals[monthlyTotals.length - 2] : 0;

      // Detectar tendência
      let trend = 'estável';
      const changePercent =
        previousMonth > 0
          ? ((currentMonth - previousMonth) / previousMonth) * 100
          : 0;

      if (changePercent > 20) trend = 'crescente';
      else if (changePercent < -20) trend = 'decrescente';

      // Detectar anomalia (gasto 50% acima da média)
      const isAnomaly = currentMonth > average * 1.5;

      patterns.push({
        category,
        average_monthly: average,
        current_month: currentMonth,
        previous_month: previousMonth,
        change_percent: changePercent,
        trend,
        is_anomaly: isAnomaly,
        months_analyzed: monthlyTotals.length,
      });
    }

    // Ordenar por anomalia e mudança percentual
    patterns.sort((a, b) => {
      if (a.is_anomaly && !b.is_anomaly) return -1;
      if (!a.is_anomaly && b.is_anomaly) return 1;
      return Math.abs(b.change_percent) - Math.abs(a.change_percent);
    });

    // Formatar mensagem
    let message = `📈 Análise de Padrões de Gastos (${months} meses)\n\n`;

    patterns.forEach((pattern) => {
      const emoji = pattern.is_anomaly
        ? '🚨'
        : pattern.trend === 'crescente'
          ? '📈'
          : pattern.trend === 'decrescente'
            ? '📉'
            : '➡️';

      message += `${emoji} ${pattern.category}:\n`;
      message += `  • Média mensal: R$ ${pattern.average_monthly.toFixed(2)}\n`;
      message += `  • Mês atual: R$ ${pattern.current_month.toFixed(2)}\n`;
      message += `  • Variação: ${pattern.change_percent > 0 ? '+' : ''}${pattern.change_percent.toFixed(1)}%\n`;

      if (pattern.is_anomaly) {
        message += `  ⚠️ ATENÇÃO: Gasto ${((pattern.current_month / pattern.average_monthly - 1) * 100).toFixed(0)}% acima da média!\n`;
      }

      message += '\n';
    });

    // Adicionar insights gerais
    const anomalies = patterns.filter((p) => p.is_anomaly);
    if (anomalies.length > 0) {
      message += `💡 Você tem ${anomalies.length} categoria(s) com gastos anormalmente altos este mês.`;
    } else {
      message += `✅ Seus gastos estão dentro dos padrões normais.`;
    }

    return {
      success: true,
      patterns,
      message,
    };
  } catch (error) {
    console.error('[analyzeSpendingPattern] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function suggestSavings(
  supabase: any,
  userId: string,
  args: { target_amount?: number }
) {
  try {
    const targetAmount = args.target_amount;

    console.log(
      `[suggestSavings] Generating savings suggestions${targetAmount ? ` for target R$ ${targetAmount}` : ''}`
    );

    // Buscar gastos do mês atual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data: currentExpenses } = await supabase
      .from('expenses')
      .select('amount, category, subcategory, establishment_name')
      .eq('user_id', userId)
      .gte('date', startOfMonth.toISOString().split('T')[0])
      .lte('date', endOfMonth.toISOString().split('T')[0]);

    // Buscar gastos dos últimos 3 meses para comparação
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    const { data: historicalExpenses } = await supabase
      .from('expenses')
      .select('amount, category')
      .eq('user_id', userId)
      .gte('date', threeMonthsAgo.toISOString().split('T')[0])
      .lt('date', startOfMonth.toISOString().split('T')[0]);

    // Buscar orçamentos
    const { data: budgets } = await supabase
      .from('budgets')
      .select('category_id, amount')
      .eq('user_id', userId);

    // Agrupar gastos atuais por categoria
    const currentByCategory: { [key: string]: number } = {};
    if (currentExpenses) {
      currentExpenses.forEach((expense) => {
        const cat = expense.category;
        currentByCategory[cat] =
          (currentByCategory[cat] || 0) + parseFloat(expense.amount);
      });
    }

    // Calcular média histórica por categoria
    const historicalAverage: { [key: string]: number } = {};
    if (historicalExpenses) {
      const categoryTotals: {
        [key: string]: { total: number; months: Set<string> };
      } = {};

      historicalExpenses.forEach((expense) => {
        const cat = expense.category;
        if (!categoryTotals[cat]) {
          categoryTotals[cat] = { total: 0, months: new Set() };
        }
        categoryTotals[cat].total += parseFloat(expense.amount);
      });

      Object.keys(categoryTotals).forEach((cat) => {
        historicalAverage[cat] = categoryTotals[cat].total / 3; // 3 meses
      });
    }

    // Gerar sugestões
    const suggestions: any[] = [];

    // Categorias não-essenciais que podem ser reduzidas
    const nonEssentialCategories = ['lazer', 'vestuario', 'outros'];

    Object.keys(currentByCategory).forEach((category) => {
      const current = currentByCategory[category];
      const historical = historicalAverage[category] || 0;
      const budget = budgets?.find((b) => b.category_id === category);

      // Sugestão 1: Categoria acima da média histórica
      if (historical > 0 && current > historical * 1.2) {
        const potentialSavings = current - historical;
        suggestions.push({
          category,
          type: 'above_average',
          current_spending: current,
          average_spending: historical,
          potential_savings: potentialSavings,
          priority: nonEssentialCategories.includes(category)
            ? 'high'
            : 'medium',
          suggestion: `Você está gastando R$ ${potentialSavings.toFixed(2)} a mais em ${category} comparado à sua média. Tente reduzir para R$ ${historical.toFixed(2)}.`,
        });
      }

      // Sugestão 2: Categoria acima do orçamento
      if (budget && current > parseFloat(budget.amount)) {
        const excess = current - parseFloat(budget.amount);
        suggestions.push({
          category,
          type: 'over_budget',
          current_spending: current,
          budget_limit: parseFloat(budget.amount),
          potential_savings: excess,
          priority: 'high',
          suggestion: `Você ultrapassou o orçamento de ${category} em R$ ${excess.toFixed(2)}. Tente manter dentro do limite de R$ ${parseFloat(budget.amount).toFixed(2)}.`,
        });
      }

      // Sugestão 3: Categorias não-essenciais com gastos altos
      if (nonEssentialCategories.includes(category) && current > 200) {
        const targetReduction = current * 0.3; // 30% de redução
        suggestions.push({
          category,
          type: 'non_essential',
          current_spending: current,
          potential_savings: targetReduction,
          priority: 'medium',
          suggestion: `${category} é uma categoria não-essencial. Reduza 30% (R$ ${targetReduction.toFixed(2)}) para economizar.`,
        });
      }
    });

    // Ordenar por prioridade e potencial de economia
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.potential_savings - a.potential_savings;
    });

    const totalPotentialSavings = suggestions.reduce(
      (sum, s) => sum + s.potential_savings,
      0
    );

    // Formatar mensagem
    let message = `💰 Sugestões de Economia\n\n`;

    if (targetAmount) {
      message += `🎯 Meta: Economizar R$ ${targetAmount.toFixed(2)}\n`;
      message += `💡 Economia potencial: R$ ${totalPotentialSavings.toFixed(2)}\n\n`;

      if (totalPotentialSavings >= targetAmount) {
        message += `✅ É possível atingir sua meta!\n\n`;
      } else {
        message += `⚠️ Economia potencial abaixo da meta (faltam R$ ${(targetAmount - totalPotentialSavings).toFixed(2)})\n\n`;
      }
    }

    if (suggestions.length === 0) {
      message += `✅ Seus gastos estão controlados! Não há sugestões de economia no momento.`;
    } else {
      message += `📋 TOP ${Math.min(5, suggestions.length)} SUGESTÕES:\n\n`;

      suggestions.slice(0, 5).forEach((suggestion, index) => {
        const emoji =
          suggestion.priority === 'high'
            ? '🔴'
            : suggestion.priority === 'medium'
              ? '🟡'
              : '🟢';
        message += `${index + 1}. ${emoji} ${suggestion.category}\n`;
        message += `   ${suggestion.suggestion}\n\n`;
      });

      message += `💡 Total de economia potencial: R$ ${totalPotentialSavings.toFixed(2)}/mês`;
    }

    return {
      success: true,
      suggestions,
      total_potential_savings: totalPotentialSavings,
      target_achievable: targetAmount
        ? totalPotentialSavings >= targetAmount
        : null,
      message,
    };
  } catch (error) {
    console.error('[suggestSavings] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function forecastMonthEnd(
  supabase: any,
  userId: string,
  args: { include_recommendations?: boolean }
) {
  try {
    const includeRecommendations = args.include_recommendations ?? true;

    console.log('[forecastMonthEnd] Generating month-end forecast');

    // Buscar perfil do usuário (incluindo income_cards)
    const { data: profile } = await supabase
      .from('profiles')
      .select('monthly_salary, salary_payment_day, income_cards')
      .eq('id', userId)
      .single();

    // Calcular total de rendas (priorizar income_cards se existir)
    let monthlySalary = 0;
    let salaryPaymentDay = profile?.salary_payment_day || 1;
    let incomeCards: any[] = [];
    let bankBalance: number | null = null;
    let balanceSource: 'manual' | 'bank' = 'manual';

    if (
      profile?.income_cards &&
      Array.isArray(profile.income_cards) &&
      profile.income_cards.length > 0
    ) {
      incomeCards = profile.income_cards;
      // Usar income_cards (sistema novo)
      monthlySalary = incomeCards.reduce((sum: number, card: any) => {
        const salary = parseFloat(
          String(card.salary).replace(/\./g, '').replace(',', '.')
        );
        return sum + (isNaN(salary) ? 0 : salary);
      }, 0);
      // Usar o menor dia de pagamento para ser conservador
      const paymentDays = incomeCards
        .map((card: any) => parseInt(card.paymentDay))
        .filter((day: number) => !isNaN(day) && day >= 1 && day <= 31);
      if (paymentDays.length > 0) {
        salaryPaymentDay = Math.min(...paymentDays);
      }

      // Buscar saldos das contas vinculadas (Open Finance)
      const linkedAccountIds = incomeCards
        .filter((card: any) => card.linkedAccountId)
        .map((card: any) => card.linkedAccountId);

      if (linkedAccountIds.length > 0) {
        const { data: linkedAccounts } = await supabase
          .from('pluggy_accounts')
          .select('id, balance')
          .in('id', linkedAccountIds);

        if (linkedAccounts && linkedAccounts.length > 0) {
          bankBalance = linkedAccounts.reduce(
            (sum: number, acc: any) => sum + (acc.balance || 0),
            0
          );
        }
      }
    } else if (profile?.monthly_salary) {
      // Fallback para monthly_salary (sistema antigo)
      monthlySalary = profile.monthly_salary;
    }

    // Calcular período do mês atual
    const now = new Date();
    const currentDay = now.getDate();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    const daysElapsed = currentDay;
    const daysRemaining = daysInMonth - currentDay;

    // Buscar gastos do mês até agora
    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount, category, date')
      .eq('user_id', userId)
      .gte('date', startOfMonth.toISOString().split('T')[0])
      .lte('date', now.toISOString().split('T')[0]);

    const totalSpent = expenses
      ? expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0)
      : 0;

    // Calcular taxa de gasto diário
    const dailySpendingRate = daysElapsed > 0 ? totalSpent / daysElapsed : 0;

    // Projetar gasto total do mês
    const projectedTotalSpending =
      totalSpent + dailySpendingRate * daysRemaining;

    // Calcular saldo projetado
    const projectedBalance = monthlySalary - projectedTotalSpending;
    const projectedBalancePercent =
      monthlySalary > 0 ? (projectedBalance / monthlySalary) * 100 : 0;

    // Determinar status
    let status = 'good';
    if (projectedBalancePercent < 0) status = 'critical';
    else if (projectedBalancePercent < 10) status = 'warning';
    else if (projectedBalancePercent < 20) status = 'attention';

    // Buscar orçamentos
    const { data: budgets } = await supabase
      .from('budgets')
      .select('category_id, amount')
      .eq('user_id', userId)
      .eq('period_type', 'monthly');

    // Verificar orçamentos que serão ultrapassados
    const budgetWarnings: any[] = [];

    if (budgets && expenses) {
      const categorySpending: { [key: string]: number } = {};

      expenses.forEach((expense) => {
        const cat = expense.category;
        categorySpending[cat] =
          (categorySpending[cat] || 0) + parseFloat(expense.amount);
      });

      budgets.forEach((budget) => {
        const cat = budget.category_id;
        const spent = categorySpending[cat] || 0;
        const limit = parseFloat(budget.amount);
        const projectedSpending = spent + (spent / daysElapsed) * daysRemaining;

        if (projectedSpending > limit) {
          budgetWarnings.push({
            category: cat,
            current_spent: spent,
            projected_spent: projectedSpending,
            budget_limit: limit,
            excess: projectedSpending - limit,
          });
        }
      });
    }

    // Formatar mensagem
    const statusEmoji = {
      critical: '🔴',
      warning: '🟠',
      attention: '🟡',
      good: '🟢',
    }[status];

    let message = `${statusEmoji} Projeção para Fim do Mês\n\n`;

    // Calcular saldo atual usando lógica conservadora (menor entre manual e banco)
    const manualBalance = monthlySalary - totalSpent;
    let currentBalance = manualBalance;

    if (bankBalance !== null) {
      // Usar o menor valor (mais conservador)
      if (bankBalance < manualBalance) {
        currentBalance = bankBalance;
        balanceSource = 'bank';
      }
    }

    message += `📅 SITUAÇÃO ATUAL:\n`;
    message += `• Dia ${currentDay} de ${daysInMonth} (${((daysElapsed / daysInMonth) * 100).toFixed(0)}% do mês)\n`;
    message += `• Gasto até agora: R$ ${totalSpent.toFixed(2)}\n`;
    message += `• Renda mensal: R$ ${monthlySalary.toFixed(2)}\n`;
    message += `• Saldo atual: R$ ${currentBalance.toFixed(2)} ${balanceSource === 'bank' ? '(🏦 saldo do banco)' : '(📝 gastos registrados)'}\n`;
    message += `• Taxa diária: R$ ${dailySpendingRate.toFixed(2)}/dia\n\n`;

    message += `🔮 PROJEÇÃO:\n`;
    message += `• Gasto projetado (fim do mês): R$ ${projectedTotalSpending.toFixed(2)}\n`;
    message += `• Saldo projetado: R$ ${projectedBalance.toFixed(2)} (${projectedBalancePercent.toFixed(1)}%)\n\n`;

    if (status === 'critical') {
      message += `⚠️ ALERTA CRÍTICO: Você pode ficar no vermelho!\n`;
      message += `Recomendação: Reduza gastos em R$ ${Math.abs(projectedBalance).toFixed(2)} para equilibrar.\n`;
    } else if (status === 'warning') {
      message += `⚠️ ATENÇÃO: Saldo muito baixo projetado.\n`;
      message += `Recomendação: Controle gastos nos próximos ${daysRemaining} dias.\n`;
    } else if (status === 'attention') {
      message += `💡 Fique atento aos gastos para não comprometer o saldo.\n`;
    } else {
      message += `✅ Situação financeira saudável!\n`;
    }

    if (budgetWarnings.length > 0) {
      message += `\n⚠️ ORÇAMENTOS EM RISCO:\n`;
      budgetWarnings.forEach((warning) => {
        message += `• ${warning.category}: projetado R$ ${warning.projected_spent.toFixed(2)} (limite: R$ ${warning.budget_limit.toFixed(2)})\n`;
      });
    }

    if (
      includeRecommendations &&
      (status === 'critical' || status === 'warning')
    ) {
      message += `\n💡 RECOMENDAÇÕES:\n`;
      message += `• Meta diária máxima: R$ ${((monthlySalary - totalSpent) / daysRemaining).toFixed(2)}\n`;
      message += `• Reduza gastos não-essenciais (lazer, vestuário)\n`;
      message += `• Evite compras por impulso\n`;
    }

    return {
      success: true,
      forecast: {
        days_elapsed: daysElapsed,
        days_remaining: daysRemaining,
        total_spent: totalSpent,
        daily_rate: dailySpendingRate,
        projected_total: projectedTotalSpending,
        projected_balance: projectedBalance,
        projected_balance_percent: projectedBalancePercent,
        status,
        budget_warnings: budgetWarnings,
      },
      message,
    };
  } catch (error) {
    console.error('[forecastMonthEnd] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function saveUserPreference(
  supabase: any,
  userId: string,
  args: {
    memory_type: string;
    key: string;
    value: any;
    confidence?: number;
    source?: string;
  }
) {
  try {
    const confidence = args.confidence ?? 1.0;
    const source = args.source || 'Conversa com usuário';

    console.log(`[saveUserPreference] Saving ${args.memory_type}: ${args.key}`);

    // Verificar se já existe memória com essa chave
    const { data: existing } = await supabase
      .from('walts_memory')
      .select('id, use_count')
      .eq('user_id', userId)
      .eq('memory_type', args.memory_type)
      .eq('key', args.key)
      .single();

    let result;

    if (existing) {
      // Atualizar memória existente
      const { data, error } = await supabase
        .from('walts_memory')
        .update({
          value: args.value,
          confidence,
          source,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('[saveUserPreference] Error updating:', error);
        return {
          success: false,
          error: `Erro ao atualizar preferência: ${error.message}`,
        };
      }

      result = data;
    } else {
      // Criar nova memória
      const { data, error } = await supabase
        .from('walts_memory')
        .insert({
          user_id: userId,
          memory_type: args.memory_type,
          key: args.key,
          value: args.value,
          confidence,
          source,
        })
        .select()
        .single();

      if (error) {
        console.error('[saveUserPreference] Error inserting:', error);
        return {
          success: false,
          error: `Erro ao salvar preferência: ${error.message}`,
        };
      }

      result = data;
    }

    return {
      success: true,
      memory: {
        id: result.id,
        type: result.memory_type,
        key: result.key,
        value: result.value,
      },
      message: existing
        ? `✅ Preferência atualizada: ${args.key}`
        : `✅ Preferência salva: ${args.key}`,
    };
  } catch (error) {
    console.error('[saveUserPreference] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function getUserContext(
  supabase: any,
  userId: string,
  args: { memory_type?: string; key?: string }
) {
  try {
    const memoryType = args.memory_type || 'all';
    const specificKey = args.key;

    console.log(
      `[getUserContext] Fetching context: type=${memoryType}, key=${specificKey || 'all'}`
    );

    // Construir query
    let query = supabase
      .from('walts_memory')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });

    if (memoryType !== 'all') {
      query = query.eq('memory_type', memoryType);
    }

    if (specificKey) {
      query = query.eq('key', specificKey);
    }

    const { data: memories, error } = await query;

    if (error) {
      console.error('[getUserContext] Error:', error);
      return {
        success: false,
        error: `Erro ao buscar contexto: ${error.message}`,
      };
    }

    if (!memories || memories.length === 0) {
      return {
        success: true,
        memories: [],
        message: specificKey
          ? `Nenhum contexto encontrado para ${specificKey}`
          : 'Nenhum contexto salvo ainda. Vou aprender suas preferências com o tempo!',
      };
    }

    // Atualizar last_used_at e use_count para as memórias acessadas
    const memoryIds = memories.map((m) => m.id);
    await supabase
      .from('walts_memory')
      .update({
        last_used_at: new Date().toISOString(),
        use_count: supabase.rpc('increment', { row_id: 'id' }),
      })
      .in('id', memoryIds);

    // Agrupar memórias por tipo
    const grouped: {
      preferences: any[];
      contexts: any[];
      insights: any[];
    } = {
      preferences: [],
      contexts: [],
      insights: [],
    };

    memories.forEach((memory) => {
      const item = {
        key: memory.key,
        value: memory.value,
        confidence: memory.confidence,
        source: memory.source,
        last_used: memory.last_used_at,
      };

      if (memory.memory_type === 'preference') {
        grouped.preferences.push(item);
      } else if (memory.memory_type === 'context') {
        grouped.contexts.push(item);
      } else if (memory.memory_type === 'insight') {
        grouped.insights.push(item);
      }
    });

    // Formatar mensagem
    let message = `🧠 Contexto do Usuário:\n\n`;

    if (grouped.preferences.length > 0) {
      message += `📌 PREFERÊNCIAS:\n`;
      grouped.preferences.forEach((pref) => {
        message += `• ${pref.key}: ${JSON.stringify(pref.value)}\n`;
      });
      message += '\n';
    }

    if (grouped.contexts.length > 0) {
      message += `📝 CONTEXTOS:\n`;
      grouped.contexts.forEach((ctx) => {
        message += `• ${ctx.key}: ${JSON.stringify(ctx.value)}\n`;
      });
      message += '\n';
    }

    if (grouped.insights.length > 0) {
      message += `💡 INSIGHTS APRENDIDOS:\n`;
      grouped.insights.forEach((ins) => {
        message += `• ${ins.key}: ${JSON.stringify(ins.value)}\n`;
      });
    }

    return {
      success: true,
      memories: grouped,
      total_count: memories.length,
      message: message.trim(),
    };
  } catch (error) {
    console.error('[getUserContext] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function generateExpenseReceipt(
  supabase: any,
  expenseData: {
    establishment_name: string;
    amount: number;
    category: string;
    subcategory?: string;
    date: string;
  }
): Promise<string | null> {
  try {
    console.log('[generateExpenseReceipt] Generating PDF receipt');

    // Criar PDF
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Configurar cores
    const primaryColor = [79, 70, 229]; // Indigo
    const textColor = [31, 41, 55]; // Gray-800
    const lightGray = [243, 244, 246]; // Gray-100

    // Adicionar cabeçalho com cor
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 40, 'F');

    // Logo/Nome do app
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Pocket', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Comprovante de Despesa', 105, 30, { align: 'center' });

    // Resetar cor do texto
    doc.setTextColor(...textColor);

    // Data do comprovante
    const formattedDate = new Date(expenseData.date).toLocaleDateString(
      'pt-BR',
      {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }
    );

    doc.setFontSize(10);
    doc.text(`Data: ${formattedDate}`, 15, 55);

    // Box com informações principais
    doc.setFillColor(...lightGray);
    doc.roundedRect(15, 65, 180, 60, 3, 3, 'F');

    // Estabelecimento
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Estabelecimento:', 20, 75);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text(expenseData.establishment_name, 20, 85);

    // Categoria
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Categoria:', 20, 100);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    const categoryDisplay = expenseData.subcategory
      ? `${expenseData.category} - ${expenseData.subcategory}`
      : expenseData.category;
    doc.text(categoryDisplay, 20, 108);

    // Valor (destacado)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Valor:', 120, 75);
    doc.setTextColor(...primaryColor);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${expenseData.amount.toFixed(2).replace('.', ',')}`, 120, 90);

    // Resetar cor
    doc.setTextColor(...textColor);

    // Rodapé
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(156, 163, 175); // Gray-400
    doc.text('Comprovante gerado automaticamente pelo Walts Agent', 105, 280, {
      align: 'center',
    });
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 105, 285, {
      align: 'center',
    });

    // Converter PDF para base64
    const pdfOutput = doc.output('arraybuffer');
    const pdfBase64 = btoa(
      new Uint8Array(pdfOutput).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );

    // Fazer upload para Supabase Storage
    const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(fileName, decode(pdfBase64), {
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[generateExpenseReceipt] Upload error:', uploadError);
      return null;
    }

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('expense-receipts')
      .getPublicUrl(fileName);

    console.log('[generateExpenseReceipt] PDF generated:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('[generateExpenseReceipt] Exception:', error);
    return null;
  }
}

// Helper function para decode base64
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ==================== FUNÇÕES DE PADRÕES FINANCEIROS ====================

async function getFinancialPatterns(
  supabase: any,
  userId: string,
  args: { pattern_type?: string; category?: string }
) {
  try {
    const patternType = args.pattern_type || 'all';
    const categoryFilter = args.category;

    console.log(
      `[getFinancialPatterns] Fetching patterns: type=${patternType}, category=${categoryFilter || 'all'}`
    );

    // Construir query
    let query = supabase
      .from('user_financial_patterns')
      .select('*')
      .eq('user_id', userId)
      .order('confidence', { ascending: false })
      .order('occurrences', { ascending: false });

    if (patternType !== 'all') {
      query = query.eq('pattern_type', patternType);
    }

    if (categoryFilter) {
      query = query.eq('category', categoryFilter);
    }

    const { data: patterns, error } = await query;

    if (error) {
      console.error('[getFinancialPatterns] Error:', error);
      return {
        success: false,
        error: `Erro ao buscar padrões: ${error.message}`,
      };
    }

    if (!patterns || patterns.length === 0) {
      return {
        success: true,
        patterns: [],
        message:
          'Ainda não tenho padrões financeiros aprendidos sobre você. Continue usando o app que vou aprender seus hábitos!',
      };
    }

    // Atualizar last_used_at para os padrões acessados
    const patternIds = patterns.map((p: any) => p.id);
    await supabase
      .from('user_financial_patterns')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', patternIds);

    // Agrupar padrões por tipo
    const grouped: Record<string, any[]> = {
      spending_habits: [],
      favorite_places: [],
      time_patterns: [],
      payment_cycle: [],
      category_trends: [],
      anomaly_thresholds: [],
    };

    patterns.forEach((pattern: any) => {
      const item = {
        key: pattern.pattern_key,
        category: pattern.category,
        value: pattern.pattern_value,
        confidence: pattern.confidence,
        occurrences: pattern.occurrences,
        last_updated: pattern.last_updated_at,
      };

      switch (pattern.pattern_type) {
        case 'spending_habit':
          grouped.spending_habits.push(item);
          break;
        case 'favorite_place':
          grouped.favorite_places.push(item);
          break;
        case 'time_pattern':
          grouped.time_patterns.push(item);
          break;
        case 'payment_cycle':
          grouped.payment_cycle.push(item);
          break;
        case 'category_trend':
          grouped.category_trends.push(item);
          break;
        case 'anomaly_threshold':
          grouped.anomaly_thresholds.push(item);
          break;
      }
    });

    // Formatar mensagem para o LLM usar nas respostas
    let message = `📊 Padrões Financeiros do Usuário:\n\n`;

    if (grouped.spending_habits.length > 0) {
      message += `💰 HÁBITOS DE GASTO:\n`;
      grouped.spending_habits.forEach((h) => {
        const val = h.value;
        message += `• ${h.category}: média R$ ${val.average_per_transaction?.toFixed(2) || '?'}/compra, R$ ${val.average_per_week?.toFixed(2) || '?'}/semana (${h.occurrences} transações)\n`;
      });
      message += '\n';
    }

    if (grouped.favorite_places.length > 0) {
      message += `🏪 LUGARES FAVORITOS:\n`;
      grouped.favorite_places.forEach((p) => {
        const val = p.value;
        message += `• ${val.establishment_name}: ${val.visit_count}x visitas, ticket médio R$ ${val.average_ticket?.toFixed(2) || '?'}\n`;
      });
      message += '\n';
    }

    if (grouped.time_patterns.length > 0) {
      message += `⏰ PADRÕES DE TEMPO:\n`;
      grouped.time_patterns.forEach((t) => {
        const val = t.value;
        if (t.key.includes('weekend_spender')) {
          message += `• Gasta ${val.weekend_increase_percent}% a mais nos fins de semana\n`;
        } else if (val.day_name) {
          message += `• ${val.day_name}: gasta ${val.above_average_by}% acima da média\n`;
        } else if (val.period_name) {
          message += `• Pico de gastos: ${val.period_name} (${val.percentage_of_total}% das transações)\n`;
        }
      });
      message += '\n';
    }

    if (grouped.payment_cycle.length > 0) {
      message += `📅 CICLO DE PAGAMENTO:\n`;
      grouped.payment_cycle.forEach((c) => {
        const val = c.value;
        message += `• Gasta ${val.first_week_percent}% do salário na primeira semana do mês\n`;
      });
      message += '\n';
    }

    if (grouped.category_trends.length > 0) {
      message += `📈 TENDÊNCIAS:\n`;
      grouped.category_trends.forEach((t) => {
        const val = t.value;
        const arrow = val.trend === 'increasing' ? '↗️' : '↘️';
        message += `• ${t.category}: ${arrow} ${Math.abs(val.change_percent)}% ${val.trend === 'increasing' ? 'aumento' : 'redução'}\n`;
      });
      message += '\n';
    }

    if (grouped.anomaly_thresholds.length > 0) {
      message += `⚠️ LIMIARES DE ANOMALIA (gastos acima são incomuns):\n`;
      grouped.anomaly_thresholds.slice(0, 5).forEach((a) => {
        const val = a.value;
        message += `• ${a.category}: R$ ${val.anomaly_threshold?.toFixed(2) || '?'} (média: R$ ${val.mean?.toFixed(2) || '?'})\n`;
      });
    }

    return {
      success: true,
      patterns: grouped,
      total_count: patterns.length,
      message: message.trim(),
    };
  } catch (error) {
    console.error('[getFinancialPatterns] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

async function checkIfAnomaly(
  supabase: any,
  userId: string,
  args: { category: string; amount: number }
) {
  try {
    const { category, amount } = args;

    console.log(
      `[checkIfAnomaly] Checking if R$ ${amount} in ${category} is anomaly`
    );

    // Buscar limiar de anomalia para a categoria
    const { data: pattern, error } = await supabase
      .from('user_financial_patterns')
      .select('pattern_value, confidence, occurrences')
      .eq('user_id', userId)
      .eq('pattern_type', 'anomaly_threshold')
      .eq('category', category)
      .single();

    if (error || !pattern) {
      // Sem dados suficientes para determinar anomalia
      return {
        success: true,
        is_anomaly: false,
        has_data: false,
        message: `Ainda não tenho dados suficientes sobre seus gastos em ${category} para detectar anomalias.`,
      };
    }

    const threshold = pattern.pattern_value.anomaly_threshold;
    const mean = pattern.pattern_value.mean;
    const stdDev = pattern.pattern_value.std_dev;

    const isAnomaly = amount > threshold;
    const percentAboveMean = mean > 0 ? ((amount - mean) / mean) * 100 : 0;

    let message: string;
    let severity: 'normal' | 'attention' | 'warning' | 'critical';

    if (!isAnomaly) {
      severity = 'normal';
      message = `✅ R$ ${amount.toFixed(2)} em ${category} está dentro do normal (média: R$ ${mean.toFixed(2)})`;
    } else if (percentAboveMean < 150) {
      severity = 'attention';
      message = `⚠️ R$ ${amount.toFixed(2)} em ${category} está ${Math.round(percentAboveMean)}% acima da sua média (R$ ${mean.toFixed(2)}). Gasto um pouco alto, mas não alarmante.`;
    } else if (percentAboveMean < 300) {
      severity = 'warning';
      message = `🟡 R$ ${amount.toFixed(2)} em ${category} está ${Math.round(percentAboveMean)}% acima da sua média! Isso é bem acima do seu padrão usual (média: R$ ${mean.toFixed(2)}).`;
    } else {
      severity = 'critical';
      message = `🔴 R$ ${amount.toFixed(2)} em ${category} está ${Math.round(percentAboveMean)}% acima da sua média! Este é um gasto muito fora do seu padrão (média: R$ ${mean.toFixed(2)}). Verifique se está correto.`;
    }

    return {
      success: true,
      is_anomaly: isAnomaly,
      has_data: true,
      severity,
      amount,
      category,
      threshold: Math.round(threshold * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      std_dev: Math.round(stdDev * 100) / 100,
      percent_above_mean: Math.round(percentAboveMean),
      sample_size: pattern.occurrences,
      confidence: pattern.confidence,
      message,
    };
  } catch (error) {
    console.error('[checkIfAnomaly] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

// ==================== RECATEGORIZAÇÃO DE EXPENSES ====================

async function recategorizeExpenses(
  supabase: any,
  userId: string,
  args: { force_all?: boolean }
) {
  try {
    const forceAll = args.force_all === true;

    console.log(
      `[recategorizeExpenses] Starting for user ${userId}, forceAll=${forceAll}`
    );

    // Buscar expenses que precisam ser recategorizadas
    let query = supabase
      .from('expenses')
      .select('id, establishment_name, amount, category, subcategory')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (!forceAll) {
      query = query.eq('category', 'outros');
    }

    const { data: expenses, error: fetchError } = await query;

    if (fetchError) {
      console.error(
        '[recategorizeExpenses] Error fetching expenses:',
        fetchError
      );
      return {
        success: false,
        error: `Erro ao buscar despesas: ${fetchError.message}`,
      };
    }

    if (!expenses || expenses.length === 0) {
      return {
        success: true,
        message: forceAll
          ? 'Nenhuma despesa encontrada para recategorizar.'
          : 'Não há despesas categorizadas como "outros" para recategorizar.',
        recategorized: 0,
      };
    }

    console.log(`[recategorizeExpenses] Found ${expenses.length} expenses`);

    // Recategorizar cada expense
    let recategorized = 0;
    let failed = 0;
    const results: Array<{
      name: string;
      oldCategory: string;
      newCategory: string;
      newSubcategory: string;
    }> = [];

    // Processar em lotes de 5
    const batchSize = 5;
    for (let i = 0; i < expenses.length; i += batchSize) {
      const batch = expenses.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (expense: any) => {
          try {
            const categorization = await categorizeWithWalts(
              expense.establishment_name,
              { amount: expense.amount }
            );

            if (
              categorization.category !== expense.category ||
              categorization.subcategory !== expense.subcategory
            ) {
              const { error: updateError } = await supabase
                .from('expenses')
                .update({
                  category: categorization.category,
                  subcategory: categorization.subcategory,
                })
                .eq('id', expense.id);

              if (updateError) {
                console.error(
                  `[recategorizeExpenses] Error updating expense ${expense.id}:`,
                  updateError
                );
                failed++;
                return;
              }

              recategorized++;
              results.push({
                name: expense.establishment_name,
                oldCategory: expense.category,
                newCategory: categorization.category,
                newSubcategory: categorization.subcategory,
              });

              console.log(
                `[recategorizeExpenses] Recategorized "${expense.establishment_name}": ${expense.category} -> ${categorization.category}`
              );
            }
          } catch (error) {
            console.error(
              `[recategorizeExpenses] Error processing expense ${expense.id}:`,
              error
            );
            failed++;
          }
        })
      );

      // Delay entre lotes
      if (i + batchSize < expenses.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `[recategorizeExpenses] Completed. Recategorized: ${recategorized}, Failed: ${failed}`
    );

    // Gerar mensagem de resumo
    let message = `✅ Recategorização concluída!\n`;
    message += `📊 Total analisado: ${expenses.length}\n`;
    message += `🔄 Recategorizados: ${recategorized}\n`;
    if (failed > 0) {
      message += `❌ Falhas: ${failed}\n`;
    }

    if (results.length > 0 && results.length <= 10) {
      message += `\nAlterações:\n`;
      results.forEach((r) => {
        message += `• ${r.name}: ${r.oldCategory} → ${r.newCategory}/${r.newSubcategory}\n`;
      });
    } else if (results.length > 10) {
      message += `\nPrimeiras 10 alterações:\n`;
      results.slice(0, 10).forEach((r) => {
        message += `• ${r.name}: ${r.oldCategory} → ${r.newCategory}/${r.newSubcategory}\n`;
      });
      message += `...e mais ${results.length - 10} alterações.`;
    }

    return {
      success: true,
      total: expenses.length,
      recategorized,
      failed,
      unchanged: expenses.length - recategorized - failed,
      results: results.slice(0, 20),
      message,
    };
  } catch (error) {
    console.error('[recategorizeExpenses] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

// ==================== CATEGORIZAÇÃO DE TRANSAÇÕES DO OPEN FINANCE ====================

async function categorizeOpenFinanceTransactions(
  supabase: any,
  userId: string,
  args: { days?: number; only_uncategorized?: boolean; account_name?: string }
) {
  try {
    const days = args.days || 30;
    const onlyUncategorized = args.only_uncategorized !== false;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    console.log(
      `[categorizeOpenFinanceTransactions] Starting for user ${userId}, days=${days}, onlyUncategorized=${onlyUncategorized}`
    );

    // Buscar contas do usuário
    let accountsQuery = supabase
      .from('pluggy_accounts')
      .select('id, name, type')
      .eq('user_id', userId)
      .in('type', ['BANK', 'CHECKING']);

    if (args.account_name) {
      accountsQuery = accountsQuery.ilike('name', `%${args.account_name}%`);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return {
        success: false,
        error: args.account_name
          ? `Conta "${args.account_name}" não encontrada`
          : 'Nenhuma conta bancária conectada via Open Finance',
      };
    }

    console.log(
      `[categorizeOpenFinanceTransactions] Found ${accounts.length} account(s)`
    );

    const accountIds = accounts.map((acc: any) => acc.id);

    // Buscar transações que precisam de categorização
    // Buscamos transações que têm expense_id (já foram sincronizadas como expenses)
    let txQuery = supabase
      .from('pluggy_transactions')
      .select('id, description, amount, date, expense_id, account_id')
      .in('account_id', accountIds)
      .eq('type', 'DEBIT')
      .gte('date', fromDateStr)
      .not('expense_id', 'is', null); // Apenas transações que já têm expense vinculado

    const { data: transactions, error: txError } = await txQuery;

    if (txError) {
      console.error(
        '[categorizeOpenFinanceTransactions] Error fetching transactions:',
        txError
      );
      return {
        success: false,
        error: `Erro ao buscar transações: ${txError.message}`,
      };
    }

    if (!transactions || transactions.length === 0) {
      return {
        success: true,
        message: `Nenhuma transação do Open Finance encontrada nos últimos ${days} dias que precise de categorização.`,
        categorized: 0,
      };
    }

    console.log(
      `[categorizeOpenFinanceTransactions] Found ${transactions.length} transactions with expenses`
    );

    // Buscar os expenses vinculados para verificar categorias
    const expenseIds = transactions
      .map((tx: any) => tx.expense_id)
      .filter((id: any) => id);

    let expensesQuery = supabase
      .from('expenses')
      .select('id, establishment_name, amount, category, subcategory')
      .in('id', expenseIds);

    if (onlyUncategorized) {
      expensesQuery = expensesQuery.eq('category', 'outros');
    }

    const { data: expenses, error: expensesError } = await expensesQuery;

    if (expensesError) {
      console.error(
        '[categorizeOpenFinanceTransactions] Error fetching expenses:',
        expensesError
      );
      return {
        success: false,
        error: `Erro ao buscar expenses: ${expensesError.message}`,
      };
    }

    if (!expenses || expenses.length === 0) {
      return {
        success: true,
        message: onlyUncategorized
          ? `Todas as transações do Open Finance nos últimos ${days} dias já estão categorizadas! 🎉`
          : `Nenhuma transação encontrada para recategorizar.`,
        categorized: 0,
      };
    }

    console.log(
      `[categorizeOpenFinanceTransactions] Found ${expenses.length} expenses to categorize`
    );

    // Categorizar cada expense
    let categorized = 0;
    let failed = 0;
    const results: Array<{
      name: string;
      oldCategory: string;
      newCategory: string;
      newSubcategory: string;
    }> = [];

    // Processar em lotes de 5
    const batchSize = 5;
    for (let i = 0; i < expenses.length; i += batchSize) {
      const batch = expenses.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (expense: any) => {
          try {
            const categorization = await categorizeWithWalts(
              expense.establishment_name,
              { amount: expense.amount }
            );

            if (
              categorization.category !== expense.category ||
              categorization.subcategory !== expense.subcategory
            ) {
              const { error: updateError } = await supabase
                .from('expenses')
                .update({
                  category: categorization.category,
                  subcategory: categorization.subcategory,
                })
                .eq('id', expense.id);

              if (updateError) {
                console.error(
                  `[categorizeOpenFinanceTransactions] Error updating expense ${expense.id}:`,
                  updateError
                );
                failed++;
                return;
              }

              categorized++;
              results.push({
                name: expense.establishment_name,
                oldCategory: expense.category,
                newCategory: categorization.category,
                newSubcategory: categorization.subcategory,
              });

              console.log(
                `[categorizeOpenFinanceTransactions] Categorized "${expense.establishment_name}": ${expense.category} -> ${categorization.category}`
              );
            }
          } catch (error) {
            console.error(
              `[categorizeOpenFinanceTransactions] Error processing expense ${expense.id}:`,
              error
            );
            failed++;
          }
        })
      );

      // Delay entre lotes
      if (i + batchSize < expenses.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `[categorizeOpenFinanceTransactions] Completed. Categorized: ${categorized}, Failed: ${failed}`
    );

    // Gerar mensagem de resumo
    const accountNames = accounts.map((a: any) => a.name).join(', ');
    let message = `✅ Categorização do Open Finance concluída!\n`;
    message += `🏦 Contas: ${accountNames}\n`;
    message += `📅 Período: últimos ${days} dias\n`;
    message += `📊 Transações analisadas: ${expenses.length}\n`;
    message += `🔄 Categorizadas: ${categorized}\n`;
    if (failed > 0) {
      message += `❌ Falhas: ${failed}\n`;
    }

    if (results.length > 0 && results.length <= 10) {
      message += `\nAlterações:\n`;
      results.forEach((r) => {
        message += `• ${r.name}: ${r.oldCategory} → ${r.newCategory}/${r.newSubcategory}\n`;
      });
    } else if (results.length > 10) {
      message += `\nPrimeiras 10 alterações:\n`;
      results.slice(0, 10).forEach((r) => {
        message += `• ${r.name}: ${r.oldCategory} → ${r.newCategory}/${r.newSubcategory}\n`;
      });
      message += `...e mais ${results.length - 10} alterações.`;
    }

    return {
      success: true,
      accounts: accountNames,
      period_days: days,
      total: expenses.length,
      categorized,
      failed,
      unchanged: expenses.length - categorized - failed,
      results: results.slice(0, 20),
      message,
    };
  } catch (error) {
    console.error('[categorizeOpenFinanceTransactions] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

// ==================== CATEGORIZAR EXTRATO SEM REGISTRAR ====================
// Esta funcao APENAS categoriza transacoes do extrato na tabela transaction_categories
// NAO cria expenses, NAO afeta o saldo do app
// Use quando o usuario pedir para "categorizar" ou "classificar" transacoes do extrato

async function categorizeExtractOnly(
  supabase: any,
  userId: string,
  args: {
    days?: number;
    account_name?: string;
    transaction_ids?: string[];
    only_uncategorized?: boolean;
  }
) {
  try {
    const days = args.days || 30;
    const onlyUncategorized = args.only_uncategorized !== false;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    console.log(
      `[categorizeExtractOnly] Starting for user ${userId}, days=${days}, onlyUncategorized=${onlyUncategorized}`
    );

    // Buscar contas do usuario
    let accountsQuery = supabase
      .from('pluggy_accounts')
      .select('id, name, type')
      .eq('user_id', userId);

    if (args.account_name) {
      accountsQuery = accountsQuery.ilike('name', `%${args.account_name}%`);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return {
        success: false,
        error: args.account_name
          ? `Conta "${args.account_name}" nao encontrada`
          : 'Nenhuma conta bancaria conectada via Open Finance',
      };
    }

    console.log(`[categorizeExtractOnly] Found ${accounts.length} account(s)`);
    const accountIds = accounts.map((acc: any) => acc.id);

    // Buscar transacoes do extrato
    let txQuery = supabase
      .from('pluggy_transactions')
      .select('id, description, amount, type, date, account_id, pluggy_accounts(name)')
      .in('account_id', accountIds)
      .gte('date', fromDateStr)
      .eq('type', 'DEBIT') // Apenas saidas
      .order('date', { ascending: false });

    // Se especificou IDs especificos
    if (args.transaction_ids && args.transaction_ids.length > 0) {
      txQuery = txQuery.in('id', args.transaction_ids);
    }

    const { data: transactions, error: txError } = await txQuery;

    if (txError) {
      console.error('[categorizeExtractOnly] Error fetching transactions:', txError);
      return { success: false, error: 'Erro ao buscar transacoes do extrato' };
    }

    if (!transactions || transactions.length === 0) {
      return {
        success: true,
        message: `Nenhuma transacao de saida encontrada nos ultimos ${days} dias.`,
        categorized: 0,
        already_categorized: 0,
      };
    }

    console.log(`[categorizeExtractOnly] Found ${transactions.length} transactions`);

    // Buscar categorias ja existentes para essas transacoes
    const txIds = transactions.map((tx: any) => tx.id);
    const { data: existingCategories } = await supabase
      .from('transaction_categories')
      .select('transaction_id, category')
      .eq('user_id', userId)
      .in('transaction_id', txIds);

    const categorizedMap = new Map(
      (existingCategories || []).map((c: any) => [c.transaction_id, c.category])
    );

    console.log(`[categorizeExtractOnly] ${categorizedMap.size} already categorized`);

    // Filtrar transacoes que precisam de categorizacao
    let toProcess = transactions;
    if (onlyUncategorized) {
      toProcess = transactions.filter((tx: any) => !categorizedMap.has(tx.id));
    }

    if (toProcess.length === 0) {
      return {
        success: true,
        message: `Todas as ${transactions.length} transacoes ja estao categorizadas!`,
        categorized: 0,
        already_categorized: transactions.length,
      };
    }

    console.log(`[categorizeExtractOnly] Processing ${toProcess.length} transactions`);

    // Categorizar e salvar na tabela transaction_categories
    let categorized = 0;
    let failed = 0;
    const results: Array<{
      description: string;
      amount: number;
      category: string;
      is_fixed: boolean;
    }> = [];

    // Processar em batches de 5
    const batchSize = 5;
    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (tx: any) => {
          try {
            // Categorizar com IA
            const categorization = await categorizeWithWalts(tx.description, {
              amount: Math.abs(tx.amount),
            });

            // Determinar se e custo fixo
            const isFixed = ['moradia', 'saude', 'educacao'].includes(categorization.category);

            // Salvar na tabela transaction_categories (upsert)
            const { error: upsertError } = await supabase
              .from('transaction_categories')
              .upsert({
                user_id: userId,
                transaction_id: tx.id,
                category: categorization.category,
                subcategory: categorization.subcategory,
                is_fixed_cost: isFixed,
                categorized_by: 'walts',
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'user_id,transaction_id'
              });

            if (upsertError) {
              console.error(`[categorizeExtractOnly] Error saving category for ${tx.id}:`, upsertError);
              failed++;
            } else {
              categorized++;
              results.push({
                description: tx.description,
                amount: Math.abs(tx.amount),
                category: categorization.category,
                is_fixed: isFixed,
              });
            }
          } catch (error) {
            console.error(`[categorizeExtractOnly] Error processing ${tx.id}:`, error);
            failed++;
          }
        })
      );
    }

    console.log(`[categorizeExtractOnly] Completed. Categorized: ${categorized}, Failed: ${failed}`);

    // Agrupar por categoria para resumo
    const summary: { [key: string]: { count: number; total: number } } = {};
    for (const r of results) {
      if (!summary[r.category]) {
        summary[r.category] = { count: 0, total: 0 };
      }
      summary[r.category].count++;
      summary[r.category].total += r.amount;
    }

    // Calcular totais fixos vs variaveis
    const fixedTotal = results.filter(r => r.is_fixed).reduce((sum, r) => sum + r.amount, 0);
    const variableTotal = results.filter(r => !r.is_fixed).reduce((sum, r) => sum + r.amount, 0);

    // Formatar mensagem
    let message = `Categorizacao do extrato concluida (SEM registrar no app):\n\n`;
    message += `Total analisado: ${toProcess.length} transacoes\n`;
    message += `Categorizadas: ${categorized}\n`;
    message += `Ja categorizadas anteriormente: ${categorizedMap.size}\n\n`;
    message += `**Custos Fixos:** R$ ${fixedTotal.toFixed(2)}\n`;
    message += `**Custos Variaveis:** R$ ${variableTotal.toFixed(2)}\n\n`;
    message += `**Por categoria:**\n`;
    for (const [cat, data] of Object.entries(summary)) {
      message += `- ${cat}: ${data.count}x = R$ ${data.total.toFixed(2)}\n`;
    }

    if (results.length > 0) {
      message += `\n**Detalhes:**\n`;
      for (const r of results.slice(0, 10)) {
        const type = r.is_fixed ? '[FIXO]' : '[VAR]';
        message += `- ${type} ${r.description.substring(0, 30)}: R$ ${r.amount.toFixed(2)} (${r.category})\n`;
      }
      if (results.length > 10) {
        message += `... e mais ${results.length - 10} transacoes\n`;
      }
    }

    message += `\nEssas transacoes NAO foram registradas como gastos no app. O saldo do app nao foi alterado.`;

    return {
      success: true,
      message,
      categorized,
      already_categorized: categorizedMap.size,
      failed,
      fixed_total: fixedTotal,
      variable_total: variableTotal,
      summary,
      results: results.slice(0, 20),
    };
  } catch (error: any) {
    console.error('[categorizeExtractOnly] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido',
    };
  }
}

// ==================== ACESSO COMPLETO AOS DADOS DO POCKET ====================

// Categorias consideradas gastos fixos
const FIXED_COST_CATEGORIES = ['moradia', 'saude', 'educacao'];

// Categorias consideradas gastos variáveis
const VARIABLE_COST_CATEGORIES = [
  'alimentacao',
  'transporte',
  'lazer',
  'vestuario',
  'beleza',
  'eletronicos',
  'delivery',
  'outros',
];

async function getPocketData(
  supabase: any,
  userId: string,
  args: { data_type: string; days?: number; category?: string }
) {
  try {
    const days = args.days || 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    console.log(
      `[getPocketData] Fetching ${args.data_type} for user ${userId}, days=${days}`
    );

    const result: any = {
      success: true,
      data_type: args.data_type,
      period_days: days,
    };

    // Helper para buscar expenses
    const fetchExpenses = async (categoryFilter?: string[]) => {
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .gte('date', fromDateStr)
        .order('date', { ascending: false });

      if (categoryFilter && categoryFilter.length > 0) {
        query = query.in('category', categoryFilter);
      } else if (args.category) {
        query = query.eq('category', args.category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    };

    // Helper para buscar perfil
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    };

    // Helper para buscar cartões de crédito
    const fetchCreditCards = async () => {
      const { data, error } = await supabase
        .from('pluggy_accounts')
        .select('*, pluggy_items!inner(connector_name)')
        .eq('user_id', userId)
        .eq('type', 'CREDIT');

      if (error) throw error;
      return (data || []).map((card: any) => ({
        id: card.id,
        name: card.name,
        bank: card.pluggy_items?.connector_name || 'Desconhecido',
        number: card.number,
        credit_limit: card.credit_limit,
        available_limit: card.available_credit_limit,
        balance: card.balance,
        used: card.credit_limit
          ? card.credit_limit - (card.available_credit_limit || 0)
          : null,
        usage_percent: card.credit_limit
          ? Math.round(
              ((card.credit_limit - (card.available_credit_limit || 0)) /
                card.credit_limit) *
                100
            )
          : null,
      }));
    };

    // Helper para buscar contas bancárias
    const fetchBankAccounts = async () => {
      const { data, error } = await supabase
        .from('pluggy_accounts')
        .select(
          '*, pluggy_items!inner(connector_name, status, last_updated_at)'
        )
        .eq('user_id', userId)
        .eq('type', 'BANK');

      if (error) throw error;
      return (data || []).map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        bank: acc.pluggy_items?.connector_name || 'Desconhecido',
        number: acc.number,
        balance: acc.balance,
        currency: acc.currency_code,
        status: acc.pluggy_items?.status,
        last_sync: acc.last_sync_at,
      }));
    };

    // Helper para buscar bancos conectados
    const fetchConnectedBanks = async () => {
      const { data, error } = await supabase
        .from('pluggy_items')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        bank_name: item.connector_name,
        connector_id: item.connector_id,
        status: item.status,
        last_updated: item.last_updated_at,
        error_message: item.error_message,
        created_at: item.created_at,
      }));
    };

    // Helper para buscar orçamentos
    const fetchBudgets = async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      return data || [];
    };

    // Helper para buscar histórico de análises
    const fetchAnalysisHistory = async () => {
      const { data, error } = await supabase
        .from('walts_analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []).map((a: any) => ({
        id: a.id,
        type: a.analysis_type,
        content_preview: a.content?.substring(0, 200) + '...',
        created_at: a.created_at,
      }));
    };

    // Helper para buscar transações do cartão de crédito
    const fetchCreditCardTransactions = async () => {
      // Primeiro buscar as contas de cartão
      const { data: cards, error: cardsError } = await supabase
        .from('pluggy_accounts')
        .select('id, name')
        .eq('user_id', userId)
        .eq('type', 'CREDIT');

      if (cardsError) throw cardsError;
      if (!cards || cards.length === 0) {
        return { cards: [], transactions: [] };
      }

      const cardIds = cards.map((c: any) => c.id);

      // Buscar transações dos cartões
      const { data: transactions, error: txError } = await supabase
        .from('pluggy_transactions')
        .select('*, pluggy_accounts!inner(name)')
        .in('account_id', cardIds)
        .gte('date', fromDateStr)
        .order('date', { ascending: false });

      if (txError) throw txError;

      return {
        cards: cards,
        transactions: (transactions || []).map((tx: any) => ({
          id: tx.id,
          card_name: tx.pluggy_accounts?.name,
          description: tx.description,
          amount: Math.abs(tx.amount),
          date: tx.date,
          type: tx.type,
          category: tx.category,
          status: tx.status,
        })),
      };
    };

    // Processar baseado no tipo de dados solicitado
    if (args.data_type === 'expenses' || args.data_type === 'all') {
      const expenses = await fetchExpenses();
      result.expenses = {
        total: expenses.length,
        total_amount: expenses.reduce(
          (sum: number, e: any) => sum + parseFloat(e.amount),
          0
        ),
        items: expenses.slice(0, 50).map((e: any) => ({
          id: e.id,
          establishment: e.establishment_name,
          amount: parseFloat(e.amount),
          date: e.date,
          category: e.category,
          subcategory: e.subcategory,
          has_receipt: !!e.image_url,
          notes: e.notes,
        })),
      };
    }

    if (args.data_type === 'profile' || args.data_type === 'all') {
      const profile = await fetchProfile();
      result.profile = profile
        ? {
            name: profile.name,
            monthly_salary: profile.monthly_salary,
            salary_payment_day: profile.salary_payment_day,
            income_source: profile.income_source,
            income_cards: profile.income_cards,
            debt_notifications_enabled: profile.debt_notifications_enabled,
          }
        : null;
    }

    if (args.data_type === 'credit_cards' || args.data_type === 'all') {
      result.credit_cards = await fetchCreditCards();
    }

    if (
      args.data_type === 'credit_card_transactions' ||
      args.data_type === 'all'
    ) {
      const ccData = await fetchCreditCardTransactions();
      result.credit_card_transactions = {
        cards: ccData.cards.length,
        total_transactions: ccData.transactions.length,
        total_amount: ccData.transactions
          .filter((t: any) => t.type === 'DEBIT')
          .reduce((sum: number, t: any) => sum + t.amount, 0),
        transactions: ccData.transactions.slice(0, 50),
      };
    }

    if (args.data_type === 'bank_accounts' || args.data_type === 'all') {
      result.bank_accounts = await fetchBankAccounts();
    }

    if (args.data_type === 'connected_banks' || args.data_type === 'all') {
      result.connected_banks = await fetchConnectedBanks();
    }

    if (args.data_type === 'budgets' || args.data_type === 'all') {
      const budgets = await fetchBudgets();
      result.budgets = {
        total: budgets.length,
        items: budgets.map((b: any) => ({
          id: b.id,
          category: b.category_id,
          amount: parseFloat(b.amount),
          period: b.period_type,
          notifications: b.notifications_enabled,
          start_date: b.start_date,
        })),
      };
    }

    if (args.data_type === 'analysis_history' || args.data_type === 'all') {
      result.analysis_history = await fetchAnalysisHistory();
    }

    if (args.data_type === 'fixed_costs' || args.data_type === 'all') {
      const fixedExpenses = await fetchExpenses(FIXED_COST_CATEGORIES);
      result.fixed_costs = {
        total: fixedExpenses.length,
        total_amount: fixedExpenses.reduce(
          (sum: number, e: any) => sum + parseFloat(e.amount),
          0
        ),
        by_category: FIXED_COST_CATEGORIES.reduce((acc: any, cat: string) => {
          const catExpenses = fixedExpenses.filter(
            (e: any) => e.category === cat
          );
          acc[cat] = {
            count: catExpenses.length,
            amount: catExpenses.reduce(
              (sum: number, e: any) => sum + parseFloat(e.amount),
              0
            ),
          };
          return acc;
        }, {}),
        items: fixedExpenses.slice(0, 30).map((e: any) => ({
          establishment: e.establishment_name,
          amount: parseFloat(e.amount),
          date: e.date,
          category: e.category,
          subcategory: e.subcategory,
        })),
      };
    }

    if (args.data_type === 'variable_costs' || args.data_type === 'all') {
      const variableExpenses = await fetchExpenses(VARIABLE_COST_CATEGORIES);
      result.variable_costs = {
        total: variableExpenses.length,
        total_amount: variableExpenses.reduce(
          (sum: number, e: any) => sum + parseFloat(e.amount),
          0
        ),
        by_category: VARIABLE_COST_CATEGORIES.reduce(
          (acc: any, cat: string) => {
            const catExpenses = variableExpenses.filter(
              (e: any) => e.category === cat
            );
            acc[cat] = {
              count: catExpenses.length,
              amount: catExpenses.reduce(
                (sum: number, e: any) => sum + parseFloat(e.amount),
                0
              ),
            };
            return acc;
          },
          {}
        ),
        items: variableExpenses.slice(0, 30).map((e: any) => ({
          establishment: e.establishment_name,
          amount: parseFloat(e.amount),
          date: e.date,
          category: e.category,
          subcategory: e.subcategory,
        })),
      };
    }

    if (args.data_type === 'summary' || args.data_type === 'all') {
      // Buscar todos os dados para o resumo
      const [allExpenses, profile, creditCards] = await Promise.all([
        fetchExpenses(),
        fetchProfile(),
        fetchCreditCards(),
      ]);

      const totalExpenses = allExpenses.reduce(
        (sum: number, e: any) => sum + parseFloat(e.amount),
        0
      );
      const salary = profile?.monthly_salary || 0;

      // Agrupar por categoria
      const byCategory = allExpenses.reduce((acc: any, e: any) => {
        const cat = e.category || 'outros';
        if (!acc[cat]) acc[cat] = { count: 0, amount: 0 };
        acc[cat].count++;
        acc[cat].amount += parseFloat(e.amount);
        return acc;
      }, {});

      // Calcular gastos fixos e variáveis
      const fixedAmount = allExpenses
        .filter((e: any) => PRELOAD_FIXED_CATEGORIES.includes(e.category))
        .reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);

      const variableAmount = allExpenses
        .filter((e: any) => VARIABLE_COST_CATEGORIES.includes(e.category))
        .reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);

      // Total usado nos cartões
      const totalCreditUsed = creditCards.reduce(
        (sum: number, c: any) => sum + (c.used || 0),
        0
      );

      result.summary = {
        period: `Últimos ${days} dias`,
        salary: salary,
        total_expenses: totalExpenses,
        remaining: salary - totalExpenses,
        remaining_percent: salary
          ? Math.round(((salary - totalExpenses) / salary) * 100)
          : null,
        fixed_costs: fixedAmount,
        variable_costs: variableAmount,
        expenses_count: allExpenses.length,
        credit_cards_count: creditCards.length,
        credit_used: totalCreditUsed,
        by_category: byCategory,
        top_categories: Object.entries(byCategory)
          .sort((a: any, b: any) => b[1].amount - a[1].amount)
          .slice(0, 5)
          .map(([cat, data]: any) => ({
            category: cat,
            amount: data.amount,
            count: data.count,
            percent: totalExpenses
              ? Math.round((data.amount / totalExpenses) * 100)
              : 0,
          })),
      };
    }

    // Gerar mensagem de resumo
    let message = '';
    if (args.data_type === 'expenses') {
      message = `📋 Encontrei ${result.expenses.total} comprovantes/gastos nos últimos ${days} dias, totalizando R$ ${result.expenses.total_amount.toFixed(2)}.`;
    } else if (args.data_type === 'profile') {
      if (result.profile) {
        message = `👤 Perfil: ${result.profile.name || 'Sem nome'}, Salário: R$ ${result.profile.monthly_salary?.toFixed(2) || 'não informado'}, Dia de pagamento: ${result.profile.salary_payment_day || 'não informado'}`;
      } else {
        message = '👤 Perfil não encontrado ou incompleto.';
      }
    } else if (args.data_type === 'credit_cards') {
      message = `💳 Encontrei ${result.credit_cards.length} cartão(ões) de crédito conectado(s).`;
    } else if (args.data_type === 'credit_card_transactions') {
      message = `💳 Encontrei ${result.credit_card_transactions.total_transactions} transações de cartão de crédito, totalizando R$ ${result.credit_card_transactions.total_amount.toFixed(2)}.`;
    } else if (args.data_type === 'bank_accounts') {
      message = `🏦 Encontrei ${result.bank_accounts.length} conta(s) bancária(s) conectada(s).`;
    } else if (args.data_type === 'connected_banks') {
      message = `🔗 Encontrei ${result.connected_banks.length} banco(s) conectado(s) via Open Finance.`;
    } else if (args.data_type === 'budgets') {
      message = `📊 Encontrei ${result.budgets.total} orçamento(s) configurado(s).`;
    } else if (args.data_type === 'analysis_history') {
      message = `📈 Encontrei ${result.analysis_history.length} análise(s) Raio-X no histórico.`;
    } else if (args.data_type === 'fixed_costs') {
      message = `🏠 Gastos fixos nos últimos ${days} dias: ${result.fixed_costs.total} itens, totalizando R$ ${result.fixed_costs.total_amount.toFixed(2)}.`;
    } else if (args.data_type === 'variable_costs') {
      message = `🛒 Gastos variáveis nos últimos ${days} dias: ${result.variable_costs.total} itens, totalizando R$ ${result.variable_costs.total_amount.toFixed(2)}.`;
    } else if (args.data_type === 'summary') {
      const s = result.summary;
      message = `📊 RESUMO FINANCEIRO (últimos ${days} dias):\n`;
      message += `💰 Salário: R$ ${s.salary?.toFixed(2) || 'N/A'}\n`;
      message += `💸 Total gasto: R$ ${s.total_expenses.toFixed(2)}\n`;
      message += `📈 Restante: R$ ${s.remaining.toFixed(2)} (${s.remaining_percent || 0}%)\n`;
      message += `🏠 Gastos fixos: R$ ${s.fixed_costs.toFixed(2)}\n`;
      message += `🛒 Gastos variáveis: R$ ${s.variable_costs.toFixed(2)}\n`;
      message += `📝 Total de comprovantes: ${s.expenses_count}\n`;
      if (s.credit_cards_count > 0) {
        message += `💳 Cartões: ${s.credit_cards_count}, usado: R$ ${s.credit_used.toFixed(2)}`;
      }
    } else if (args.data_type === 'all') {
      message = `✅ Dados completos do Pocket carregados com sucesso.`;
    }

    result.message = message;

    console.log(`[getPocketData] Success:`, message);
    return result;
  } catch (error) {
    console.error('[getPocketData] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro ao buscar dados do Pocket',
    };
  }
}

// ==================== GERENCIAMENTO DE EXPENSES ====================

async function deleteExpense(
  supabase: any,
  userId: string,
  args: {
    expense_id?: string;
    expense_ids?: string[];
    delete_all?: boolean;
    source_filter?: 'all' | 'manual' | 'import';
    confirm?: boolean;
  }
) {
  try {
    const sourceFilter = args.source_filter || 'all';

    console.log(
      `[deleteExpense] Request for user ${userId}, delete_all=${args.delete_all}, source=${sourceFilter}, confirm=${args.confirm}`
    );

    // ========== DELETAR TODOS ==========
    if (args.delete_all) {
      // Buscar todos os gastos que serão deletados
      let query = supabase
        .from('expenses')
        .select('id, establishment_name, amount, date, source, image_url')
        .eq('user_id', userId);

      // Aplicar filtro de origem
      if (sourceFilter === 'manual') {
        query = query.or('source.is.null,source.eq.manual');
      } else if (sourceFilter === 'import') {
        query = query.eq('source', 'import');
      }

      const { data: expenses, error: fetchError } = await query;

      if (fetchError) {
        return { success: false, error: 'Erro ao buscar gastos para exclusao.' };
      }

      if (!expenses || expenses.length === 0) {
        return { success: true, message: 'Nenhum gasto encontrado para excluir.', deleted_count: 0 };
      }

      // Se não confirmou, mostrar resumo
      if (!args.confirm) {
        const total = expenses.reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);
        const sourceLabel = sourceFilter === 'manual' ? 'manuais' : sourceFilter === 'import' ? 'importados' : '';
        return {
          success: true,
          action: 'confirm_required',
          count: expenses.length,
          total_amount: total,
          message: `Voce quer deletar ${expenses.length} gastos ${sourceLabel}?\n\nTotal: R$ ${total.toFixed(2)}\n\nConfirme para prosseguir.`,
        };
      }

      // Deletar imagens do storage
      for (const exp of expenses) {
        if (exp.image_url) {
          try {
            const urlParts = exp.image_url.split('/');
            const bucketIndex = urlParts.findIndex((p: string) => p === 'receipts');
            if (bucketIndex >= 0) {
              const filePath = urlParts.slice(bucketIndex + 1).join('/');
              await supabase.storage.from('receipts').remove([filePath]);
            }
          } catch (e) { /* ignore */ }
        }
      }

      // Remover referências em pluggy_transactions
      const expenseIds = expenses.map((e: any) => e.id);
      await supabase
        .from('pluggy_transactions')
        .update({ expense_id: null })
        .in('expense_id', expenseIds);

      // Deletar todos
      let deleteQuery = supabase
        .from('expenses')
        .delete()
        .eq('user_id', userId);

      if (sourceFilter === 'manual') {
        deleteQuery = deleteQuery.or('source.is.null,source.eq.manual');
      } else if (sourceFilter === 'import') {
        deleteQuery = deleteQuery.eq('source', 'import');
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        return { success: false, error: `Erro ao excluir: ${deleteError.message}` };
      }

      const sourceLabel = sourceFilter === 'manual' ? 'manuais' : sourceFilter === 'import' ? 'importados' : '';
      return {
        success: true,
        deleted_count: expenses.length,
        message: `${expenses.length} gastos ${sourceLabel} excluidos com sucesso!`,
      };
    }

    // ========== DELETAR MÚLTIPLOS POR IDS ==========
    if (args.expense_ids && args.expense_ids.length > 0) {
      const { data: expenses, error: fetchError } = await supabase
        .from('expenses')
        .select('id, establishment_name, amount, date, image_url')
        .eq('user_id', userId)
        .in('id', args.expense_ids);

      if (fetchError || !expenses || expenses.length === 0) {
        return { success: false, error: 'Gastos nao encontrados.' };
      }

      if (!args.confirm) {
        const total = expenses.reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);
        return {
          success: true,
          action: 'confirm_required',
          count: expenses.length,
          total_amount: total,
          expenses: expenses.map((e: any) => ({
            id: e.id,
            name: e.establishment_name,
            amount: parseFloat(e.amount),
          })),
          message: `Voce quer deletar ${expenses.length} gastos?\n\nTotal: R$ ${total.toFixed(2)}\n\nConfirme para prosseguir.`,
        };
      }

      // Deletar imagens
      for (const exp of expenses) {
        if (exp.image_url) {
          try {
            const urlParts = exp.image_url.split('/');
            const bucketIndex = urlParts.findIndex((p: string) => p === 'receipts');
            if (bucketIndex >= 0) {
              const filePath = urlParts.slice(bucketIndex + 1).join('/');
              await supabase.storage.from('receipts').remove([filePath]);
            }
          } catch (e) { /* ignore */ }
        }
      }

      // Remover referências
      await supabase
        .from('pluggy_transactions')
        .update({ expense_id: null })
        .in('expense_id', args.expense_ids);

      // Deletar
      const { error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .eq('user_id', userId)
        .in('id', args.expense_ids);

      if (deleteError) {
        return { success: false, error: `Erro ao excluir: ${deleteError.message}` };
      }

      return {
        success: true,
        deleted_count: expenses.length,
        message: `${expenses.length} gastos excluidos com sucesso!`,
      };
    }

    // ========== DELETAR UM ÚNICO ==========
    if (!args.expense_id) {
      return { success: false, error: 'Especifique expense_id, expense_ids ou delete_all.' };
    }

    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', args.expense_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !expense) {
      return { success: false, error: 'Gasto nao encontrado.' };
    }

    if (!args.confirm) {
      return {
        success: true,
        action: 'confirm_required',
        expense: {
          id: expense.id,
          establishment: expense.establishment_name,
          amount: parseFloat(expense.amount),
          date: expense.date,
          category: expense.category,
        },
        message: `Confirme a exclusao:\n\n${expense.establishment_name}\nR$ ${parseFloat(expense.amount).toFixed(2)}\n${expense.date}`,
      };
    }

    // Deletar imagem
    if (expense.image_url) {
      try {
        const urlParts = expense.image_url.split('/');
        const bucketIndex = urlParts.findIndex((p: string) => p === 'receipts');
        if (bucketIndex >= 0) {
          const filePath = urlParts.slice(bucketIndex + 1).join('/');
          await supabase.storage.from('receipts').remove([filePath]);
        }
      } catch (e) { /* ignore */ }
    }

    // Remover referência
    await supabase
      .from('pluggy_transactions')
      .update({ expense_id: null })
      .eq('expense_id', args.expense_id);

    // Deletar
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', args.expense_id)
      .eq('user_id', userId);

    if (deleteError) {
      return { success: false, error: `Erro ao excluir: ${deleteError.message}` };
    }

    return {
      success: true,
      deleted_count: 1,
      deleted: {
        id: expense.id,
        establishment: expense.establishment_name,
        amount: parseFloat(expense.amount),
      },
      message: `✅ Gasto excluído com sucesso!\n\n🗑️ ${expense.establishment_name} - R$ ${parseFloat(expense.amount).toFixed(2)}`,
    };
  } catch (error) {
    console.error('[deleteExpense] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro ao excluir gasto',
    };
  }
}

async function updateExpense(
  supabase: any,
  userId: string,
  args: {
    expense_id: string;
    establishment_name?: string;
    amount?: number;
    category?: string;
    subcategory?: string;
    date?: string;
    notes?: string;
  }
) {
  try {
    console.log(`[updateExpense] Request for expense ${args.expense_id}`);

    // Verificar se o expense existe e pertence ao usuário
    const { data: existing, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', args.expense_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: 'Gasto não encontrado ou você não tem permissão para editá-lo.',
      };
    }

    // Montar objeto de atualização apenas com campos fornecidos
    const updates: any = {};
    if (args.establishment_name)
      updates.establishment_name = args.establishment_name;
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.category) updates.category = args.category;
    if (args.subcategory) updates.subcategory = args.subcategory;
    if (args.date) updates.date = args.date;
    if (args.notes !== undefined) updates.notes = args.notes;

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        error: 'Nenhum campo para atualizar foi fornecido.',
      };
    }

    // Atualizar o expense
    const { data: updated, error: updateError } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', args.expense_id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('[updateExpense] Update error:', updateError);
      return {
        success: false,
        error: `Erro ao atualizar: ${updateError.message}`,
      };
    }

    console.log(
      `[updateExpense] Successfully updated expense ${args.expense_id}`
    );

    // Gerar mensagem de mudanças
    const changes: string[] = [];
    if (
      args.establishment_name &&
      args.establishment_name !== existing.establishment_name
    ) {
      changes.push(
        `Nome: ${existing.establishment_name} → ${args.establishment_name}`
      );
    }
    if (
      args.amount !== undefined &&
      args.amount !== parseFloat(existing.amount)
    ) {
      changes.push(
        `Valor: R$ ${parseFloat(existing.amount).toFixed(2)} → R$ ${args.amount.toFixed(2)}`
      );
    }
    if (args.category && args.category !== existing.category) {
      changes.push(`Categoria: ${existing.category} → ${args.category}`);
    }
    if (args.subcategory && args.subcategory !== existing.subcategory) {
      changes.push(
        `Subcategoria: ${existing.subcategory} → ${args.subcategory}`
      );
    }
    if (args.date && args.date !== existing.date) {
      changes.push(`Data: ${existing.date} → ${args.date}`);
    }
    if (args.notes !== undefined && args.notes !== existing.notes) {
      changes.push(`Notas: ${args.notes || '(removidas)'}`);
    }

    return {
      success: true,
      updated: {
        id: updated.id,
        establishment: updated.establishment_name,
        amount: parseFloat(updated.amount),
        category: updated.category,
        subcategory: updated.subcategory,
        date: updated.date,
      },
      changes,
      message: `✅ Gasto atualizado com sucesso!\n\n📝 Alterações:\n${changes.map((c) => `• ${c}`).join('\n')}`,
    };
  } catch (error) {
    console.error('[updateExpense] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro ao atualizar gasto',
    };
  }
}

// ==================== GERENCIAMENTO DE ORÇAMENTOS ====================

async function deleteBudget(
  supabase: any,
  userId: string,
  args: { category_id: string; confirm?: boolean }
) {
  try {
    console.log(
      `[deleteBudget] Request for user ${userId}, category ${args.category_id}, confirm=${args.confirm}`
    );

    // Buscar o orçamento
    const { data: budget, error: fetchError } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', args.category_id)
      .single();

    if (fetchError || !budget) {
      return {
        success: false,
        error: `Orçamento para categoria "${args.category_id}" não encontrado.`,
      };
    }

    // Se não confirmou, mostrar para confirmação
    if (!args.confirm) {
      return {
        success: true,
        action: 'confirm_required',
        budget: {
          id: budget.id,
          category: budget.category_id,
          amount: parseFloat(budget.amount),
          period: budget.period_type,
        },
        message: `⚠️ Confirme a exclusão do orçamento:\n\n📊 **${budget.category_id}**\n💰 Limite: R$ ${parseFloat(budget.amount).toFixed(2)}\n📅 Período: ${budget.period_type}\n\nPara confirmar, peça ao usuário para confirmar a exclusão.`,
      };
    }

    // Deletar o orçamento
    const { error: deleteError } = await supabase
      .from('budgets')
      .delete()
      .eq('id', budget.id)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[deleteBudget] Delete error:', deleteError);
      return {
        success: false,
        error: `Erro ao excluir: ${deleteError.message}`,
      };
    }

    console.log(`[deleteBudget] Successfully deleted budget ${budget.id}`);

    return {
      success: true,
      deleted: {
        id: budget.id,
        category: budget.category_id,
        amount: parseFloat(budget.amount),
      },
      message: `✅ Orçamento excluído com sucesso!\n\n🗑️ ${budget.category_id} - R$ ${parseFloat(budget.amount).toFixed(2)}/mês`,
    };
  } catch (error) {
    console.error('[deleteBudget] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro ao excluir orçamento',
    };
  }
}

// ==================== EXPORTAÇÃO DE DADOS ====================

async function exportData(
  supabase: any,
  userId: string,
  args: {
    format?: string;
    data_types?: string[];
    date_from?: string;
    date_to?: string;
  }
) {
  try {
    const format = args.format || 'csv';
    const dataTypes = args.data_types || ['expenses', 'budgets', 'profile'];

    console.log(
      `[exportData] Exporting ${dataTypes.join(', ')} as ${format} for user ${userId}`
    );

    const exportContent: any = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      format,
      data: {},
    };

    // Buscar expenses se solicitado
    if (dataTypes.includes('expenses')) {
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (args.date_from) {
        query = query.gte('date', args.date_from);
      }
      if (args.date_to) {
        query = query.lte('date', args.date_to);
      }

      const { data: expenses } = await query;
      exportContent.data.expenses = (expenses || []).map((e: any) => ({
        establishment_name: e.establishment_name,
        amount: parseFloat(e.amount),
        date: e.date,
        category: e.category,
        subcategory: e.subcategory,
        notes: e.notes,
      }));
    }

    // Buscar budgets se solicitado
    if (dataTypes.includes('budgets')) {
      const { data: budgets } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId);

      exportContent.data.budgets = (budgets || []).map((b: any) => ({
        category: b.category_id,
        amount: parseFloat(b.amount),
        period: b.period_type,
        notifications: b.notifications_enabled,
      }));
    }

    // Buscar profile se solicitado
    if (dataTypes.includes('profile')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile) {
        exportContent.data.profile = {
          name: profile.name,
          monthly_salary: profile.monthly_salary,
          salary_payment_day: profile.salary_payment_day,
          income_source: profile.income_source,
        };
      }
    }

    // Buscar transações do Open Finance se solicitado
    if (dataTypes.includes('transactions')) {
      let query = supabase
        .from('pluggy_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(500);

      if (args.date_from) {
        query = query.gte('date', args.date_from);
      }
      if (args.date_to) {
        query = query.lte('date', args.date_to);
      }

      const { data: transactions } = await query;
      exportContent.data.transactions = (transactions || []).map((t: any) => ({
        description: t.description,
        amount: parseFloat(t.amount),
        date: t.date,
        type: t.type,
        category: t.category,
      }));
    }

    // Gerar conteúdo no formato solicitado
    let fileContent: string;
    let mimeType: string;
    let fileExt: string;

    if (format === 'json') {
      fileContent = JSON.stringify(exportContent, null, 2);
      mimeType = 'application/json';
      fileExt = 'json';
    } else {
      // CSV
      const lines: string[] = [];

      // Expenses
      if (exportContent.data.expenses?.length > 0) {
        lines.push('=== DESPESAS ===');
        lines.push('Estabelecimento,Valor,Data,Categoria,Subcategoria,Notas');
        exportContent.data.expenses.forEach((e: any) => {
          lines.push(
            `"${e.establishment_name}",${e.amount},"${e.date}","${e.category}","${e.subcategory}","${e.notes || ''}"`
          );
        });
        lines.push('');
      }

      // Budgets
      if (exportContent.data.budgets?.length > 0) {
        lines.push('=== ORÇAMENTOS ===');
        lines.push('Categoria,Limite,Período,Notificações');
        exportContent.data.budgets.forEach((b: any) => {
          lines.push(
            `"${b.category}",${b.amount},"${b.period}",${b.notifications}`
          );
        });
        lines.push('');
      }

      // Profile
      if (exportContent.data.profile) {
        lines.push('=== PERFIL ===');
        lines.push(`Nome,"${exportContent.data.profile.name || ''}"`);
        lines.push(`Salário,${exportContent.data.profile.monthly_salary || 0}`);
        lines.push(
          `Dia Pagamento,${exportContent.data.profile.salary_payment_day || ''}`
        );
        lines.push('');
      }

      // Transactions
      if (exportContent.data.transactions?.length > 0) {
        lines.push('=== TRANSAÇÕES OPEN FINANCE ===');
        lines.push('Descrição,Valor,Data,Tipo,Categoria');
        exportContent.data.transactions.forEach((t: any) => {
          lines.push(
            `"${t.description}",${t.amount},"${t.date}","${t.type}","${t.category || ''}"`
          );
        });
      }

      fileContent = lines.join('\n');
      mimeType = 'text/csv';
      fileExt = 'csv';
    }

    // Upload para Supabase Storage
    const fileName = `export_${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(filePath, fileContent, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[exportData] Upload error:', uploadError);
      // Se o bucket não existe, retornar os dados diretamente
      return {
        success: true,
        format,
        data_types: dataTypes,
        record_counts: {
          expenses: exportContent.data.expenses?.length || 0,
          budgets: exportContent.data.budgets?.length || 0,
          transactions: exportContent.data.transactions?.length || 0,
        },
        message: `📦 Dados exportados com sucesso!\n\n📊 Resumo:\n• ${exportContent.data.expenses?.length || 0} despesas\n• ${exportContent.data.budgets?.length || 0} orçamentos\n• ${exportContent.data.transactions?.length || 0} transações\n\n⚠️ Não foi possível gerar link de download. Use a opção "Exportar" nas configurações do app.`,
      };
    }

    // Gerar URL assinada (válida por 1 hora)
    const { data: signedUrl } = await supabase.storage
      .from('exports')
      .createSignedUrl(filePath, 3600);

    console.log(`[exportData] File uploaded: ${filePath}`);

    return {
      success: true,
      format,
      data_types: dataTypes,
      record_counts: {
        expenses: exportContent.data.expenses?.length || 0,
        budgets: exportContent.data.budgets?.length || 0,
        transactions: exportContent.data.transactions?.length || 0,
      },
      download_url: signedUrl?.signedUrl,
      expires_in: '1 hora',
      message: `📦 Dados exportados com sucesso!\n\n📊 Resumo:\n• ${exportContent.data.expenses?.length || 0} despesas\n• ${exportContent.data.budgets?.length || 0} orçamentos\n• ${exportContent.data.transactions?.length || 0} transações\n\n📥 [Clique aqui para baixar](${signedUrl?.signedUrl})\n\n⏰ Link válido por 1 hora.`,
    };
  } catch (error) {
    console.error('[exportData] Exception:', error);
    return {
      success: false,
      error: error.message || 'Erro ao exportar dados',
    };
  }
}
