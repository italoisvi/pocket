import type {
  SupabaseClient,
  UserId,
  RawIncomeCard,
  IncomeCard,
  ExpenseRow,
  BudgetRow,
  WaltsMemoryRow,
  UserContext,
  BudgetWithUsage,
  RecentExpense,
  LearnedInsight,
  BankAccountRow,
  PluggyItemRow,
  BalanceSource,
  BankAccountInfo,
} from './types.ts';

// ============================================================================
// Date Utilities
// ============================================================================

function getMonthDateRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month, 1).toISOString().split('T')[0];
  const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

  return { start, end };
}

function calculateDaysUntilNextPayment(incomeCards: IncomeCard[]): {
  nextPaymentDay: number | null;
  daysUntil: number;
} {
  if (incomeCards.length === 0) {
    return { nextPaymentDay: null, daysUntil: 30 };
  }

  const today = new Date();
  const currentDay = today.getDate();
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();

  const paymentDays = incomeCards.map((c) => c.day);
  const sortedDays = [...paymentDays].sort((a, b) => a - b);

  const nextDay = sortedDays.find((day) => day > currentDay);

  if (nextDay) {
    return {
      nextPaymentDay: nextDay,
      daysUntil: nextDay - currentDay,
    };
  }

  const firstDayNextMonth = sortedDays[0];
  const daysUntilEndOfMonth = daysInMonth - currentDay;
  return {
    nextPaymentDay: firstDayNextMonth,
    daysUntil: daysUntilEndOfMonth + firstDayNextMonth,
  };
}

// ============================================================================
// Data Aggregation
// ============================================================================

function calculateTotalIncome(incomeCards: IncomeCard[]): number {
  return incomeCards.reduce((sum, card) => sum + card.amount, 0);
}

function parseIncomeCards(rawCards: RawIncomeCard[] | null): IncomeCard[] {
  if (!rawCards || !Array.isArray(rawCards)) return [];

  return rawCards.map((card) => {
    // Parse salary string (format: "1.234,56" or "1234.56")
    let amount = 0;
    if (card.salary) {
      const cleanSalary = card.salary.replace(/\./g, '').replace(',', '.');
      amount = parseFloat(cleanSalary) || 0;
    }

    // Parse payment day
    const day = parseInt(card.paymentDay, 10) || 1;

    return {
      id: card.id,
      amount,
      day,
      source: card.incomeSource || 'Outros',
      linkedAccountId: card.linkedAccountId,
    };
  });
}

function calculateBudgetUsage(
  budget: BudgetRow,
  expenses: ExpenseRow[]
): BudgetWithUsage {
  const categoryExpenses = expenses.filter(
    (e) => e.category === budget.category_id
  );
  const spent = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
  const limit = parseFloat(budget.amount);
  const remaining = Math.max(0, limit - spent);
  const percentUsed = limit > 0 ? (spent / limit) * 100 : 0;

  return {
    id: budget.id,
    categoryId: budget.category_id,
    limit,
    periodType: budget.period_type,
    spent,
    remaining,
    percentUsed: Math.round(percentUsed * 10) / 10,
  };
}

function mapExpenseToRecent(expense: ExpenseRow): RecentExpense {
  return {
    establishmentName: expense.establishment_name,
    amount: expense.amount,
    date: expense.date,
    category: expense.category,
  };
}

// ============================================================================
// Main Function: preloadUserContext
// ============================================================================

