/**
 * Categorização inteligente com Walts (LLM)
 * Versão para Deno Edge Functions
 */

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

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
  | 'poupanca'
  | 'previdencia'
  | 'investimentos'
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
- moradia: aluguel, conta de luz, agua, gas, internet, condominio
- alimentacao_casa: supermercado, feira, acougue, padaria para compras de casa
- alimentacao_fora: restaurante, lanchonete, delivery, ifood, bar, cafe
- transporte: combustivel, uber, estacionamento, mecanica
- saude: farmacia, plano de saude, consultas, exames
- educacao: escola, faculdade, cursos, material escolar
- lazer: cinema, streaming (netflix, spotify), viagens, academia, shows
- vestuario: roupas, calcados, acessorios
- beleza: salao, barbearia, cosmeticos
- eletronicos: gadgets, games, acessorios tech
- pets: pet shop, veterinario, racao
- transferencias: PIX para pessoas fisicas
- outros: quando nao se encaixar em nenhuma

# DECIDIR SE E CUSTO FIXO OU VARIAVEL (is_fixed_cost):
VOCE DECIDE LIVREMENTE baseado na natureza do gasto:
- is_fixed_cost = true: gastos RECORRENTES, mensais, previstos
  Exemplos: aluguel, plano de saude, assinatura netflix, conta de luz, escola
- is_fixed_cost = false: gastos EVENTUAIS, pontuais, nao recorrentes
  Exemplos: compra na farmacia, almoco no restaurante, cinema, presente, compra de roupa

NAO HA REGRA FIXA - analise o contexto:
- Farmacia EVENTUAL (remedio para gripe) = is_fixed_cost: false
- Farmacia MENSAL (remedio continuo) = is_fixed_cost: true
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
    'poupanca',
    'previdencia',
    'investimentos',
    'cartao_credito',
    'emprestimos',
    'financiamentos',
    'transferencias',
    'outros',
  ];

  return validCategories.includes(category as ExpenseCategory);
}

async function getChatCompletion(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error: ${errorText}`);
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
