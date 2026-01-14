# Diagnóstico CORRETO: Walts não vê o saldo calculado do app

## 🎯 O Problema Real

O saldo exibido no app Pocket **NÃO é persistido no banco de dados**.

Ele é **calculado em tempo real** usando a função `calculateTotalBalance()` que está no **frontend** (`lib/calculateBalance.ts`).

### Como funciona o cálculo de saldo no app:

```typescript
// 1. Busca income_cards (fontes de renda)
// 2. Busca contas vinculadas do Open Finance (pluggy_accounts)
// 3. Busca gastos MANUAIS do mês (source = 'manual' ou null)
// 4. Identifica gastos RECENTES (criados após última sincronização OU em dinheiro)
// 5. Calcula: saldo_banco - gastos_recentes_manuais
```

**Regra de ouro:** O saldo do banco é a **FONTE DA VERDADE**.

### Exemplo prático:

```
Saldo real no banco Nubank: R$ 3.000,00
Você registra gasto manual de R$ 200,00 (comprovante de supermercado)

→ App exibe: R$ 2.800,00 (3.000 - 200)

Banco sincroniza e o gasto de R$ 200 aparece no extrato

→ App exibe: R$ 3.000,00 (agora usa o saldo real do extrato)
   (o gasto manual é "descartado" pois já está no extrato)
```

---

## ❌ Por que o Walts não consegue ver esse saldo?

O Walts Agent (`supabase/functions/walts-agent`) está **no backend** e:

1. ❌ Não tem acesso à função `calculateTotalBalance` (está no frontend React Native)
2. ❌ Não replica essa lógica no `preloadUserContext`
3. ❌ Calcula saldo de forma **simplista**: `renda - gastos totais`

### O que o Walts faz atualmente:

```typescript
// context.ts, linha 199-204
const totalIncome = calculateTotalIncome(incomeCards);
const totalExpensesThisMonth = monthExpenses.reduce(
  (sum, e) => sum + e.amount,
  0
);
const balance = totalIncome - totalExpensesThisMonth; // ⚠️ ERRADO
```

**Problemas:**

- Não considera saldo real das contas bancárias
- Não filtra apenas gastos MANUAIS (inclui tudo)
- Não identifica gastos RECENTES (que ainda não sincronizaram)
- Não sabe qual conta está vinculada como fonte de renda

---

## ✅ A Solução: Portar calculateTotalBalance para o Backend

Precisamos **replicar a mesma lógica** do frontend no `context.ts` do Walts.

### Passo 1: Adicionar queries necessárias

**Arquivo:** `supabase/functions/walts-agent/context.ts`

```typescript
// Linha ~140, adicionar na Promise.all:
const [
  profileResult,
  budgetsResult,
  monthExpensesResult,
  recentExpensesResult,
  memoriesResult,
  insightsResult,
  bankAccountsResult, // ← NOVO
  pluggyItemsResult, // ← NOVO (para pegar last_sync_at)
] = await Promise.all([
  // ... queries existentes ...

  // NOVAS QUERIES:
  supabase
    .from('pluggy_accounts')
    .select('id, balance, last_sync_at, item_id')
    .eq('user_id', userId),

  supabase
    .from('pluggy_items')
    .select('id, last_updated_at')
    .eq('user_id', userId),
]);
```

### Passo 2: Expandir query do profile

```typescript
// Linha ~148, adicionar salary_bank_account_id
supabase
  .from('profiles')
  .select('name, income_cards, salary_bank_account_id') // ← adicionar campo
  .eq('id', userId)
  .single();
```

### Passo 3: Implementar lógica de cálculo inteligente

