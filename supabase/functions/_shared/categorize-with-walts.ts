/**
 * Categorização inteligente com Walts (LLM)
 * Versão para Deno Edge Functions
 */

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

export type ExpenseCategory =
  | 'moradia'
  | 'alimentacao_casa'
  | 'transporte'
  | 'saude'
  | 'educacao'
  | 'alimentacao_fora'
  | 'lazer'
  | 'vestuario'
  | 'beleza'
  | 'eletronicos'
  | 'pets'
  | 'tecnologia'
  | 'poupanca'
  | 'previdencia'
  | 'investimentos'
  | 'consorcio'
  | 'cartao_credito'
  | 'emprestimos'
  | 'financiamentos'
  | 'transferencias'
  | 'outros';

export interface CategorizeOptions {
  pluggyCategory?: string | null;
  receiverName?: string | null;
  payerName?: string | null;
  amount?: number;
  items?: string[];
  // Para consultar aliases aprendidos
  supabase?: any;
  userId?: string;
}

export interface CategorizeResult {
  category: ExpenseCategory;
  subcategory: string;
  is_fixed_cost: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

const WALTS_CATEGORIZATION_SYSTEM_PROMPT = `
Voce e Walts, assistente financeiro do app Pocket.
Sua tarefa e categorizar gastos com MAXIMA PRECISAO.

# CATEGORIAS DISPONIVEIS:

## ESSENCIAIS (Custos Fixos):
- moradia: aluguel, conta de luz, agua, gas, internet, condominio
- alimentacao_casa: supermercado, feira, acougue, mercearia (compras para preparar em casa)
- transporte: combustivel, uber, estacionamento, mecanica, IPVA, seguro auto
- saude: farmacia, plano de saude, consultas, exames
- educacao: escola, faculdade, cursos, material escolar

## NAO ESSENCIAIS (Custos Variaveis):
- alimentacao_fora: restaurante, lanchonete, delivery, ifood, rappi, bar, cafe, cafeteria, padaria, delicatessen, confeitaria, pizzaria, hamburgueria, fast food, acai, sorveteria (consumo imediato ou pronto)
- lazer: cinema, streaming (netflix, spotify, disney+, hbo, prime video), viagens, academia, shows
- vestuario: roupas, calcados, acessorios
- beleza: salao, barbearia, cosmeticos
- eletronicos: gadgets, games, acessorios tech, compra de celular, computador
- pets: pet shop, veterinario, racao
- tecnologia: servicos de IA (OpenAI, Anthropic, ChatGPT, Claude, DeepSeek, Midjourney, Copilot, Gemini, Perplexity), cloud (AWS, Azure, Google Cloud, Vercel, Netlify, Heroku, DigitalOcean, Cloudflare, Railway, Render), software (GitHub, GitLab, Notion, Slack, Figma, Adobe, Dropbox, Zoom, Canva, 1Password), Apple (iCloud, Apple One, Apple Music, Apple TV+), dominios e hospedagem (GoDaddy, Namecheap, Registro.br, Hostgator, Hostinger, Locaweb)

## INVESTIMENTOS:
- poupanca: depositos em poupanca
- previdencia: previdencia privada
- investimentos: acoes, fundos, renda fixa, corretoras
- consorcio: consorcio de imovel ou veiculo

## DIVIDAS:
- cartao_credito: fatura do cartao de credito
- emprestimos: emprestimos pessoais
- financiamentos: financiamento de veiculo ou imovel

## TRANSFERENCIAS:
- transferencias: PIX para pessoas fisicas

## OUTROS:
- outros: quando nao se encaixar em nenhuma categoria acima

IMPORTANTE:
- Padaria, delicatessen, cafeteria, confeitaria sao SEMPRE alimentacao_fora (consumo imediato).
- Servicos de IA como OpenAI, Anthropic, ChatGPT, Claude, DeepSeek sao SEMPRE tecnologia.
- Consorcio NAO e financiamento - consorcio e categoria propria (investimento).

# DECIDIR SE E CUSTO FIXO OU VARIAVEL (is_fixed_cost):
VOCE DECIDE LIVREMENTE baseado na natureza do gasto:
- is_fixed_cost = true: gastos RECORRENTES, mensais, previstos
  Exemplos: aluguel, plano de saude, assinatura netflix, conta de luz, escola, assinatura OpenAI/Claude
- is_fixed_cost = false: gastos EVENTUAIS, pontuais, nao recorrentes
  Exemplos: compra na farmacia, almoco no restaurante, cinema, presente, compra de roupa

NAO HA REGRA FIXA - analise o contexto:
- Farmacia EVENTUAL (remedio para gripe) = is_fixed_cost: false
- Farmacia MENSAL (remedio continuo) = is_fixed_cost: true
- Assinatura de servico de IA = is_fixed_cost: true
- Na duvida, use is_fixed_cost: false (variavel)

# FORMATO DE RESPOSTA (RETORNE APENAS JSON VALIDO):
{
  "category": "categoria_exata",
  "subcategory": "Nome do estabelecimento ou tipo",
  "is_fixed_cost": true ou false,
  "confidence": "high|medium|low",
  "reasoning": "Breve explicacao de 1 linha"
}

Seja preciso e consistente. Retorne APENAS o JSON, sem texto adicional.
`;

function buildCategorizationPrompt(
  establishmentName: string,
  options?: CategorizeOptions
): string {
  let prompt = `Categorize este gasto:\n\n`;
  prompt += `Nome do estabelecimento: "${establishmentName}"\n`;

  if (options?.amount) {
    prompt += `Valor: R$ ${options.amount.toFixed(2)}\n`;
  }

  if (options?.pluggyCategory) {
    prompt += `Tipo de transação (Pluggy): ${options.pluggyCategory}\n`;
  }

  if (options?.receiverName) {
    prompt += `Recebedor: ${options.receiverName}\n`;
  }

  if (options?.payerName) {
    prompt += `Pagador: ${options.payerName}\n`;
  }

  if (options?.items && options.items.length > 0) {
    prompt += `\nItens do comprovante:\n`;
    options.items.forEach((item) => {
      prompt += `- ${item}\n`;
    });
  }

  prompt += `\nRetorne APENAS o JSON de categorização.`;

  return prompt;
}

function isValidCategory(category: string): category is ExpenseCategory {
  const validCategories: ExpenseCategory[] = [
    'moradia',
    'alimentacao_casa',
    'alimentacao_fora',
    'transporte',
    'saude',
    'educacao',
    'lazer',
    'vestuario',
    'beleza',
    'eletronicos',
    'pets',
    'tecnologia',
    'poupanca',
    'previdencia',
    'investimentos',
    'consorcio',
    'cartao_credito',
    'emprestimos',
    'financiamentos',
    'transferencias',
    'outros',
  ];

  return validCategories.includes(category as ExpenseCategory);
}

async function getChatCompletion(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 300
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function categorizeWithWalts(
  establishmentName: string,
  options?: CategorizeOptions
): Promise<CategorizeResult> {
  try {
    console.log('[categorizeWithWalts] Starting categorization:', {
      establishmentName,
      options: { ...options, supabase: options?.supabase ? '[client]' : null },
    });

    // PASSO 1: Consultar aliases aprendidos (se supabase e userId disponiveis)
    if (options?.supabase && options?.userId) {
      try {
        const normalizedName = establishmentName?.toLowerCase().trim();
        const aliasKey = `merchant_alias_${normalizedName.replace(/[^a-z0-9]/g, '_')}`;

        const { data: alias } = await options.supabase
          .from('walts_memory')
          .select('value, confidence')
          .eq('user_id', options.userId)
          .eq('memory_type', 'merchant_alias')
          .eq('key', aliasKey)
          .single();

        if (alias && alias.confidence >= 0.8) {
          console.log(
            `[categorizeWithWalts] Found learned alias with high confidence: "${normalizedName}" -> "${alias.value.establishment_name}" (${alias.confidence})`
          );

          // Atualizar last_used_at
          await options.supabase
            .from('walts_memory')
            .update({ last_used_at: new Date().toISOString() })
            .eq('user_id', options.userId)
            .eq('memory_type', 'merchant_alias')
            .eq('key', aliasKey);

          return {
            category: alias.value.category as ExpenseCategory,
            subcategory:
              alias.value.subcategory || alias.value.establishment_name,
            is_fixed_cost: false, // Default para variavel
            confidence: 'high',
            reasoning: `Aprendido: "${establishmentName}" = "${alias.value.establishment_name}"`,
          };
        }
      } catch (aliasError) {
        console.log(
          '[categorizeWithWalts] No alias found or error:',
          aliasError
        );
        // Continuar com LLM se nao encontrar alias
      }
    }

    // PASSO 2: Usar LLM para categorizar
    const prompt = buildCategorizationPrompt(establishmentName, options);

    const response = await getChatCompletion([
      {
        role: 'system',
        content: WALTS_CATEGORIZATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    console.log('[categorizeWithWalts] Raw LLM response:', response);

    const cleanedResponse = response.trim().replace(/```json\n?|\n?```/g, '');
    const result = JSON.parse(cleanedResponse);

    if (!isValidCategory(result.category) || !result.subcategory) {
      throw new Error(
        `Invalid categorization result: ${JSON.stringify(result)}`
      );
    }

    // Garantir que is_fixed_cost e boolean
    const isFixedCost = result.is_fixed_cost === true;

    console.log('[categorizeWithWalts] Success:', result);
    return {
      category: result.category,
      subcategory: result.subcategory,
      is_fixed_cost: isFixedCost,
      confidence: result.confidence || 'medium',
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error('[categorizeWithWalts] Error, using fallback:', error);

    // Fallback para sistema baseado em keywords (importar do categorize.ts)
    const { categorizePluggyTransaction } = await import('./categorize.ts');
    const fallback = categorizePluggyTransaction({
      description: establishmentName,
      category: options?.pluggyCategory,
      paymentData: {
        receiver: options?.receiverName
          ? { name: options.receiverName }
          : undefined,
        payer: options?.payerName ? { name: options.payerName } : undefined,
      },
    });

    if (fallback) {
      return {
        category: fallback.category as ExpenseCategory,
        subcategory: fallback.subcategory,
        is_fixed_cost: false, // Default para variavel no fallback
        confidence: 'low',
        reasoning: 'Fallback to keyword-based categorization due to error',
      };
    }

    // Fallback final: outros
    return {
      category: 'outros',
      subcategory: 'Outros',
      is_fixed_cost: false, // Default para variavel
      confidence: 'low',
      reasoning: 'Fallback to default category due to error',
    };
  }
}

/**
 * Interface para transações em batch
 */
export interface BatchTransaction {
  id: string;
  description: string;
  amount: number;
  pluggyCategory?: string | null;
}

/**
 * Resultado de categorização em batch
 */
export interface BatchCategorizeResult {
  id: string;
  category: ExpenseCategory;
  subcategory: string;
  is_fixed_cost: boolean;
  confidence: 'high' | 'medium' | 'low';
}

const WALTS_BATCH_SYSTEM_PROMPT = `
Voce e Walts, assistente financeiro do app Pocket.
Sua tarefa e categorizar MULTIPLOS gastos de uma vez com MAXIMA PRECISAO.

# CATEGORIAS DISPONIVEIS:

## ESSENCIAIS (Custos Fixos):
- moradia: aluguel, conta de luz, agua, gas, internet, condominio
- alimentacao_casa: supermercado, feira, acougue, mercearia (compras para preparar em casa)
- transporte: combustivel, uber, estacionamento, mecanica, IPVA, seguro auto
- saude: farmacia, plano de saude, consultas, exames
- educacao: escola, faculdade, cursos, material escolar

## NAO ESSENCIAIS (Custos Variaveis):
- alimentacao_fora: restaurante, lanchonete, delivery, ifood, rappi, bar, cafe, cafeteria, padaria, delicatessen, confeitaria, pizzaria, hamburgueria, fast food, acai, sorveteria (consumo imediato ou pronto)
- lazer: cinema, streaming (netflix, spotify, disney+, hbo, prime video), viagens, academia, shows
- vestuario: roupas, calcados, acessorios
- beleza: salao, barbearia, cosmeticos
- eletronicos: gadgets, games, acessorios tech, compra de celular, computador
- pets: pet shop, veterinario, racao
- tecnologia: servicos de IA (OpenAI, Anthropic, ChatGPT, Claude, DeepSeek, Midjourney, Copilot, Gemini, Perplexity), cloud (AWS, Azure, Google Cloud, Vercel, Netlify, Heroku, DigitalOcean, Cloudflare, Railway, Render), software (GitHub, GitLab, Notion, Slack, Figma, Adobe, Dropbox, Zoom, Canva, 1Password), Apple (iCloud, Apple One, Apple Music, Apple TV+), dominios e hospedagem (GoDaddy, Namecheap, Registro.br, Hostgator, Hostinger, Locaweb)

## INVESTIMENTOS:
- poupanca: depositos em poupanca
- previdencia: previdencia privada
- investimentos: acoes, fundos, renda fixa, corretoras
- consorcio: consorcio de imovel ou veiculo

## DIVIDAS:
- cartao_credito: fatura do cartao de credito
- emprestimos: emprestimos pessoais
- financiamentos: financiamento de veiculo ou imovel

## TRANSFERENCIAS:
- transferencias: PIX para pessoas fisicas

## OUTROS:
- outros: quando nao se encaixar em nenhuma categoria acima

IMPORTANTE - REGRAS ESPECIAIS:
- Servicos de IA (OpenAI, Anthropic, ChatGPT, Claude, DeepSeek, Cursor, Midjourney, Copilot, Gemini, Perplexity) sao SEMPRE categoria "tecnologia"
- Servicos de cloud (AWS, Azure, Google Cloud, Vercel, Netlify, Heroku, DigitalOcean, Cloudflare, Railway, Render, Supabase) sao SEMPRE categoria "tecnologia"
- Software e SaaS (GitHub, GitLab, Notion, Slack, Figma, Adobe, Dropbox, Zoom, Canva, 1Password, Linear, Jira, Confluence) sao SEMPRE categoria "tecnologia"
- Assinaturas Apple (iCloud, Apple One, Apple Music, Apple TV+) sao SEMPRE categoria "tecnologia"
- Dominios e hospedagem (GoDaddy, Namecheap, Registro.br, Hostgator, Hostinger, Locaweb) sao SEMPRE categoria "tecnologia"

# DECIDIR SE E CUSTO FIXO OU VARIAVEL (is_fixed_cost):
- is_fixed_cost = true: gastos RECORRENTES, mensais (aluguel, assinaturas de servicos, planos)
- is_fixed_cost = false: gastos EVENTUAIS, pontuais (restaurante, compras, cinema)
- Assinaturas de servicos de tecnologia (OpenAI, GitHub, Vercel, etc) sao SEMPRE is_fixed_cost = true

# FORMATO DE RESPOSTA:
Retorne um array JSON com a categorizacao de CADA transacao, na mesma ordem:
[
  {"id": "id1", "category": "categoria", "subcategory": "nome", "is_fixed_cost": false, "confidence": "high"},
  {"id": "id2", "category": "categoria", "subcategory": "nome", "is_fixed_cost": true, "confidence": "medium"}
]

IMPORTANTE: Retorne APENAS o array JSON, sem texto adicional.
`;

/**
 * Categoriza múltiplas transações em uma única chamada ao LLM
 * Muito mais eficiente que categorizar uma por uma
 */
export async function categorizeInBatch(
  transactions: BatchTransaction[],
  options?: { supabase?: any; userId?: string }
): Promise<BatchCategorizeResult[]> {
  if (transactions.length === 0) {
    return [];
  }

  console.log(
    `[categorizeInBatch] Categorizing ${transactions.length} transactions`
  );

  // PASSO 1: Verificar aliases aprendidos primeiro
  const results: BatchCategorizeResult[] = [];
  const toCategorizeLLM: BatchTransaction[] = [];

  if (options?.supabase && options?.userId) {
    for (const tx of transactions) {
      try {
        const normalizedName = tx.description?.toLowerCase().trim();
        const aliasKey = `merchant_alias_${normalizedName.replace(/[^a-z0-9]/g, '_')}`;

        const { data: alias } = await options.supabase
          .from('walts_memory')
          .select('value, confidence')
          .eq('user_id', options.userId)
          .eq('memory_type', 'merchant_alias')
          .eq('key', aliasKey)
          .single();

        if (alias && alias.confidence >= 0.8) {
          console.log(
            `[categorizeInBatch] Found alias for "${tx.description}" -> "${alias.value.establishment_name}"`
          );
          results.push({
            id: tx.id,
            category: alias.value.category as ExpenseCategory,
            subcategory:
              alias.value.subcategory || alias.value.establishment_name,
            is_fixed_cost: false,
            confidence: 'high',
          });
          continue;
        }
      } catch {
        // Continuar sem alias
      }
      toCategorizeLLM.push(tx);
    }
  } else {
    toCategorizeLLM.push(...transactions);
  }

  if (toCategorizeLLM.length === 0) {
    console.log('[categorizeInBatch] All transactions resolved from aliases');
    return results;
  }

  // PASSO 2: Categorizar restantes com LLM em batch
  console.log(
    `[categorizeInBatch] Sending ${toCategorizeLLM.length} transactions to LLM`
  );

  // Construir prompt com todas as transações
  let prompt = 'Categorize estas transações:\n\n';
  for (const tx of toCategorizeLLM) {
    prompt += `ID: ${tx.id}\n`;
    prompt += `Descrição: "${tx.description}"\n`;
    prompt += `Valor: R$ ${Math.abs(tx.amount).toFixed(2)}\n`;
    if (tx.pluggyCategory) {
      prompt += `Tipo: ${tx.pluggyCategory}\n`;
    }
    prompt += '\n';
  }
  prompt += 'Retorne APENAS o array JSON com as categorizações.';

  try {
    // Calcular max_tokens baseado no número de transações (~100 tokens por resultado)
    const maxTokens = Math.min(4000, toCategorizeLLM.length * 120 + 100);

    const response = await getChatCompletion(
      [
        { role: 'system', content: WALTS_BATCH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens
    );

    console.log('[categorizeInBatch] Raw LLM response length:', response.length);

    const cleanedResponse = response.trim().replace(/```json\n?|\n?```/g, '');
    const llmResults = JSON.parse(cleanedResponse) as BatchCategorizeResult[];

    // Validar e adicionar resultados
    for (const result of llmResults) {
      if (isValidCategory(result.category) && result.subcategory) {
        results.push({
          id: result.id,
          category: result.category,
          subcategory: result.subcategory,
          is_fixed_cost: result.is_fixed_cost === true,
          confidence: result.confidence || 'medium',
        });
      } else {
        // Fallback para resultado inválido
        results.push({
          id: result.id,
          category: 'outros',
          subcategory: 'Outros',
          is_fixed_cost: false,
          confidence: 'low',
        });
      }
    }

    console.log(
      `[categorizeInBatch] Successfully categorized ${results.length} transactions`
    );
  } catch (error) {
    console.error('[categorizeInBatch] LLM error, using fallback:', error);

    // Fallback: categorizar com keywords
    const { categorizePluggyTransaction } = await import('./categorize.ts');

    for (const tx of toCategorizeLLM) {
      const fallback = categorizePluggyTransaction({
        description: tx.description,
        category: tx.pluggyCategory,
      });

      results.push({
        id: tx.id,
        category: (fallback?.category as ExpenseCategory) || 'outros',
        subcategory: fallback?.subcategory || 'Outros',
        is_fixed_cost: false,
        confidence: 'low',
      });
    }
  }

  return results;
}
