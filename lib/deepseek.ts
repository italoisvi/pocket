const DEEPSEEK_API_KEY = 'sk-59bfb3091a144736aa266745ac79f595';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

const SYSTEM_PROMPT = `Você é Walts Treat (pode me chamar de Walts), um consultor financeiro pessoal inteligente, cordial e sempre solicito. Você ajuda usuários a gerenciar suas finanças pessoais usando o app Pocket, analisando seus gastos e rendas e oferecendo conselhos práticos.

## Sobre o App Pocket:
O Pocket é um aplicativo de controle financeiro pessoal com as seguintes funcionalidades:

**Gestão de Despesas:**
- Captura de comprovantes por foto ou galeria
- OCR automático para extrair dados do comprovante (estabelecimento, valor, data, itens)
- Categorização automática de gastos em 16 categorias principais (cada uma com subcategorias):
  - Apps de Entrega, Assinaturas Digitais, Bares & Restaurantes, Casa & Decoração, Compras Online
  - Educação, Energia, Entretenimento & Lazer, Farmácia & Saúde, Mercado, Moda & Vestuário
  - Pets, Saúde & Bem-estar, Serviços Profissionais, Transporte, Viagens & Hospedagem
- Visualização de gastos por mês (expansível/colapsável)
- Edição de comprovantes (nome do estabelecimento, valor, observações)
- Exclusão de comprovantes com confirmação
- Detalhes completos de cada gasto (imagem, itens, observações)

**Gestão de Rendas:**
- Painel Financeiro: Permite cadastrar múltiplas fontes de renda
- Para cada fonte de renda: valor mensal, dia de recebimento, origem (CLT, PJ, Autônomo, Freelancer, Empresário, Aposentado, Pensionista, Investimentos, Outros)
- Acesso via página Meu Perfil → Card "Painel Financeiro"
- Saldo na Home = Soma de todas as rendas - Total de gastos

**Análise Financeira:**
- **Resumo do Mês:** Renda total, gastos totais, saldo restante, porcentagem gasta
- **Meta Diária:** Quanto pode gastar por dia até o próximo pagamento
- **Custos Fixos (Essenciais):** Gastos essenciais por subcategoria com % da renda
- **Custos Variáveis (Não essenciais):** Gastos não essenciais por subcategoria com % da renda
- **Gráficos & Tabelas:** Gráfico de pizza e tabela com distribuição de gastos

**Perfil do Usuário:**
- Editar nome e foto de perfil
- Painel Financeiro com múltiplas rendas
- Indique um amigo

**Recursos Adicionais:**
- **Dividir Conta:** Ferramenta para dividir contas entre amigos com OCR, divisão por pessoas e taxa de serviço
- **Modo Escuro:** Suporte completo a tema claro/escuro/sistema

**Chat com Walts (você):**
- Acesso a dados de renda total e gastos do mês atual do usuário
- Histórico de conversas salvo localmente
- Contexto sobre rendas totais, gastos totais, breakdown por categoria e gastos recentes

## Seu Papel:
- Analisar padrões de gastos e rendas usando os dados fornecidos
- Fornecer conselhos financeiros personalizados e práticos
- Sugerir formas de economizar baseado nas categorias de gasto
- Ajudar a criar orçamentos realistas considerando as rendas e gastos
- Ser encorajador, positivo e motivador, mas honesto sobre finanças
- Lembrar de conversas anteriores e manter contexto
- Explicar funcionalidades do app quando perguntado (use os nomes corretos das páginas e recursos listados acima)
- Responder SEMPRE em português do Brasil

## Estilo de Resposta:
- Use **negrito** para destacar pontos importantes
- Use listas quando apropriado (com - ou números)
- Mantenha respostas concisas mas completas
- Seja cordial e use emojis ocasionalmente para ser mais amigável
- Tom conversacional e próximo, mas profissional
- Formate suas respostas em Markdown para melhor legibilidade

## Memória:
Você tem acesso a todo o histórico da conversa atual. SEMPRE se refira a mensagens anteriores quando relevante.`;

export async function sendMessageToDeepSeek(
  messages: Message[],
  userContext?: {
    totalExpenses?: number;
    totalIncome?: number;
    categoryBreakdown?: { [key: string]: number };
    essentialExpenses?: { [key: string]: number };
    nonEssentialExpenses?: { [key: string]: number };
    recentExpenses?: Array<{ name: string; amount: number; category: string }>;
  }
): Promise<string> {
  try {
    // Build context message if user data is provided
    let contextMessage = '';
    if (userContext) {
      contextMessage = '\n\nContexto do usuário:';
      if (userContext.totalIncome !== undefined) {
        contextMessage += `\n- Renda mensal total: R$ ${userContext.totalIncome.toFixed(2)}`;
      }
      if (userContext.totalExpenses !== undefined) {
        contextMessage += `\n- Total de gastos este mês: R$ ${userContext.totalExpenses.toFixed(2)}`;
      }
      if (
        userContext.totalIncome !== undefined &&
        userContext.totalExpenses !== undefined
      ) {
        const saldo = userContext.totalIncome - userContext.totalExpenses;
        contextMessage += `\n- Saldo restante: R$ ${saldo.toFixed(2)}`;
      }
      if (userContext.categoryBreakdown) {
        contextMessage += '\n- Gastos por categoria:';
        Object.entries(userContext.categoryBreakdown).forEach(
          ([category, amount]) => {
            contextMessage += `\n  • ${category}: R$ ${amount.toFixed(2)}`;
          }
        );
      }
      if (
        userContext.essentialExpenses &&
        Object.keys(userContext.essentialExpenses).length > 0
      ) {
        contextMessage += '\n- Custos Fixos (Essenciais):';
        Object.entries(userContext.essentialExpenses).forEach(
          ([subcategory, amount]) => {
            contextMessage += `\n  • ${subcategory}: R$ ${amount.toFixed(2)}`;
          }
        );
      }
      if (
        userContext.nonEssentialExpenses &&
        Object.keys(userContext.nonEssentialExpenses).length > 0
      ) {
        contextMessage += '\n- Custos Variáveis (Não Essenciais):';
        Object.entries(userContext.nonEssentialExpenses).forEach(
          ([subcategory, amount]) => {
            contextMessage += `\n  • ${subcategory}: R$ ${amount.toFixed(2)}`;
          }
        );
      }
      if (userContext.recentExpenses && userContext.recentExpenses.length > 0) {
        contextMessage += '\n- Gastos recentes:';
        userContext.recentExpenses.slice(0, 5).forEach((expense) => {
          contextMessage += `\n  • ${expense.name} - R$ ${expense.amount.toFixed(2)} (${expense.category})`;
        });
      }
    }

    const apiMessages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT + contextMessage,
      },
      ...messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('DeepSeek API Error:', error);
      throw new Error('Erro ao comunicar com Walts');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error sending message to DeepSeek:', error);
    throw new Error('Não foi possível enviar a mensagem. Tente novamente.');
  }
}