```typescript
// Após linha 186, adicionar:

// ============================================================================
// Cálculo Inteligente de Saldo (igual ao frontend)
// ============================================================================

type IncomeCard = {
  id: string;
  salary: string;
  paymentDay: string;
  incomeSource: string;
  linkedAccountId?: string;
  lastKnownBalance?: number;
};

function parseSalaryString(salary: string): number {
  const parsed = parseFloat(salary.replace(/\./g, '').replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

// Calcular salário total
const incomeCards: IncomeCard[] = parseIncomeCards(
  profileResult.data?.income_cards
);
const totalIncome = incomeCards.reduce((sum, card) => {
  return sum + parseSalaryString(card.salary);
}, 0);

// Buscar contas vinculadas
const bankAccounts = bankAccountsResult.data || [];
const pluggyItems = pluggyItemsResult.data || [];

// Encontrar qual conta é a de salário
const salaryAccountId = profileResult.data?.salary_bank_account_id;
const salaryAccount = bankAccounts.find((acc) => acc.id === salaryAccountId);

// Determinar data da última sincronização
let lastSyncAt: Date | null = null;
if (salaryAccount?.last_sync_at) {
  lastSyncAt = new Date(salaryAccount.last_sync_at);
} else {
  // Usar a sincronização mais recente entre todos os items
  const syncDates = pluggyItems
    .map((item) => item.last_updated_at)
    .filter(Boolean)
    .map((date) => new Date(date));
  if (syncDates.length > 0) {
    lastSyncAt = new Date(Math.max(...syncDates.map((d) => d.getTime())));
  }
}

// Filtrar apenas gastos MANUAIS (source = 'manual' ou null)
// Gastos importados (source = 'import') já estão no extrato do banco
const manualExpenses = monthExpenses.filter(
  (exp: any) => !exp.source || exp.source === 'manual'
);

const totalManualExpenses = manualExpenses.reduce(
  (sum: number, e: any) => sum + e.amount,
  0
);

// Identificar gastos RECENTES (ainda não sincronizados)
// Critério: criados DEPOIS da última sincronização OU marcados como dinheiro (is_cash)
let recentManualExpenses = 0;
if (manualExpenses.length > 0) {
  const cutoffDate = lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h atrás se não tem sync

  recentManualExpenses = manualExpenses
    .filter((exp: any) => {
      // Gastos em dinheiro SEMPRE são considerados (nunca aparecem no extrato)
      if (exp.is_cash) return true;
      // Outros gastos só se forem recentes
      return new Date(exp.created_at) > cutoffDate;
    })
    .reduce((sum: number, e: any) => sum + e.amount, 0);
}

// CALCULAR SALDO FINAL (igual ao frontend)
let remainingBalance: number;
let balanceSource: 'manual' | 'bank' | 'none';
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
    const account = bankAccounts.find((acc) => acc.id === card.linkedAccountId);
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
```

### Passo 4: Atualizar o objeto de retorno

```typescript
return {
  user: {
    name: profileResult.data?.name || null,
    totalIncome,
    nextPaymentDay,
    incomeCards,
    salaryAccountId, // ← NOVO
  },
  financial: {
    remainingBalance, // ← Saldo calculado corretamente
    totalBankBalance, // ← Saldo total das contas
    totalManualExpenses, // ← Total de gastos manuais
    recentManualExpenses, // ← Gastos que ainda não sincronizaram
    percentSpent,
    dailyBudget,
    daysUntilNextPayment: daysUntil,
    balanceSource, // ← 'bank' ou 'manual'
    lastSyncAt: lastSyncAt?.toISOString() || null, // ← Data da última sincronização
  },
  bankAccounts: bankAccounts.map((acc: any) => ({
    id: acc.id,
    balance: acc.balance,
    isSalaryAccount: acc.id === salaryAccountId,
  })),
  budgets: budgetsWithUsage,
  recentExpenses: recentExpenses.map(mapExpenseToRecent),
  memories,
  insights,
};
```

### Passo 5: Atualizar o System Prompt