export async function preloadUserContext(
  supabase: SupabaseClient,
  userId: UserId
): Promise<UserContext> {
  const { start: monthStart, end: monthEnd } = getMonthDateRange();

  const [
    profileResult,
    budgetsResult,
    monthExpensesResult,
    recentExpensesResult,
    memoriesResult,
    insightsResult,
    bankAccountsResult,
    pluggyItemsResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, income_cards, salary_bank_account_id')
      .eq('id', userId)
      .single(),

    supabase.from('budgets').select('*').eq('user_id', userId),

    supabase
      .from('expenses')
      .select(
        'id, establishment_name, amount, date, category, subcategory, source, created_at, is_cash'
      )
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', monthEnd),

    supabase
      .from('expenses')
      .select('establishment_name, amount, date, category')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(10),

    supabase
      .from('walts_memory')
      .select('memory_type, key, value')
      .eq('user_id', userId)
      .neq('memory_type', 'insight')
      .order('use_count', { ascending: false })
      .limit(10),

    supabase
      .from('walts_memory')
      .select('key, value, confidence')
      .eq('user_id', userId)
      .eq('memory_type', 'insight')
      .gte('confidence', 0.6)
      .order('confidence', { ascending: false })
      .limit(5),

    supabase
      .from('pluggy_accounts')
      .select('id, balance, last_sync_at, item_id')
      .eq('user_id', userId),

    supabase
      .from('pluggy_items')
      .select('id, last_updated_at')
      .eq('user_id', userId),
  ]);

  const incomeCards = parseIncomeCards(profileResult.data?.income_cards);
  const budgets: BudgetRow[] = budgetsResult.data || [];
  const monthExpenses: ExpenseRow[] = monthExpensesResult.data || [];
  const recentExpenses: ExpenseRow[] = recentExpensesResult.data || [];
  const memories: WaltsMemoryRow[] = memoriesResult.data || [];
  const insights: LearnedInsight[] = (insightsResult.data || []).map((row) => ({
    key: row.key,
    value: typeof row.value === 'object' ? row.value : { raw: row.value },
    confidence: row.confidence || 0.6,
  })) as LearnedInsight[];
  const bankAccounts: BankAccountRow[] = bankAccountsResult.data || [];
  const pluggyItems: PluggyItemRow[] = pluggyItemsResult.data || [];

  // ============================================================================
  // Cálculo Inteligente de Saldo (igual ao frontend)
  // ============================================================================

  const totalIncome = calculateTotalIncome(incomeCards);
  const salaryAccountId = profileResult.data?.salary_bank_account_id || null;

  // Determinar data da última sincronização
  let lastSyncAt: Date | null = null;
  const salaryAccount = bankAccounts.find((acc) => acc.id === salaryAccountId);
  if (salaryAccount?.last_sync_at) {
    lastSyncAt = new Date(salaryAccount.last_sync_at);
  } else {
    // Usar a sincronização mais recente entre todos os items
    const syncDates = pluggyItems
      .map((item) => item.last_updated_at)
      .filter(Boolean)
      .map((date) => new Date(date as string));
    if (syncDates.length > 0) {
      lastSyncAt = new Date(Math.max(...syncDates.map((d) => d.getTime())));
    }
  }

  // Filtrar apenas gastos MANUAIS (source = 'manual' ou null)
  // Gastos importados (source = 'import') já estão no extrato do banco
  const manualExpenses = monthExpenses.filter(
    (exp) => !exp.source || exp.source === 'manual'
  );

  const totalManualExpenses = manualExpenses.reduce(
    (sum, e) => sum + e.amount,
    0
  );

  // Identificar gastos RECENTES (ainda não sincronizados)
  // Critério: criados DEPOIS da última sincronização OU marcados como dinheiro (is_cash)
  let recentManualExpenses = 0;
  if (manualExpenses.length > 0) {
    const cutoffDate = lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h atrás se não tem sync

    recentManualExpenses = manualExpenses
      .filter((exp) => {
        // Gastos em dinheiro SEMPRE são considerados (nunca aparecem no extrato)
        if (exp.is_cash) return true;
        // Outros gastos só se forem recentes
        return exp.created_at ? new Date(exp.created_at) > cutoffDate : true;
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }

  // CALCULAR SALDO FINAL (igual ao frontend)
  let remainingBalance: number;
  let balanceSource: BalanceSource;
  let totalBankBalance: number | null = null;

  // Verificar se há contas vinculadas
  const linkedCards = incomeCards.filter((card) => card.linkedAccountId);
  const hasLinkedAccounts = linkedCards.length > 0;

  if (!hasLinkedAccounts) {
    // SEM conta vinculada: usar cálculo manual (salário - gastos)
    remainingBalance = Math.max(0, totalIncome - totalManualExpenses);
    balanceSource = 'manual';
  } else {
    // COM conta vinculada: SALDO DO BANCO É A FONTE DA VERDADE
    totalBankBalance = 0;

    // Somar saldos de todas as contas vinculadas
    for (const card of linkedCards) {
      const account = bankAccounts.find(
        (acc) => acc.id === card.linkedAccountId
      );
      if (account?.balance !== null && account?.balance !== undefined) {
        totalBankBalance += account.balance;
      }
    }

    // Descontar apenas gastos RECENTES (que ainda não sincronizaram)
    // Gastos antigos já estão refletidos no saldo do banco
    remainingBalance = Math.max(0, totalBankBalance - recentManualExpenses);
    balanceSource = 'bank';
  }

  // Calcular orçamento diário
  const { nextPaymentDay, daysUntil } =
    calculateDaysUntilNextPayment(incomeCards);
  const dailyBudget =
    daysUntil > 0 ? Math.round((remainingBalance / daysUntil) * 100) / 100 : 0;

  // Percentual gasto (sobre a renda)
  const percentSpent =
    totalIncome > 0
      ? Math.round((totalManualExpenses / totalIncome) * 1000) / 10
      : 0;

  const budgetsWithUsage = budgets.map((b) =>
    calculateBudgetUsage(b, monthExpenses)
  );

  // Montar informações das contas bancárias
  const bankAccountsInfo: BankAccountInfo[] = bankAccounts.map((acc) => ({
    id: acc.id,
    balance: acc.balance,
    isSalaryAccount: acc.id === salaryAccountId,
  }));

  return {
    user: {
      name: profileResult.data?.name || null,
      totalIncome,
      nextPaymentDay,
      incomeCards,
      salaryAccountId,
    },
    financial: {
      remainingBalance,
      totalBankBalance,
      totalManualExpenses,
      recentManualExpenses,
      percentSpent,
      dailyBudget,
      daysUntilNextPayment: daysUntil,
      balanceSource,
      lastSyncAt: lastSyncAt?.toISOString() || null,
    },
    bankAccounts: bankAccountsInfo,
    budgets: budgetsWithUsage,
    recentExpenses: recentExpenses.map(mapExpenseToRecent),
    memories,
    insights,
  };
}

// ============================================================================
// System Prompt Generator
// ============================================================================

export function generateSystemPrompt(context: UserContext): string {
  const {
    user,
    financial,
    budgets,
    recentExpenses,
    memories,
    insights,
    bankAccounts,
  } = context;

  const incomeCardsText =
    user.incomeCards.length > 0
      ? user.incomeCards
          .map((c) => {
            const linkedText = c.linkedAccountId ? ' (vinculada ao banco)' : '';
            return `  - ${c.source}: R$ ${c.amount.toLocaleString('pt-BR')} (dia ${c.day})${linkedText}`;
          })
          .join('\n')
      : '  Nenhuma fonte de renda cadastrada';

  // Informações da conta de salário
  const salaryAccountInfo = bankAccounts.find((acc) => acc.isSalaryAccount);
  const salaryAccountText = salaryAccountInfo
    ? `Conta de Salário Vinculada: saldo R$ ${salaryAccountInfo.balance?.toLocaleString('pt-BR') ?? 'N/A'}`
    : 'Nenhuma conta bancária vinculada como fonte de renda';

  // Fonte do saldo
  const balanceSourceText =
    financial.balanceSource === 'bank'
      ? 'Saldo baseado no extrato bancário (fonte da verdade)'
      : financial.balanceSource === 'manual'
        ? 'Saldo calculado manualmente (sem conta vinculada)'
        : 'Sem dados de renda';

  const budgetsText =
    budgets.length > 0
      ? budgets
          .map(
            (b) =>
              `  - ${b.categoryId}: R$ ${b.spent.toFixed(2)} / R$ ${b.limit.toFixed(2)} (${b.percentUsed}%)`
          )
          .join('\n')
      : '  Nenhum orçamento configurado';

  const expensesText =
    recentExpenses.length > 0
      ? recentExpenses
          .slice(0, 5)
          .map(
            (e) =>
              `  - ${e.establishmentName}: R$ ${e.amount.toFixed(2)} (${e.category || 'sem categoria'})`
          )
          .join('\n')
      : '  Nenhum gasto recente';

  const memoriesText =
    memories.length > 0
      ? memories
          .slice(0, 5)
          .map((m) => `  - ${m.key}: ${JSON.stringify(m.value)}`)
          .join('\n')
      : '';

  const insightsText =
    insights.length > 0
      ? insights
          .map((i) => {
            const message = i.value?.message || JSON.stringify(i.value);
            return `  - ${message}`;
          })
          .join('\n')
      : '';

  return `Você é Walts, assistente financeiro pessoal do app Pocket.

CONTEXTO DO USUÁRIO:
- Nome: ${user.name || 'Não informado'}
- Renda mensal total: R$ ${user.totalIncome.toLocaleString('pt-BR')}
- Próximo pagamento: dia ${user.nextPaymentDay || 'N/A'}

FONTES DE RENDA:
${incomeCardsText}

${salaryAccountText}

SITUAÇÃO FINANCEIRA (mês atual):
- Saldo disponível: R$ ${financial.remainingBalance.toLocaleString('pt-BR')}
  ${balanceSourceText}${financial.totalBankBalance !== null ? `\n  (Saldo total nas contas: R$ ${financial.totalBankBalance.toLocaleString('pt-BR')})` : ''}
- Total de gastos manuais: R$ ${financial.totalManualExpenses.toLocaleString('pt-BR')}
- Gastos aguardando sincronização: R$ ${financial.recentManualExpenses.toLocaleString('pt-BR')}
- % da renda gasta: ${financial.percentSpent}%
- Meta diária: R$ ${financial.dailyBudget.toLocaleString('pt-BR')} (${financial.daysUntilNextPayment} dias até próximo salário)${financial.lastSyncAt ? `\n- Última sincronização bancária: ${new Date(financial.lastSyncAt).toLocaleString('pt-BR')}` : ''}

ORÇAMENTOS:
${budgetsText}

ÚLTIMOS GASTOS:
${expensesText}
${memoriesText ? `\nPREFERÊNCIAS DO USUÁRIO:\n${memoriesText}` : ''}
${insightsText ? `\nINSIGHTS APRENDIDOS (use para personalizar respostas):\n${insightsText}` : ''}

REGRAS IMPORTANTES:
1. SALDO: Use SEMPRE o valor "Saldo disponível" acima quando perguntarem sobre saldo
2. O saldo do BANCO é a FONTE DA VERDADE quando há conta vinculada
3. Gastos manuais são temporários até a próxima sincronização bancária
4. Apenas gastos RECENTES (após última sincronização) debitam do saldo
5. CONTEXTO LIMITADO: O contexto acima contém APENAS:
   - Últimos 5 gastos manuais (não todos!)
   - Orçamentos do mês atual
   - 5 memórias mais usadas
   - Dados básicos de renda e saldo
6. SEMPRE USE FERRAMENTAS para buscar dados quando:
   - Usuário perguntar sobre gastos de meses anteriores → use get_financial_context
   - Usuário perguntar sobre transações do extrato bancário → use get_bank_transactions
   - Usuário perguntar sobre gráficos ou distribuição por categoria → use get_charts_data
   - Usuário perguntar sobre gastos específicos não listados acima → use get_financial_context
   - NUNCA assuma que dados não existem só porque não estão no contexto inicial
7. Após executar UMA ferramenta, RESPONDA ao usuário
8. Seja direto, conciso e natural como um assistente pessoal
9. NUNCA use emojis
10. Responda SEMPRE em português do Brasil
11. A primeira letra da sua resposta DEVE SEMPRE ser maiúscula

DIFERENÇA CRÍTICA - REGISTRAR vs CATEGORIZAR:

REGISTRAR (create_expense):
- Cria um NOVO gasto manual que NÃO existia
- Aparece na HOME como nova despesa
- DEBITA do saldo do usuário
- Use quando: usuário quer ADICIONAR um gasto novo (ex: "gastei 50 no mercado")

CATEGORIZAR (recategorize_transaction):
- Atualiza uma transação que JÁ EXISTE no extrato bancário
- Faz aparecer em CUSTOS FIXOS ou CUSTOS VARIÁVEIS
- NÃO debita do saldo (já está no extrato do banco)
- Use quando: usuário quer ORGANIZAR transações do Open Finance

REGRA DE OURO:
- Transação do EXTRATO BANCÁRIO → use recategorize_transaction
- Gasto NOVO que o usuário quer adicionar → use create_expense
- Se o usuário diz "categorizar essa saída do banco" → NUNCA use create_expense

ESTILO DE RESPOSTA:
- NÃO termine com frases genéricas como:
  "Posso ajudar em algo mais?"
  "Se precisar de mais alguma coisa, estou aqui"
  "Quer que eu faça mais alguma coisa?"
- Termine de forma natural, focada no conteúdo
- Só ofereça próxima ação se for óbvia e útil

CATEGORIZAÇÃO DE GASTOS:
Ao criar um gasto, voce DECIDE LIVREMENTE:
1. A CATEGORIA (moradia, saude, lazer, etc.)
2. Se e CUSTO FIXO ou VARIAVEL (campo is_fixed_cost)

CRITERIOS PARA DECIDIR:
- Custo FIXO (is_fixed_cost=true): gastos recorrentes, previstos, mensais
  Exemplos: aluguel, plano de saude, assinatura netflix, conta de luz
- Custo VARIAVEL (is_fixed_cost=false): gastos eventuais, pontuais, nao recorrentes
  Exemplos: compra na farmacia, almoco no restaurante, cinema, presente

NAO HA REGRA FIXA - voce analisa o contexto:
- Farmacia pode ser VARIAVEL (compra eventual de remedio)
- Farmacia pode ser FIXO (se o usuario compra remedios todos os meses)
- Use seu conhecimento para decidir baseado no contexto do gasto

IMAGENS:
- Você consegue ver e analisar imagens enviadas pelo usuário na conversa ATUAL e em mensagens ANTERIORES
- Se o usuário enviar uma foto de comprovante, nota fiscal, boleto, conta ou documento financeiro, analise e extraia as informações
- Use os dados extraídos da imagem para registrar gastos ou responder perguntas
- IMPORTANTE: Quando o usuário referenciar "a imagem que mandei", você TEM acesso às imagens anteriores da conversa`;
}
