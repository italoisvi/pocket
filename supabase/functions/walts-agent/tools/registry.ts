/**
 * Tool Definitions (OpenAI Function Calling Format)
 *
 * Cada tool DEVE ter descrição clara de:
 * - QUANDO usar
 * - O que retorna
 * - Parâmetros obrigatórios vs opcionais
 */

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_financial_context',
      description: `Busca o contexto financeiro ATUALIZADO do usuário.

USE ESTA FERRAMENTA QUANDO:
- O usuário perguntar sobre gastos que NÃO estão nos "últimos gastos" do contexto
- Precisar de dados do mês ANTERIOR ou período específico
- O contexto inicial parecer desatualizado

NÃO USE SE:
- A informação já está no contexto do sistema (renda, saldo, orçamentos atuais)

Retorna: total de receitas, gastos, saldo, orçamentos com uso, últimos 20 gastos.`,
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description:
              'Período a buscar. Valores: "current_month" (padrão), "last_month", "last_7_days", "last_30_days"',
            enum: [
              'current_month',
              'last_month',
              'last_7_days',
              'last_30_days',
            ],
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_expense',
      description: `Cria um NOVO registro de gasto manual para o usuario.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir para REGISTRAR um gasto NOVO (ex: "gastei 50 no mercado")
- Usuario mencionar uma compra que quer ADICIONAR ao sistema
- Usuario enviar cupom fiscal para REGISTRAR

IMPORTANTE - NAO CONFUNDA COM CATEGORIZAR:
- Esta ferramenta CRIA um gasto NOVO que NAO existia
- DEBITA do saldo do usuario
- Aparece na HOME como nova despesa
- Se o usuario quer CATEGORIZAR uma transacao do extrato bancario, use recategorize_transaction

NAO USE ESTA FERRAMENTA QUANDO:
- Usuario quiser categorizar transacao do extrato bancario
- Usuario disser "categorizar essa saida do banco"
- A transacao ja existe no sistema (veio do Open Finance)

Retorna: ID do gasto criado, valor, categoria atribuida.`,
      parameters: {
        type: 'object',
        properties: {
          establishment_name: {
            type: 'string',
            description:
              'Nome do estabelecimento/loja (ex: "Supermercado Extra", "Uber", "iFood")',
          },
          amount: {
            type: 'number',
            description: 'Valor do gasto em reais (ex: 50.90, 120, 15.50)',
          },
          date: {
            type: 'string',
            description:
              'Data do gasto no formato YYYY-MM-DD. Se não especificado, usa data de hoje.',
          },
          category: {
            type: 'string',
            description:
              'Categoria do gasto. Se não especificado, será inferida automaticamente.',
            enum: [
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
              'outros',
            ],
          },
          notes: {
            type: 'string',
            description: 'Observações adicionais sobre o gasto (opcional)',
          },
        },
        required: ['establishment_name', 'amount'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_budget',
      description: `Cria um novo orçamento/limite de gastos para uma categoria.

USE ESTA FERRAMENTA QUANDO:
- Usuário pedir para criar um limite de gastos (ex: "quero gastar no máximo 500 em delivery")
- Usuário querer controlar gastos de uma categoria específica

IMPORTANTE:
- Verificar se já existe orçamento para a categoria antes de criar
- Período padrão é mensal

Retorna: ID do orçamento criado, categoria, valor limite.`,
      parameters: {
        type: 'object',
        properties: {
          category_id: {
            type: 'string',
            description: 'Categoria para o orçamento',
            enum: [
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
              'outros',
            ],
          },
          amount: {
            type: 'number',
            description: 'Valor limite do orçamento em reais',
          },
          period_type: {
            type: 'string',
            description: 'Período do orçamento',
            enum: ['monthly', 'weekly', 'yearly'],
          },
          notifications_enabled: {
            type: 'boolean',
            description:
              'Se deve enviar notificações quando se aproximar do limite (padrão: true)',
          },
        },
        required: ['category_id', 'amount'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_memory',
      description: `Busca informações nas memórias/histórico de conversas do usuário.

USE ESTA FERRAMENTA QUANDO:
- Usuário perguntar algo sobre conversas anteriores
- Precisar de contexto histórico (ex: "o que conversamos sobre economia?")
- Buscar preferências ou metas definidas anteriormente

NÃO USE SE:
- A informação está no contexto atual
- É uma pergunta sobre dados financeiros (use get_financial_context)

Retorna: Lista de memórias relevantes com conteúdo e data.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Texto de busca descrevendo o que procura (ex: "meta de economia", "conversa sobre cartão")',
          },
          limit: {
            type: 'number',
            description:
              'Quantidade máxima de resultados (padrão: 5, máximo: 10)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_user_preference',
      description: `Salva uma preferência ou informação importante do usuário para lembrar no futuro.

USE ESTA FERRAMENTA QUANDO:
- Usuário mencionar uma preferência pessoal (ex: "prefiro não receber alertas de manhã")
- Usuário definir uma meta financeira (ex: "quero economizar 1000 por mês")
- Aprender algo relevante sobre o usuário que deve ser lembrado

IMPORTANTE:
- Use chaves descritivas em snake_case
- Valor pode ser string, número ou objeto
- Confidence: 1.0 para afirmações diretas, 0.7-0.9 para inferências

Retorna: Confirmação do que foi salvo.`,
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'Chave identificadora da preferência em snake_case (ex: "savings_goal", "preferred_notification_time")',
          },
          value: {
            type: 'string',
            description:
              'Valor da preferência (pode ser texto, número como string, ou JSON)',
          },
          confidence: {
            type: 'number',
            description:
              'Nível de confiança de 0 a 1. Use 1.0 para afirmações diretas do usuário, 0.7-0.9 para inferências.',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_budget_status',
      description: `Verifica o status detalhado de um ou todos os orçamentos do usuário.

USE ESTA FERRAMENTA QUANDO:
- Usuário perguntar quanto já gastou em uma categoria
- Usuário quiser saber se está dentro do orçamento
- Precisar de dados detalhados de uso de orçamento

Retorna: Para cada orçamento: categoria, limite, gasto atual, % usado, saldo restante.`,
      parameters: {
        type: 'object',
        properties: {
          category_id: {
            type: 'string',
            description:
              'Categoria específica para verificar. Se não fornecido, retorna todos os orçamentos.',
            enum: [
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
              'outros',
            ],
          },
        },
        required: [],
      },
    },
  },
  // ============================================================================
  // OPEN FINANCE TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'get_bank_accounts',
      description: `Lista todas as contas bancarias e cartoes conectados via Open Finance.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre saldo bancario
- Usuario perguntar quais bancos estao conectados
- Usuario perguntar sobre cartao de credito ou limite
- Usuario perguntar "quanto tenho na conta?"

RETORNA:
- Lista de contas com saldos atuais
- Tipo (conta corrente ou cartao de credito)
- Limite de credito disponivel
- Data da ultima sincronizacao
- Totais agregados (saldo total, credito usado)`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'sync_bank_accounts',
      description: `Sincroniza/atualiza transacoes bancarias via Open Finance.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir para atualizar dados bancarios
- Usuario mencionar que dados estao desatualizados
- Usuario quiser ver transacoes mais recentes

IMPORTANTE:
- A sincronizacao pode levar alguns segundos
- Informe o usuario que os dados estao sendo atualizados`,
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description:
              'ID da conta especifica para sincronizar. Se nao fornecido, sincroniza todas.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_bank_transactions',
      description: `Busca transacoes importadas do Open Finance (bancos conectados).

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre transacoes bancarias especificas
- Usuario quiser ver historico de debitos/creditos de um banco
- Usuario perguntar "o que caiu na minha conta?"

RETORNA:
- Lista de transacoes bancarias
- Debitos e creditos separados
- Status (confirmado ou pendente)
- Totais agregados`,
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'Filtrar por conta especifica',
          },
          start_date: {
            type: 'string',
            description: 'Data inicio no formato YYYY-MM-DD',
          },
          end_date: {
            type: 'string',
            description: 'Data fim no formato YYYY-MM-DD',
          },
          limit: {
            type: 'number',
            description: 'Maximo de resultados (padrao 20, maximo 100)',
          },
          type: {
            type: 'string',
            description: 'Filtrar por tipo de transacao',
            enum: ['DEBIT', 'CREDIT'],
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_bank_sync_status',
      description: `Verifica status de sincronizacao dos bancos conectados.

USE ESTA FERRAMENTA QUANDO:
- Usuario relatar problemas com sincronizacao
- Usuario perguntar se os dados estao atualizados
- Antes de responder sobre saldos (verificar se ha erros)

RETORNA:
- Status de cada banco (atualizado, erro, sincronizando)
- Ultima sincronizacao bem sucedida
- Erros que precisam atencao do usuario`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  // ============================================================================
  // EXPENSE MANAGEMENT TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'update_expense',
      description: `Atualiza um gasto existente.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser corrigir um gasto (valor, data, categoria)
- Usuario mencionar que um gasto esta errado
- Usuario quiser adicionar notas a um gasto

IMPORTANTE:
- Precisa do ID do gasto a ser atualizado
- So atualiza os campos fornecidos, demais permanecem`,
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
          date: {
            type: 'string',
            description: 'Nova data no formato YYYY-MM-DD',
          },
          category: {
            type: 'string',
            description: 'Nova categoria',
            enum: [
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
              'transferencias',
              'outros',
            ],
          },
          subcategory: {
            type: 'string',
            description:
              'Subcategoria ou nome do estabelecimento (ex: Lanche, Uber, Farmacia)',
          },
          is_fixed_cost: {
            type: 'boolean',
            description:
              'Se e custo fixo (recorrente mensal) ou variavel (eventual)',
          },
          notes: {
            type: 'string',
            description: 'Novas observacoes',
          },
        },
        required: ['expense_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_expense',
      description: `Deleta um gasto existente.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir para remover um gasto
- Usuario mencionar que registrou um gasto errado/duplicado
- Usuario quiser excluir uma despesa

IMPORTANTE:
- Confirme com o usuario antes de deletar
- Acao irreversivel`,
      parameters: {
        type: 'object',
        properties: {
          expense_id: {
            type: 'string',
            description: 'ID do gasto a ser deletado',
          },
        },
        required: ['expense_id'],
      },
    },
  },
  // ============================================================================
  // BUDGET MANAGEMENT TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'update_budget',
      description: `Atualiza um orcamento existente.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser alterar o limite de um orcamento
- Usuario quiser ativar/desativar notificacoes
- Usuario quiser mudar o periodo do orcamento

IMPORTANTE:
- Precisa do ID do orcamento ou categoria`,
      parameters: {
        type: 'object',
        properties: {
          budget_id: {
            type: 'string',
            description: 'ID do orcamento (alternativa a category_id)',
          },
          category_id: {
            type: 'string',
            description: 'Categoria do orcamento a atualizar',
            enum: [
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
              'outros',
            ],
          },
          amount: {
            type: 'number',
            description: 'Novo valor limite',
          },
          period_type: {
            type: 'string',
            description: 'Novo periodo',
            enum: ['monthly', 'weekly', 'yearly'],
          },
          notifications_enabled: {
            type: 'boolean',
            description: 'Ativar/desativar notificacoes',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_budget',
      description: `Remove um orcamento existente.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser parar de monitorar uma categoria
- Usuario pedir para remover limite de gastos

IMPORTANTE:
- Confirme com o usuario antes de deletar`,
      parameters: {
        type: 'object',
        properties: {
          budget_id: {
            type: 'string',
            description: 'ID do orcamento (alternativa a category_id)',
          },
          category_id: {
            type: 'string',
            description: 'Categoria do orcamento a remover',
            enum: [
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
              'outros',
            ],
          },
        },
        required: [],
      },
    },
  },
  // ============================================================================
  // ANALYSIS & PATTERNS TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'get_financial_patterns',
      description: `Busca padroes financeiros detectados do usuario.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre seus habitos de gastos
- Usuario quiser entender seus padroes
- Precisar de contexto sobre comportamento financeiro

RETORNA:
- Padroes de gastos recorrentes
- Comerciantes frequentes
- Dias preferidos para compras
- Confianca de cada padrao`,
      parameters: {
        type: 'object',
        properties: {
          pattern_type: {
            type: 'string',
            description: 'Tipo especifico de padrao para buscar',
            enum: [
              'recurring_expense',
              'frequent_merchant',
              'spending_day_pattern',
              'category_preference',
            ],
          },
          category: {
            type: 'string',
            description: 'Filtrar por categoria',
          },
          min_confidence: {
            type: 'number',
            description: 'Confianca minima (0-1, padrao 0.5)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_past_analyses',
      description: `Busca analises financeiras anteriores (Raio-X financeiro, etc).

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre analises passadas
- Usuario quiser comparar com periodos anteriores
- Precisar de contexto sobre evolucao financeira

RETORNA:
- Analises anteriores com data
- Tipo de analise
- Dados de contexto`,
      parameters: {
        type: 'object',
        properties: {
          analysis_type: {
            type: 'string',
            description: 'Tipo de analise',
            enum: ['raio_x_financeiro', 'monthly_summary', 'spending_alert'],
          },
          limit: {
            type: 'number',
            description: 'Maximo de resultados (padrao 5)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_charts_data',
      description: `Busca dados que aparecem na tela de Graficos & Tabelas do app.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre graficos ou distribuicao de gastos
- Usuario perguntar "como estao meus gastos por categoria?"
- Usuario quiser ver resumo visual ou por categoria
- Usuario perguntar "o que tem na pagina de graficos?"
- Usuario perguntar sobre percentual gasto por categoria

IMPORTANTE:
- Esta ferramenta combina gastos MANUAIS + transacoes CATEGORIZADAS do extrato
- Retorna exatamente os mesmos dados da tela Graficos & Tabelas
- Inclui comparacao com periodo anterior

RETORNA:
- Gastos agrupados por categoria
- Totais por categoria
- Percentuais de cada categoria
- Comparacao com periodo anterior`,
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Periodo a analisar',
            enum: ['last7days', 'last15days', 'month'],
          },
          month: {
            type: 'string',
            description:
              'Mes especifico no formato YYYY-MM (quando period=month)',
          },
        },
        required: [],
      },
    },
  },
  // ============================================================================
  // CONVERSATION MANAGEMENT TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'list_conversations',
      description: `Lista conversas anteriores do usuario.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre conversas anteriores
- Usuario quiser ver historico de conversas
- Usuario perguntar "o que conversamos sobre X?"

RETORNA:
- Lista de conversas com titulos e datas
- Quantas conversas existem`,
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximo de conversas a retornar (padrao 10)',
          },
          search: {
            type: 'string',
            description: 'Buscar conversas por titulo',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_conversation',
      description: `Busca detalhes de uma conversa especifica.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser ver uma conversa especifica
- Precisar de contexto de uma conversa anterior

RETORNA:
- Detalhes da conversa
- Ultimas mensagens (se solicitado)`,
      parameters: {
        type: 'object',
        properties: {
          conversation_id: {
            type: 'string',
            description: 'ID da conversa',
          },
          include_messages: {
            type: 'boolean',
            description: 'Incluir ultimas mensagens (padrao false)',
          },
        },
        required: ['conversation_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_conversation_title',
      description: `Renomeia uma conversa.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir para renomear uma conversa
- Usuario quiser dar um titulo melhor

IMPORTANTE:
- Confirme o novo titulo com o usuario`,
      parameters: {
        type: 'object',
        properties: {
          conversation_id: {
            type: 'string',
            description: 'ID da conversa',
          },
          title: {
            type: 'string',
            description: 'Novo titulo da conversa',
          },
        },
        required: ['conversation_id', 'title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_conversation',
      description: `Remove uma conversa do historico.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir para deletar uma conversa
- Usuario quiser limpar historico

IMPORTANTE:
- Confirme com o usuario antes de deletar
- Acao irreversivel`,
      parameters: {
        type: 'object',
        properties: {
          conversation_id: {
            type: 'string',
            description: 'ID da conversa a deletar',
          },
        },
        required: ['conversation_id'],
      },
    },
  },
  // ============================================================================
  // RECURRING/FIXED COSTS TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'list_fixed_costs',
      description: `Lista todos os custos fixos mensais identificados.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre custos fixos
- Usuario quiser saber suas assinaturas
- Usuario perguntar "quanto gasto com fixos?"

RETORNA:
- Custos fixos confirmados
- Custos fixos estimados (se solicitado)
- Total mensal`,
      parameters: {
        type: 'object',
        properties: {
          include_estimated: {
            type: 'boolean',
            description:
              'Incluir custos estimados baseados em padroes (padrao false)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'detect_recurring_expenses',
      description: `Detecta gastos que se repetem mensalmente.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre gastos recorrentes
- Usuario quiser identificar assinaturas
- Usuario perguntar "quais gastos se repetem?"

RETORNA:
- Assinaturas detectadas (valores consistentes)
- Outros gastos recorrentes
- Nivel de confianca de cada deteccao`,
      parameters: {
        type: 'object',
        properties: {
          min_occurrences: {
            type: 'number',
            description:
              'Minimo de ocorrencias para considerar recorrente (padrao 2)',
          },
          min_months: {
            type: 'number',
            description: 'Minimo de meses diferentes com o gasto (padrao 2)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calculate_fixed_costs_total',
      description: `Calcula o total de custos fixos por categoria.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar total de custos fixos
- Usuario quiser ver custos fixos por categoria
- Precisar calcular comprometimento de renda

RETORNA:
- Total por categoria
- Total geral
- Insights sobre os custos`,
      parameters: {
        type: 'object',
        properties: {
          group_by: {
            type: 'string',
            description: 'Agrupar por categoria ou tipo',
            enum: ['category', 'type'],
          },
        },
        required: [],
      },
    },
  },
  // ============================================================================
  // ADVANCED ANALYSIS TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'generate_raio_x',
      description: `Gera analise completa Raio-X Financeiro.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir "faz um raio-x", "analisa minhas financas"
- Usuario quiser visao geral completa
- Usuario perguntar "como estao minhas financas?"

RETORNA:
- Resumo de receitas e despesas
- Divisao por categoria
- Status de orcamentos
- Projecoes (se solicitado)
- Insights e alertas`,
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Periodo a analisar',
            enum: ['current_month', 'last_month', 'last_3_months'],
          },
          include_predictions: {
            type: 'boolean',
            description: 'Incluir projecoes para fim do mes (padrao false)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compare_periods',
      description: `Compara gastos entre dois periodos.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "gastei mais esse mes ou mes passado?"
- Usuario quiser comparar periodos
- Usuario perguntar "como foi janeiro vs dezembro?"

RETORNA:
- Totais de cada periodo
- Diferenca e variacao percentual
- Comparacao por categoria`,
      parameters: {
        type: 'object',
        properties: {
          period1: {
            type: 'string',
            description: 'Primeiro periodo (YYYY-MM)',
          },
          period2: {
            type: 'string',
            description: 'Segundo periodo (YYYY-MM)',
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filtrar por categorias especificas (opcional)',
          },
        },
        required: ['period1', 'period2'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'forecast_month_end',
      description: `Projeta gastos e saldo ate fim do mes.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "vou estourar o orcamento?"
- Usuario perguntar "como vai terminar o mes?"
- Usuario quiser saber se vai sobrar dinheiro

RETORNA:
- Projecao de gastos totais
- Saldo projetado
- Media diaria de gastos
- Meta diaria sugerida`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'detect_anomalies',
      description: `Detecta gastos fora do padrao normal.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "tem algo estranho nos meus gastos?"
- Usuario quiser identificar gastos anormais
- Verificar se houve gastos suspeitos

RETORNA:
- Lista de gastos anomalos
- Faixa esperada por categoria
- Nivel de desvio de cada anomalia`,
      parameters: {
        type: 'object',
        properties: {
          sensitivity: {
            type: 'string',
            description: 'Sensibilidade da deteccao',
            enum: ['low', 'medium', 'high'],
          },
        },
        required: [],
      },
    },
  },
  // ============================================================================
  // PROFILE MANAGEMENT TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'update_profile',
      description: `Atualiza dados do perfil do usuario.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser mudar nome
- Usuario quiser ativar/desativar alertas de divida
- Usuario quiser definir conta de salario

IMPORTANTE:
- Confirme a alteracao com o usuario`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Novo nome do usuario',
          },
          debt_notifications_enabled: {
            type: 'boolean',
            description: 'Ativar alertas de divida',
          },
          salary_bank_account_id: {
            type: 'string',
            description: 'ID da conta que recebe salario',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_income_card',
      description: `Adiciona nova fonte de renda.

USE ESTA FERRAMENTA QUANDO:
- Usuario mencionar nova renda ("tenho um freela", "comecei novo emprego")
- Usuario quiser adicionar renda extra
- Usuario disser "recebo X no dia Y"`,
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Valor mensal da renda',
          },
          day: {
            type: 'number',
            description: 'Dia do mes que recebe (1-31)',
          },
          source: {
            type: 'string',
            description: 'Tipo de fonte de renda',
            enum: [
              'CLT',
              'PJ',
              'Autonomo',
              'Freelancer',
              'Empresario',
              'Aposentado',
              'Pensionista',
              'Investimentos',
              'Outros',
            ],
          },
          linked_account_id: {
            type: 'string',
            description: 'ID da conta bancaria onde cai (opcional)',
          },
        },
        required: ['amount', 'day', 'source'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_income_card',
      description: `Atualiza fonte de renda existente.

USE ESTA FERRAMENTA QUANDO:
- Usuario mencionar mudanca de salario
- Usuario mudar dia de pagamento
- Usuario corrigir valor de renda`,
      parameters: {
        type: 'object',
        properties: {
          income_card_id: {
            type: 'string',
            description: 'ID da fonte de renda a atualizar',
          },
          amount: {
            type: 'number',
            description: 'Novo valor mensal',
          },
          day: {
            type: 'number',
            description: 'Novo dia de pagamento',
          },
          source: {
            type: 'string',
            description: 'Nova fonte',
            enum: [
              'CLT',
              'PJ',
              'Autonomo',
              'Freelancer',
              'Empresario',
              'Aposentado',
              'Pensionista',
              'Investimentos',
              'Outros',
            ],
          },
        },
        required: ['income_card_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_income_card',
      description: `Remove fonte de renda.

USE ESTA FERRAMENTA QUANDO:
- Usuario mencionar que perdeu renda
- Usuario quiser remover fonte de renda
- Usuario disser "nao tenho mais aquele freela"

IMPORTANTE:
- Confirme antes de remover`,
      parameters: {
        type: 'object',
        properties: {
          income_card_id: {
            type: 'string',
            description: 'ID da fonte de renda a remover',
          },
        },
        required: ['income_card_id'],
      },
    },
  },
  // ============================================================================
  // FINANCIAL GOALS TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'create_financial_goal',
      description: `Cria meta financeira de longo prazo.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser definir meta de economia
- Usuario mencionar "quero juntar X ate Y"
- Usuario falar de objetivos financeiros`,
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Nome da meta (ex: "Viagem Europa", "Entrada carro")',
          },
          target_amount: {
            type: 'number',
            description: 'Valor total da meta',
          },
          target_date: {
            type: 'string',
            description: 'Data limite (YYYY-MM-DD)',
          },
          category: {
            type: 'string',
            description:
              'Categoria da meta (ex: "viagem", "veiculo", "emergencia")',
          },
          initial_amount: {
            type: 'number',
            description: 'Valor ja guardado (padrao 0)',
          },
        },
        required: ['title', 'target_amount', 'target_date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'track_goal_progress',
      description: `Acompanha progresso de metas financeiras.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "como esta minha meta?"
- Usuario quiser ver progresso de economia
- Usuario perguntar "vou conseguir juntar a tempo?"`,
      parameters: {
        type: 'object',
        properties: {
          goal_id: {
            type: 'string',
            description: 'ID da meta especifica (opcional)',
          },
          title: {
            type: 'string',
            description: 'Buscar meta por titulo (opcional)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'suggest_savings_plan',
      description: `Sugere plano de economia para atingir meta.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "como economizo para minha meta?"
- Usuario quiser saber onde cortar gastos
- Usuario pedir sugestao de economia`,
      parameters: {
        type: 'object',
        properties: {
          goal_id: {
            type: 'string',
            description: 'ID da meta (opcional se target_amount fornecido)',
          },
          target_amount: {
            type: 'number',
            description: 'Valor a economizar (alternativa a goal_id)',
          },
          months: {
            type: 'number',
            description: 'Prazo em meses (padrao 12)',
          },
          aggressive: {
            type: 'boolean',
            description: 'Plano agressivo com mais cortes (padrao false)',
          },
        },
        required: [],
      },
    },
  },
  // ============================================================================
  // CATEGORIZATION TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'recategorize_transaction',
      description: `Categoriza ou recategoriza uma transacao do EXTRATO BANCARIO (Open Finance).

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser CATEGORIZAR transacao do extrato bancario
- Usuario disser "categorizar essa saida/entrada do banco"
- Usuario quiser que transacao apareca em Custos Fixos ou Variaveis
- Usuario corrigir categoria de transacao do Open Finance
- Usuario disser "esse gasto e de outra categoria" (para transacao do extrato)
- Usuario quiser organizar extrato por categorias

IMPORTANTE - DIFERENCA DE create_expense:
- Esta ferramenta NAO cria gasto novo
- NAO debita do saldo (transacao ja existe no extrato)
- APENAS define categoria para organizacao
- Faz aparecer em CUSTOS FIXOS ou CUSTOS VARIAVEIS no app

NAO USE ESTA FERRAMENTA PARA:
- Adicionar gasto manual novo (use create_expense)
- Registrar compra que nao esta no extrato`,
      parameters: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'ID da transacao',
          },
          category: {
            type: 'string',
            description: 'Nova categoria',
            enum: [
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
              'outros',
            ],
          },
          subcategory: {
            type: 'string',
            description: 'Subcategoria (opcional)',
          },
          is_fixed_cost: {
            type: 'boolean',
            description: 'Marcar como custo fixo',
          },
          save_as_pattern: {
            type: 'boolean',
            description: 'Salvar como padrao para futuras categorizacoes',
          },
        },
        required: ['transaction_id', 'category'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'mark_as_fixed_cost',
      description: `Marca transacao como custo fixo recorrente.

USE ESTA FERRAMENTA QUANDO:
- Usuario disser "isso e custo fixo"
- Usuario mencionar assinatura ou conta mensal
- Usuario quiser marcar gasto como recorrente`,
      parameters: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'ID da transacao',
          },
          monthly_amount: {
            type: 'number',
            description:
              'Valor mensal estimado (usa valor da transacao se omitido)',
          },
        },
        required: ['transaction_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_uncategorized',
      description: `Lista transacoes sem categoria adequada.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "o que precisa categorizar?"
- Usuario quiser ver gastos sem categoria
- Antes de oferecer ajuda com categorizacao`,
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximo de resultados (padrao 20)',
          },
          start_date: {
            type: 'string',
            description: 'Data inicial (YYYY-MM-DD)',
          },
        },
        required: [],
      },
    },
  },
  // ============================================================================
  // ALERTS AND MONITORING TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'create_spending_alert',
      description: `Cria alerta quando gasto de categoria ultrapassa valor.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir "me avisa se X passar de Y"
- Usuario quiser limite de alerta
- Usuario mencionar monitorar categoria`,
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Categoria a monitorar',
            enum: [
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
              'outros',
            ],
          },
          threshold: {
            type: 'number',
            description: 'Valor limite para disparar alerta',
          },
          notification_type: {
            type: 'string',
            description: 'Tipo de notificacao',
            enum: ['push', 'email', 'both'],
          },
        },
        required: ['category', 'threshold'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_pending_alerts',
      description: `Verifica alertas pendentes/disparados.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "tenho algum alerta?"
- Usuario quiser saber status dos alertas
- No inicio de conversa para proatividade`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'configure_debt_notifications',
      description: `Ativa/desativa notificacoes de divida.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser alertas de fatura
- Usuario desativar notificacoes de cartao
- Usuario mencionar alertas de divida`,
      parameters: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Ativar (true) ou desativar (false)',
          },
        },
        required: ['enabled'],
      },
    },
  },
  // ============================================================================
  // REPORTS AND EXPORT TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'generate_monthly_report',
      description: `Gera relatorio completo de um mes.

USE ESTA FERRAMENTA QUANDO:
- Usuario pedir "relatorio de janeiro"
- Usuario quiser resumo do mes
- Usuario perguntar "como foi meu mes?"`,
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: 'Mes no formato YYYY-MM',
          },
          format: {
            type: 'string',
            description: 'Nivel de detalhe',
            enum: ['summary', 'detailed'],
          },
        },
        required: ['month'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'export_data',
      description: `Exporta dados financeiros do usuario.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser baixar dados
- Usuario pedir exportacao em CSV ou JSON
- Usuario mencionar backup de dados`,
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Tipo de dados a exportar',
            enum: ['expenses', 'budgets', 'transactions', 'all'],
          },
          period: {
            type: 'string',
            description: 'Periodo (YYYY-MM ou YYYY-MM:YYYY-MM para range)',
          },
          format: {
            type: 'string',
            description: 'Formato de saida',
            enum: ['csv', 'json'],
          },
        },
        required: ['type'],
      },
    },
  },
  // ============================================================================
  // INTELLIGENT SUGGESTIONS TOOLS
  // ============================================================================
  {
    type: 'function' as const,
    function: {
      name: 'suggest_budget_adjustments',
      description: `Analisa padroes e sugere ajustes nos orcamentos.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "como ajusto meus orcamentos?"
- Usuario quiser otimizar orcamentos
- Usuario mencionar orcamentos desajustados`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'suggest_categories_to_cut',
      description: `Identifica categorias onde pode economizar.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "onde posso economizar X?"
- Usuario quiser cortar gastos
- Usuario mencionar meta de economia`,
      parameters: {
        type: 'object',
        properties: {
          target_savings: {
            type: 'number',
            description: 'Valor mensal que quer economizar',
          },
        },
        required: ['target_savings'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_cashflow_prediction',
      description: `Preve entradas e saidas futuras.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar "como vai estar meu caixa em X meses?"
- Usuario quiser previsao financeira
- Usuario planejar futuro financeiro`,
      parameters: {
        type: 'object',
        properties: {
          months_ahead: {
            type: 'number',
            description: 'Quantos meses prever (max 12)',
          },
        },
        required: ['months_ahead'],
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['function']['name'];