```typescript
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

  // Informações da conta de salário
  const salaryAccountInfo = bankAccounts.find((acc) => acc.isSalaryAccount);
  const salaryAccountText = salaryAccountInfo
    ? `Conta de Salário: ID ${salaryAccountInfo.id} (saldo: R$ ${salaryAccountInfo.balance?.toLocaleString('pt-BR')})`
    : 'Nenhuma conta bancária vinculada como fonte de renda';

  // Fonte do saldo
  const balanceSourceText =
    financial.balanceSource === 'bank'
      ? 'Saldo baseado no extrato bancário (fonte da verdade)'
      : 'Saldo calculado manualmente (sem conta vinculada)';

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
  ${balanceSourceText}
  ${financial.totalBankBalance !== null ? `(Saldo total nas contas: R$ ${financial.totalBankBalance.toLocaleString('pt-BR')})` : ''}
- Total de gastos manuais: R$ ${financial.totalManualExpenses.toLocaleString('pt-BR')}
- Gastos aguardando sincronização: R$ ${financial.recentManualExpenses.toLocaleString('pt-BR')}
- % da renda gasta: ${financial.percentSpent}%
- Meta diária: R$ ${financial.dailyBudget.toLocaleString('pt-BR')} (${financial.daysUntilNextPayment} dias até próximo salário)
${financial.lastSyncAt ? `- Última sincronização bancária: ${new Date(financial.lastSyncAt).toLocaleString('pt-BR')}` : ''}

ORÇAMENTOS:
${budgetsText}

ÚLTIMOS GASTOS:
${expensesText}

${memoriesText ? `\nPREFERÊNCIAS DO USUÁRIO:\n${memoriesText}` : ''}
${insightsText ? `\nINSIGHTS APRENDIDOS:\n${insightsText}` : ''}

REGRAS IMPORTANTES:
1. SALDO: Use SEMPRE o valor "Saldo disponível" acima quando perguntarem sobre saldo
2. O saldo do BANCO é a FONTE DA VERDADE quando há conta vinculada
3. Gastos manuais são temporários até a próxima sincronização bancária
4. Apenas gastos RECENTES (após última sincronização) debitam do saldo
5. Se a informação está no contexto acima, USE-A diretamente
6. Use ferramentas APENAS quando precisar de dados que não estão no contexto
7. Após executar UMA ferramenta, RESPONDA ao usuário
8. Seja direto, conciso e natural como um assistente pessoal
9. NUNCA use emojis
10. Responda SEMPRE em português do Brasil

ESTILO DE RESPOSTA:
❌ NÃO termine com frases genéricas como:
   - "Posso ajudar em algo mais?"
   - "Se precisar de mais alguma coisa, estou aqui"
   - "Quer que eu faça mais alguma coisa?"
✅ Termine de forma natural, focada no conteúdo
✅ Só ofereça próxima ação se for óbvia e útil`;
}
```

---

## 📋 Resumo da Solução

### O que está sendo feito:

1. ✅ Adicionar queries de `pluggy_accounts` e `pluggy_items` no contexto
2. ✅ Buscar `salary_bank_account_id` do profile
3. ✅ **Portar a lógica de `calculateTotalBalance` do frontend para o backend**
4. ✅ Filtrar apenas gastos MANUAIS (excluir importados)
5. ✅ Identificar gastos RECENTES (após última sincronização)
6. ✅ Calcular saldo usando **saldo do banco - gastos recentes**
7. ✅ Atualizar system prompt para incluir todas essas informações
8. ✅ Remover frases genéricas repetitivas

### Resultado esperado:

```
Usuário: Qual meu saldo?
Walts: Você tem R$ 2.847,32 disponível.
       Este valor é baseado no saldo da sua conta Nubank (R$ 3.000,00)
       menos R$ 152,68 em gastos que você registrou após a última
       sincronização bancária.
```

```
Usuário: Em que conta eu recebo minha renda?
Walts: Você recebe sua renda de R$ 5.000,00 na conta ID abc123
       (vinculada no Pocket), com pagamento no dia 5 de cada mês.
