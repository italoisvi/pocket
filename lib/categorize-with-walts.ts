import { categorizeExpense as fallbackCategorize } from '@/lib/categories';
import type { ExpenseCategory } from '@/lib/categories';

const DEEPSEEK_API_KEY = 'sk-59bfb3091a144736aa266745ac79f595';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

async function getChatCompletion(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await fetch(DEEPSEEK_API_URL, {
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

export interface CategorizeOptions {
  pluggyCategory?: string | null;
  receiverName?: string | null;
  payerName?: string | null;
  amount?: number;
  items?: Array<{ name: string; quantity: number; price: number }>;
}

export interface CategorizeResult {
  category: ExpenseCategory;
  subcategory: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

const WALTS_CATEGORIZATION_SYSTEM_PROMPT = `
Você é Walts, assistente financeiro do app Pocket.
Sua tarefa é categorizar gastos com MÁXIMA PRECISÃO.

# CATEGORIAS DISPONÍVEIS (com subcategorias):

## ESSENCIAIS:
- moradia: [Energia, Água, Gás, Aluguel, Condomínio, IPTU, Internet, Telefone, Seguro]
- alimentacao: [Supermercado, Atacadão, Feira, Açougue, Padaria, Mercearia]
- transporte: [Combustível, Transporte Público, Aplicativos, Estacionamento, Manutenção]
- saude: [Farmácia, Plano de Saúde, Consulta, Exames, Dentista]
- educacao: [Escola, Faculdade, Curso, Idiomas, Material Escolar, Reforço]

## NÃO ESSENCIAIS:
- lazer: [Streaming, Cinema, Shows, Viagem, Academia, Lazer]
- vestuario: [Roupas, Calçados, Acessórios]
- beleza: [Salão, Barbearia, Estética, Cosméticos]
- eletronicos: [Smartphones, Computadores, Acessórios, Games, Lojas]
- delivery: [Apps de Entrega, Restaurantes, Fast Food, Lanches, Bares, Cafeterias, Sorveteria]

## INVESTIMENTOS:
- poupanca: [Poupança]
- previdencia: [Previdência]
- investimentos: [Ações, Fundos, Renda Fixa, Corretora]

## DÍVIDAS:
- cartao_credito: [Cartão]
- emprestimos: [Empréstimo]
- financiamentos: [Veículo, Imóvel, Financiamento]
- transferencias: [PIX Pessoa Fisica, TED/DOC]

## OUTROS:
- outros: [Outros]

# REGRAS DE PRIORIDADE:
1. PIX/Transferências para pessoas físicas → transferencias
2. Pagamentos de cartão/fatura → cartao_credito
3. Contexto é rei: analise o nome completo, não apenas palavras isoladas
4. Em caso de dúvida entre 2 categorias, escolha a mais específica
5. Use o contexto de itens, valor e tipo de transação para melhorar precisão

# FORMATO DE RESPOSTA (RETORNE APENAS JSON VÁLIDO):
{
  "category": "categoria_exata",
  "subcategory": "Subcategoria Exata",
  "confidence": "high|medium|low",
  "reasoning": "Breve explicação de 1 linha"
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
      prompt += `- ${item.name} (Qtd: ${item.quantity}, Preço: R$ ${item.price.toFixed(2)})\n`;
    });
  }

  prompt += `\nRetorne APENAS o JSON de categorização.`;

  return prompt;
}

function isValidCategory(category: string): category is ExpenseCategory {
  const validCategories: ExpenseCategory[] = [
    'moradia',
    'alimentacao',
    'transporte',
    'saude',
    'educacao',
    'lazer',
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

  return validCategories.includes(category as ExpenseCategory);
}

export async function categorizeWithWalts(
  establishmentName: string,
  options?: CategorizeOptions
): Promise<CategorizeResult> {
  try {
    console.log('[categorizeWithWalts] Starting categorization:', {
      establishmentName,
      options,
    });

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

    console.log('[categorizeWithWalts] Success:', result);
    return result;
  } catch (error) {
    console.error('[categorizeWithWalts] Error, using fallback:', error);

    const fallback = fallbackCategorize(establishmentName, options);

    return {
      category: fallback.category,
      subcategory: fallback.subcategory,
      confidence: 'low',
      reasoning: 'Fallback to keyword-based categorization due to error',
    };
  }
}
