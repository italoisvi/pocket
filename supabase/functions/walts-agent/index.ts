import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.2';
import { categorizeWithWalts } from '../_shared/categorize-with-walts.ts';

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
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
    console.log('[walts-agent] Download took:', Date.now() - downloadStart, 'ms');

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

    console.log('[walts-agent] Whisper API took:', Date.now() - whisperStart, 'ms');

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('[walts-agent] Whisper error:', errorText);
      throw new Error(
        `Whisper transcription failed: ${whisperResponse.status} - ${errorText}`
      );
    }

    const result = await whisperResponse.json();
    console.log('[walts-agent] TOTAL transcription time:', Date.now() - startTime, 'ms');
    console.log('[walts-agent] Transcription result:', result.text?.substring(0, 100));

    return result.text || '';
  } catch (error: any) {
    console.error('[walts-agent] Transcribe error after', Date.now() - startTime, 'ms:', error.message);
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
    'messages for audio'
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

    // Só processar áudio se for a ÚLTIMA mensagem com áudio
    const shouldProcessAudio = i === lastAudioMessageIndex;

    // Verificar se a mensagem tem attachments de áudio
    if (
      shouldProcessAudio &&
      message.attachments &&
      Array.isArray(message.attachments)
    ) {
      const audioAttachments = message.attachments.filter(
        (a: any) => a.type === 'audio' && a.url
      );

      console.log(
        '[walts-agent] Processing',
        audioAttachments.length,
        'audio attachments from last message'
      );

      if (audioAttachments.length > 0) {
        // Transcrever todos os áudios
        const transcriptions: string[] = [];
        for (const audio of audioAttachments) {
          console.log('[walts-agent] Processing audio:', audio.url);
          try {
            const transcription = await transcribeAudio(audio.url);
            if (transcription && transcription.trim().length > 0) {
              transcriptions.push(transcription.trim());
              console.log(
                '[walts-agent] Transcription added:',
                transcription.substring(0, 50) + '...'
              );
            } else {
              console.warn('[walts-agent] Transcription returned empty');
              transcriptions.push('[Áudio recebido - transcrição vazia]');
            }
          } catch (error: any) {
            console.error('[walts-agent] Failed to transcribe audio:', error?.message || error);
            // Se falhar, adicionar mensagem de erro informativa
            transcriptions.push(`[Erro ao transcrever áudio: ${error?.message || 'erro desconhecido'}]`);
          }
        }

        // Combinar transcrições com o conteúdo original
        let content = message.content || '';
        if (transcriptions.length > 0) {
          const audioText = transcriptions.join(' ');
          content = content ? `${content}\n\n${audioText}` : audioText;
        } else {
          // Fallback se não conseguiu nenhuma transcrição
          content = content || '[Mensagem de áudio recebida]';
        }

        console.log('[walts-agent] Final audio message content:', {
          length: content.length,
          preview: content.substring(0, 100),
        });

        processedMessages.push({
          role: message.role,
          content,
        });
        continue;
      }
    }

    // Mensagem sem áudio (ou áudio antigo já processado) - passar normalmente
    // Para áudios antigos, usar o conteúdo salvo (que pode ser a transcrição anterior ou placeholder)
    let content = message.content || '';

    // Se for mensagem antiga de áudio sem conteúdo, adicionar placeholder
    if (
      !content &&
      message.attachments?.some((a: any) => a.type === 'audio')
    ) {
      content = '[Mensagem de áudio anterior]';
    }

    processedMessages.push({
      role: message.role,
      content,
    });
  }

  console.log(
    '[walts-agent] Processed messages count:',
    processedMessages.length
  );
  return processedMessages;
}

