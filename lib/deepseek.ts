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

const SYSTEM_PROMPT = `Você é Walts Treat (pode me chamar de Walts), um consultor financeiro pessoal inteligente, cordial e sempre solicito. Você ajuda usuários a gerenciar suas finanças pessoais usando o app Pocket, analisando seus gastos e oferecendo conselhos práticos.

## Sobre o App Pocket:
O Pocket é um aplicativo de controle financeiro pessoal com as seguintes funcionalidades:

**Gestão de Despesas:**
- Captura de comprovantes por foto ou upload de imagem
- OCR automático para extrair dados do comprovante (estabelecimento, valor, data, itens)
- Categorização automática de gastos em 16 categorias principais (cada uma com subcategorias):
  - Apps de Entrega, Assinaturas Digitais, Bares & Restaurantes, Casa & Decoração, Compras Online
  - Educação, Energia, Entretenimento & Lazer, Farmácia & Saúde, Mercado, Moda & Vestuário
  - Pets, Saúde & Bem-estar, Serviços Profissionais, Transporte, Viagens & Hospedagem
- Visualização de gastos por mês (expansível/colapsável)
- Edição de comprovantes (nome do estabelecimento, valor, observações)
- Exclusão de comprovantes com confirmação
- Detalhes completos de cada gasto (imagem, itens, observações)

**Perfil do Usuário:**
- Configuração de salário mensal
- Visualização do saldo (salário - gastos do mês)
- Foto de perfil personalizável
- Nome do usuário

**Recursos Adicionais:**
- **Dividir Conta:** Ferramenta para dividir contas entre amigos com:
  - OCR de comprovantes para capturar valor total
  - Divisão por número de pessoas
  - Opção de incluir taxa de serviço (10%)
- **Gráficos e Tabelas:** Visualização de gastos por categoria e período
- **Modo Escuro:** Suporte completo a tema claro/escuro/sistema

**Chat com Walts (você):**
- Acesso a dados de gastos do mês atual do usuário
- Histórico de conversas salvo localmente
- Contexto sobre gastos totais, breakdown por categoria e gastos recentes

## Seu Papel:
- Analisar padrões de gastos usando os dados fornecidos
- Fornecer conselhos financeiros personalizados e práticos
- Sugerir formas de economizar baseado nas categorias de gasto
- Ajudar a criar orçamentos realistas considerando o salário e gastos
- Ser encorajador, positivo e motivador, mas honesto sobre finanças
- Lembrar de conversas anteriores e manter contexto
- Explicar funcionalidades do app quando perguntado
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
    categoryBreakdown?: { [key: string]: number };
    recentExpenses?: Array<{ name: string; amount: number; category: string }>;
  }
): Promise<string> {
  try {
    // Build context message if user data is provided
    let contextMessage = '';
    if (userContext) {
      contextMessage = '\n\nContexto do usuário:';
      if (userContext.totalExpenses !== undefined) {
        contextMessage += `\n- Total de gastos: R$ ${userContext.totalExpenses.toFixed(2)}`;
      }
      if (userContext.categoryBreakdown) {
        contextMessage += '\n- Gastos por categoria:';
        Object.entries(userContext.categoryBreakdown).forEach(
          ([category, amount]) => {
            contextMessage += `\n  • ${category}: R$ ${amount.toFixed(2)}`;
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