```

---

## 🎯 Tipos TypeScript Necessários

**Arquivo:** `supabase/functions/walts-agent/types.ts`

```typescript
export type UserContext = {
  user: {
    name: string | null;
    totalIncome: number;
    nextPaymentDay: number | null;
    incomeCards: IncomeCard[];
    salaryAccountId: string | null; // ← NOVO
  };
  financial: {
    remainingBalance: number; // ← Saldo calculado (CORRETO)
    totalBankBalance: number | null; // ← Saldo total das contas
    totalManualExpenses: number; // ← Gastos manuais do mês
    recentManualExpenses: number; // ← Gastos não sincronizados
    percentSpent: number;
    dailyBudget: number;
    daysUntilNextPayment: number;
    balanceSource: 'manual' | 'bank' | 'none'; // ← NOVO
    lastSyncAt: string | null; // ← NOVO
  };
  bankAccounts: Array<{
    // ← NOVO
    id: string;
    balance: number | null;
    isSalaryAccount: boolean;
  }>;
  budgets: BudgetWithUsage[];
  recentExpenses: RecentExpense[];
  memories: WaltsMemoryRow[];
  insights: LearnedInsight[];
};
```

---

## 🧪 Como Testar

### Teste 1: Saldo com conta vinculada

```
Setup:
- Usuário tem Nubank vinculado com R$ 3.000,00
- Registrou gasto manual de R$ 200,00 hoje

Pergunta: "Qual meu saldo?"
Esperado: "R$ 2.800,00 (R$ 3.000 no banco - R$ 200 de gastos recentes)"
```

### Teste 2: Saldo sem conta vinculada

```
Setup:
- Usuário tem renda de R$ 5.000,00
- Gastou R$ 1.500,00 no mês
- Não tem conta bancária conectada

Pergunta: "Qual meu saldo?"
Esperado: "R$ 3.500,00 (calculado com base nos seus gastos registrados)"
```

### Teste 3: Conta de salário

```
Pergunta: "Em que conta eu recebo minha renda?"
Esperado: Nome/ID da conta vinculada como salary_bank_account_id
```

### Teste 4: Sem frases genéricas

```
Fazer 5 perguntas diferentes
Esperado: NENHUMA resposta termina com "posso ajudar em algo mais?"
```

---

## ⏱️ Estimativa de Implementação

- **Tempo:** 3-4 horas
- **Complexidade:** Média-Alta (lógica de negócio complexa)
- **Riscos:** Baixo (é uma refatoração, não quebra funcionalidade existente)
- **Prioridade:** 🔴 CRÍTICA (resolve problema principal do usuário)

---

## 📝 Checklist de Implementação

- [ ] Adicionar queries de `pluggy_accounts` e `pluggy_items`
- [ ] Expandir query do `profiles` para incluir `salary_bank_account_id`
- [ ] Implementar função `parseSalaryString`
- [ ] Implementar lógica de filtro de gastos manuais
- [ ] Implementar identificação de gastos recentes
- [ ] Implementar cálculo de saldo inteligente
- [ ] Atualizar tipo `UserContext`
- [ ] Atualizar `generateSystemPrompt`
- [ ] Adicionar regras anti-frases-genéricas no prompt
- [ ] Testar com conta vinculada
- [ ] Testar sem conta vinculada
- [ ] Testar resposta de saldo
- [ ] Testar resposta de conta de salário
- [ ] Deploy da edge function
- [ ] Teste em produção

---

## 🚀 Deploy

```bash
# 1. Commitar mudanças
git add supabase/functions/walts-agent/
git commit -m "fix: porta lógica de saldo do frontend para Walts Agent"

# 2. Deploy da edge function
supabase functions deploy walts-agent

# 3. Verificar logs
supabase functions logs walts-agent --tail
```

---

## 🎓 Lições Aprendidas

1. **Backend não compartilha código com frontend** → precisamos portar lógica
2. **Saldo não é persistido** → é calculado em tempo real
3. **Fonte da verdade = extrato bancário** → quando disponível
4. **Gastos manuais são temporários** → até sincronização
5. **System prompts precisam ser explícitos** → sobre o que NÃO fazer

---

## Conclusão

O problema **NÃO é** que o Walts não busca dados.

O problema é que o Walts não **calcula o saldo da mesma forma** que o app faz.

A solução é **portar a lógica de `calculateTotalBalance`** do frontend para o backend do Walts Agent.