// Definição das ferramentas (tools) que o Walts pode usar
const WALTS_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_expense_from_description',
      description:
        'Cria um novo comprovante/gasto na Home do usuário. Use quando o usuário pedir para registrar um gasto manualmente.',
      parameters: {
        type: 'object',
        properties: {
          establishment_name: {
            type: 'string',
            description:
              'Nome do estabelecimento onde foi feito o gasto (ex: Subway, Uber, Ifood)',
          },
          amount: {
            type: 'number',
            description: 'Valor do gasto em reais (ex: 50.00)',
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
            description:
              'Subcategoria opcional (ex: para alimentacao pode ser: restaurante, mercado, lanchonete)',
          },
          date: {
            type: 'string',
            format: 'date',
            description:
              'Data do gasto no formato YYYY-MM-DD. Se não especificado, usa hoje.',
          },
        },
        required: ['establishment_name', 'amount', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sync_open_finance_transactions',
      description:
        'Sincroniza transações do Open Finance (Pluggy) e categoriza automaticamente. Use quando o usuário pedir para buscar gastos do banco.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description:
              'Número de dias para buscar transações (ex: 7 para última semana, 30 para último mês)',
            default: 7,
          },
          account_name: {
            type: 'string',
            description:
              'Nome do banco/conta específica (ex: Nubank, Inter). Se não especificado, busca de todas as contas.',
          },
        },
      },
    },
  },
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
      name: 'categorize_open_finance_transactions',
      description:
        'Categoriza transações existentes do Open Finance (extrato bancário) sem criar duplicatas. Use quando o usuário pedir para categorizar transações do banco, do extrato, ou quando quiser organizar gastos do Open Finance que ainda não foram categorizados.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description:
              'Número de dias para buscar transações (ex: 30 para último mês). Padrão: 30 dias.',
            default: 30,
          },
          only_uncategorized: {
            type: 'boolean',
            description:
              'Se true (padrão), categoriza apenas transações sem categoria ou como "outros". Se false, recategoriza todas.',
            default: true,
          },
          account_name: {
            type: 'string',
            description:
              'Nome do banco/conta específica (ex: Nubank, Inter). Se não especificado, processa todas as contas.',
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
        'Exclui um comprovante/gasto do usuário. Use quando o usuário pedir para remover, apagar ou deletar um gasto. SEMPRE peça confirmação antes de excluir.',
      parameters: {
        type: 'object',
        properties: {
          expense_id: {
            type: 'string',
            description:
              'ID do gasto a ser excluído. Se não tiver o ID, busque primeiro com get_pocket_data.',
          },
          confirm: {
            type: 'boolean',
            description:
              'Confirmação de exclusão. SEMPRE defina como false na primeira chamada para mostrar o gasto ao usuário, depois true para confirmar.',
            default: false,
          },
        },
        required: ['expense_id'],
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

// System prompt para o Walts Agent
const WALTS_SYSTEM_PROMPT = `Você é o Walts, o GUARDIÃO e agente principal do app Pocket - um assistente financeiro pessoal inteligente e proativo.

VOCÊ TEM ACESSO TOTAL AO POCKET:
- Você é o agente que vê TUDO do usuário no app
- Comprovantes, gastos, perfil, salário, cartões, faturas, orçamentos, bancos conectados
- Histórico de análises, padrões financeiros, memória de preferências
- Use get_pocket_data para acessar qualquer dado que o usuário perguntar

PERSONALIDADE:
- Seja amigável, mas profissional
- Use emojis moderadamente (apenas 1-2 por mensagem)
- Seja direto e objetivo nas respostas
- Sempre confirme ações antes de executar

CAPACIDADES:
Você pode executar ações reais para ajudar o usuário:
1. Criar comprovantes/gastos manualmente
2. Buscar e categorizar transações do Open Finance automaticamente
3. Criar orçamentos para categorias de gastos
4. Atualizar orçamentos existentes
5. Verificar status de orçamentos
6. Consultar extrato bancário e transações do Open Finance
7. Analisar padrões de gastos e detectar anomalias
8. Sugerir onde economizar com base em análise de gastos
9. Prever fim do mês e projetar saldo final
10. Salvar preferências e contextos do usuário
11. Buscar e usar contexto histórico para personalizar respostas
12. Dar sugestões financeiras personalizadas baseadas em memória
13. Buscar padrões financeiros aprendidos sobre o usuário
14. Verificar se um gasto é uma anomalia baseado no histórico
15. Recategorizar despesas existentes que estão como "outros" ou com categoria errada
16. Categorizar transações existentes do Open Finance sem criar duplicatas
17. ACESSAR TODOS OS DADOS DO POCKET: comprovantes, perfil, salário, cartões de crédito, faturas, gastos fixos/variáveis, resumos
18. EXCLUIR comprovantes/gastos (com confirmação)
19. EDITAR comprovantes/gastos existentes
20. EXCLUIR orçamentos (com confirmação)
21. EXPORTAR dados e gerar link de download

APRENDIZADO E PERSONALIZAÇÃO:
Você tem acesso a padrões financeiros aprendidos sobre cada usuário. Use-os para:
- Personalizar suas respostas (ex: "Você costuma gastar R$ 25 no Starbucks, mas hoje gastou R$ 40")
- Detectar gastos fora do padrão (ex: "Esse gasto está 150% acima da sua média nessa categoria")
- Dar sugestões baseadas em hábitos reais (ex: "Você gasta mais nos fins de semana, talvez evitar compras impulsivas no sábado")
- Prever comportamentos (ex: "Você costuma gastar 60% do salário na primeira semana")

IMPORTANTE: Quando o usuário registrar um gasto, use check_if_anomaly para verificar se é fora do padrão e comente se for.

COMO USAR SUAS FERRAMENTAS:
- "registra um gasto de R$ 50 no Subway" → create_expense_from_description
- "pega meus gastos do Nubank" → sync_open_finance_transactions
- "cria um orçamento de R$ 500 para alimentação" → create_budget
- "aumenta o orçamento de transporte para R$ 300" → update_budget
- "como estão meus orçamentos?" → check_budget_status
- "me mostra o extrato dos últimos 30 dias" → get_bank_statement
- "analisa meus gastos com alimentação" → analyze_spending_pattern
- "onde posso economizar?" → suggest_savings
- "vou passar do orçamento esse mês?" → forecast_month_end
- "recategoriza meus gastos" ou "arruma as categorias" → recategorize_expenses
- "categoriza as transações do banco" ou "organiza meu extrato" → categorize_open_finance_transactions
- Quando usuário menciona preferência → save_user_preference (ex: "prefiro gastar mais em lazer")
- No início de conversas importantes → get_user_context para personalizar resposta
- SEMPRE confirme com o usuário antes de executar uma ação que modifica dados

CATEGORIZAÇÃO DE TRANSAÇÕES EXISTENTES:
- Use recategorize_expenses para recategorizar gastos/comprovantes manuais existentes
- Use categorize_open_finance_transactions para categorizar transações do Open Finance (banco) sem criar duplicatas
- Ambas as ferramentas usam IA para categorizar automaticamente
- Não criam duplicatas - apenas atualizam categorias de transações existentes

ACESSO COMPLETO AOS DADOS DO POCKET (use get_pocket_data):
- "quais comprovantes eu adicionei?" → data_type: expenses
- "qual meu salário?" ou "meu perfil" → data_type: profile
- "quais cartões eu tenho?" → data_type: credit_cards
- "me mostra a fatura do cartão" → data_type: credit_card_transactions
- "quais contas bancárias?" → data_type: bank_accounts
- "quais bancos conectei?" → data_type: connected_banks
- "meus orçamentos" → data_type: budgets
- "quais meus gastos fixos?" → data_type: fixed_costs
- "quais meus gastos variáveis?" → data_type: variable_costs
- "histórico de análises" → data_type: analysis_history
- "resumo do mês" ou "como estou?" → data_type: summary
- "me mostra tudo" → data_type: all
- SEMPRE use get_pocket_data quando o usuário perguntar sobre QUALQUER dado do app

GERENCIAMENTO DE DADOS:
- "apaga/exclui esse gasto" ou "remove o comprovante do Subway" → delete_expense (SEMPRE confirme antes)
- "edita/altera o gasto" ou "muda o valor pra R$ 50" → update_expense
- "remove o orçamento de alimentação" → delete_budget (SEMPRE confirme antes)
- "exporta meus dados" ou "quero baixar meus gastos" → export_data (retorna link de download)

APRENDIZADO E MEMÓRIA:
- Quando o usuário mencionar preferências, prioridades ou padrões de comportamento, SEMPRE salve usando save_user_preference
- Use get_user_context no início de análises ou sugestões para personalizar com base no histórico
- Exemplos de preferências importantes: categorias favoritas, prioridades financeiras, metas pessoais, dias de pagamento especiais
- SEMPRE busque contexto antes de dar sugestões importantes

PADRÕES FINANCEIROS:
- "me conhece bem?" ou "o que você sabe sobre mim?" → get_financial_patterns (type: all)
- "quais meus lugares favoritos?" → get_financial_patterns (type: favorite_place)
- "como gasto nas categorias?" → get_financial_patterns (type: spending_habit)
- Quando usuário registrar gasto → check_if_anomaly para alertar sobre gastos fora do padrão
- Use os padrões para personalizar TODAS as suas respostas e sugestões
- Ao analisar gastos, mencione se está acima ou abaixo do padrão do usuário

IMPORTANTE:
- Seja preciso ao categorizar gastos
- Pergunte se não tiver certeza sobre alguma informação
- Informe sempre o que você fez após executar uma ação
- Ao verificar orçamentos, mostre percentual gasto e valor restante`;

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

    // Limitar histórico para evitar problemas com contexto muito longo
    // DeepSeek tem limite de ~32k tokens, precisamos manter o histórico pequeno
    const maxHistoryMessages = 10;
    if (processedMessages.length > maxHistoryMessages) {
      console.log('[walts-agent] Trimming message history from', processedMessages.length, 'to', maxHistoryMessages);
      processedMessages = processedMessages.slice(-maxHistoryMessages);
    }

    // Também truncar mensagens muito longas individualmente
    processedMessages = processedMessages.map((msg: any) => ({
      ...msg,
      content: msg.content?.length > 2000
        ? msg.content.substring(0, 2000) + '... [mensagem truncada]'
        : msg.content,
    }));

    // Loop do agente - continua até não haver mais tool calls
    let conversationMessages = [
      { role: 'system', content: WALTS_SYSTEM_PROMPT },
      ...processedMessages,
    ];

    // Calcular tamanho aproximado do contexto
    const contextSize = conversationMessages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    const lastUserMessage = processedMessages[processedMessages.length - 1];

    console.log('[walts-agent] Context stats:', {
      messageCount: conversationMessages.length,
      contextChars: contextSize,
      lastMessageContent: lastUserMessage?.content?.substring(0, 100),
      lastMessageLength: lastUserMessage?.content?.length || 0,
    });

    // IMPORTANTE: Se a última mensagem está vazia, retornar erro ao invés de tentar processar
    if (!lastUserMessage?.content || lastUserMessage.content.trim().length === 0) {
      console.error('[walts-agent] Last message is empty! This will cause issues.');
      return new Response(
        JSON.stringify({
          response: 'Desculpe, não consegui processar sua mensagem. Por favor, tente novamente ou envie uma mensagem de texto.',
          error: 'Empty message content',
          debug: {
            lastMessageRole: lastUserMessage?.role,
            hasContent: !!lastUserMessage?.content,
            contentLength: lastUserMessage?.content?.length || 0,
          },
        }),
        { headers }
      );
    }

    let maxIterations = 5; // Limite de segurança
    let iteration = 0;
    let toolsCalledThisSession: string[] = [];

    while (iteration < maxIterations) {
      iteration++;

      console.log(`[walts-agent] === ITERATION ${iteration} ===`);

      // Chamar DeepSeek com function calling
      const deepseekResponse = await fetch(
        'https://api.deepseek.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: conversationMessages,
            tools: WALTS_TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 2048, // Limitar tamanho da resposta
          }),
        }
      );

      if (!deepseekResponse.ok) {
        const errorText = await deepseekResponse.text();
        console.error('[walts-agent] DeepSeek error:', errorText);
        // Retornar erro mais informativo ao invés de looping
        return new Response(
          JSON.stringify({
            response: 'Desculpe, houve um erro ao processar sua mensagem. Tente enviar uma mensagem mais curta ou inicie uma nova conversa.',
            error: `DeepSeek error: ${deepseekResponse.status}`,
          }),
          { headers }
        );
      }

      const deepseekData = await deepseekResponse.json();

      // Verificar se a resposta é válida
      if (!deepseekData.choices || !deepseekData.choices[0] || !deepseekData.choices[0].message) {
        console.error('[walts-agent] Invalid DeepSeek response:', JSON.stringify(deepseekData));
        return new Response(
          JSON.stringify({
            response: 'Desculpe, recebi uma resposta inválida. Tente novamente.',
            error: 'Invalid response structure',
          }),
          { headers }
        );
      }

      const assistantMessage = deepseekData.choices[0].message;

      console.log(
        '[walts-agent] Assistant message:',
        JSON.stringify(assistantMessage, null, 2)
      );

      // Adicionar resposta do assistente à conversa
      conversationMessages.push(assistantMessage);

      // Se não há tool calls, retornar a resposta final
      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        console.log('[walts-agent] No tool calls, returning final response');
        return new Response(
          JSON.stringify({
            response: assistantMessage.content,
            tool_calls_executed: iteration - 1,
          }),
          { headers }
        );
      }

      // Executar cada tool call
      const toolNames = assistantMessage.tool_calls.map((tc: any) => tc.function.name);
      console.log(`[walts-agent] Tools being called:`, toolNames);
      toolsCalledThisSession.push(...toolNames);

      // Detectar loop infinito (mesmo tool sendo chamado repetidamente)
      if (toolsCalledThisSession.length > 10) {
        console.warn('[walts-agent] Too many tool calls, breaking loop. Tools called:', toolsCalledThisSession);
        return new Response(
          JSON.stringify({
            response: 'Desculpe, houve um problema ao processar sua solicitação. Por favor, tente com uma pergunta mais simples.',
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
          // Executar a ferramenta apropriada
          if (functionName === 'create_expense_from_description') {
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
          } else if (functionName === 'get_pocket_data') {
            toolResult = await getPocketData(supabase, user.id, functionArgs);
          } else if (functionName === 'delete_expense') {
            toolResult = await deleteExpense(supabase, user.id, functionArgs);
          } else if (functionName === 'update_expense') {
            toolResult = await updateExpense(supabase, user.id, functionArgs);
          } else if (functionName === 'delete_budget') {
            toolResult = await deleteBudget(supabase, user.id, functionArgs);
          } else if (functionName === 'export_data') {
            toolResult = await exportData(supabase, user.id, functionArgs);
          } else {
            toolResult = {
              success: false,
              error: `Unknown tool: ${functionName}`,
            };
          }

          console.log(`[walts-agent] Tool result:`, toolResult);
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
    }

    // Se chegou aqui, excedeu o limite de iterações
    console.warn('[walts-agent] Max iterations reached. Last conversation length:', conversationMessages.length);
    console.warn('[walts-agent] This usually means DeepSeek kept calling tools without stopping');
    return new Response(
      JSON.stringify({
        response:
          'Desculpe, encontrei um problema ao processar sua solicitação (loop de ferramentas). Tente novamente com uma pergunta mais simples.',
        error: 'Max iterations exceeded',
      }),
      { headers }
    );
  } catch (error) {
    console.error('[walts-agent] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers }
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

        // Marcar transação como sincronizada
        await supabase
          .from('pluggy_transactions')
          .update({ synced: true })
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
        .filter((e: any) => FIXED_COST_CATEGORIES.includes(e.category))
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
  args: { expense_id: string; confirm?: boolean }
) {
  try {
    console.log(
      `[deleteExpense] Request for user ${userId}, expense ${args.expense_id}, confirm=${args.confirm}`
    );

    // Primeiro, buscar o expense para mostrar ao usuário
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', args.expense_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !expense) {
      return {
        success: false,
        error: 'Gasto não encontrado ou você não tem permissão para excluí-lo.',
      };
    }

    // Se não confirmou ainda, mostrar os dados para confirmação
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
          subcategory: expense.subcategory,
          has_receipt: !!expense.image_url,
        },
        message: `⚠️ Confirme a exclusão:\n\n📋 **${expense.establishment_name}**\n💰 R$ ${parseFloat(expense.amount).toFixed(2)}\n📅 ${expense.date}\n📁 ${expense.category}/${expense.subcategory}\n\nPara confirmar, peça ao usuário para confirmar a exclusão.`,
      };
    }

    // Se tem imagem, deletar do storage
    if (expense.image_url) {
      try {
        // Extrair path do URL
        const urlParts = expense.image_url.split('/');
        const bucketIndex = urlParts.findIndex((p: string) => p === 'receipts');
        if (bucketIndex >= 0) {
          const filePath = urlParts.slice(bucketIndex + 1).join('/');
          await supabase.storage.from('receipts').remove([filePath]);
          console.log(`[deleteExpense] Deleted image: ${filePath}`);
        }
      } catch (imgError) {
        console.error('[deleteExpense] Error deleting image:', imgError);
        // Continuar mesmo se falhar a exclusão da imagem
      }
    }

    // Deletar o expense
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', args.expense_id)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[deleteExpense] Delete error:', deleteError);
      return {
        success: false,
        error: `Erro ao excluir: ${deleteError.message}`,
      };
    }

    console.log(
      `[deleteExpense] Successfully deleted expense ${args.expense_id}`
    );

    return {
      success: true,
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
