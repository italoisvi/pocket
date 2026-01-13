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
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, income_cards')
      .eq('id', userId)
      .single(),

    supabase.from('budgets').select('*').eq('user_id', userId),

    supabase
      .from('expenses')
      .select('id, establishment_name, amount, date, category, subcategory')
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

  const totalIncome = calculateTotalIncome(incomeCards);
  const totalExpensesThisMonth = monthExpenses.reduce(
    (sum, e) => sum + e.amount,
    0
  );
  const balance = totalIncome - totalExpensesThisMonth;
  const percentSpent =
    totalIncome > 0
      ? Math.round((totalExpensesThisMonth / totalIncome) * 1000) / 10
      : 0;

  const { nextPaymentDay, daysUntil } =
    calculateDaysUntilNextPayment(incomeCards);
  const dailyBudget =
    daysUntil > 0 ? Math.round((balance / daysUntil) * 100) / 100 : 0;

  const budgetsWithUsage = budgets.map((b) =>
    calculateBudgetUsage(b, monthExpenses)
  );

  return {
    user: {
      name: profileResult.data?.name || null,
      totalIncome,
      nextPaymentDay,
      incomeCards,
    },
    financial: {
      totalExpensesThisMonth,
      balance,
      percentSpent,
      dailyBudget,
      daysUntilNextPayment: daysUntil,
    },
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
  const { user, financial, budgets, recentExpenses, memories, insights } =
    context;

  const incomeCardsText =
    user.incomeCards.length > 0
      ? user.incomeCards
          .map(
            (c) =>
              `  - ${c.source}: R$ ${c.amount.toLocaleString('pt-BR')} (dia ${c.day})`
          )
          .join('\n')
      : '  Nenhuma fonte de renda cadastrada';

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

SITUAÇÃO FINANCEIRA (mês atual):
- Total gasto: R$ ${financial.totalExpensesThisMonth.toLocaleString('pt-BR')}
- Saldo restante: R$ ${financial.balance.toLocaleString('pt-BR')}
- % da renda gasta: ${financial.percentSpent}%
- Meta diária: R$ ${financial.dailyBudget.toLocaleString('pt-BR')} (${financial.daysUntilNextPayment} dias até próximo salário)

ORÇAMENTOS:
${budgetsText}

ÚLTIMOS GASTOS:
${expensesText}
${memoriesText ? `\nPREFERÊNCIAS DO USUÁRIO:\n${memoriesText}` : ''}
${insightsText ? `\nINSIGHTS APRENDIDOS (use para personalizar respostas):\n${insightsText}` : ''}

REGRAS:
1. Se a informação está no contexto acima, USE-A diretamente
2. Use ferramentas APENAS quando precisar de dados que não estão no contexto
3. Após executar UMA ferramenta, RESPONDA ao usuário (não chame mais ferramentas)
4. Para ações (criar/editar/deletar), execute e confirme
5. Seja direto, conciso, educado e prestativo
6. NUNCA use emojis em suas respostas - este é um app financeiro profissional
7. Responda SEMPRE em português do Brasil
8. Use os insights aprendidos para personalizar suas respostas (ex: categorização preferida)

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
