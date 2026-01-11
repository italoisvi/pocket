/**
 * Calcula o saldo restante usando a lógica conservadora (Opção 3)
 * Usa o MENOR valor entre:
 * 1. Salário - Gastos manuais (comprovantes + Walts)
 * 2. Saldo real da conta bancária vinculada
 *
 * Isso garante que o usuário nunca veja um saldo maior do que a realidade,
 * mesmo quando o Open Finance ainda não sincronizou os últimos gastos.
 */

export type BalanceSource = 'manual' | 'bank' | 'none';

export type BalanceResult = {
  remainingBalance: number;
  source: BalanceSource;
  manualBalance: number; // Salário - gastos manuais
  bankBalance: number | null; // Saldo da conta bancária (null se não vinculada)
  totalSalary: number;
  totalManualExpenses: number;
};

type IncomeCardForCalc = {
  salary: string; // Formato "5.000,00"
  linkedAccountId?: string;
  lastKnownBalance?: number; // Saldo persistido quando desvincula o banco
};

type AccountBalance = {
  id: string;
  balance: number | null;
};

/**
 * Converte string de salário formatado para número
 * Ex: "5.000,00" -> 5000.00
 */
export function parseSalaryString(salary: string): number {
  const parsed = parseFloat(salary.replace(/\./g, '').replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calcula o saldo restante para uma única fonte de renda
 */
export function calculateSingleIncomeBalance(
  salary: number,
  manualExpenses: number,
  bankBalance: number | null
): { balance: number; source: BalanceSource } {
  const manualBalance = salary - manualExpenses;

  // Se não tem conta vinculada, usa cálculo manual
  if (bankBalance === null) {
    return {
      balance: Math.max(0, manualBalance),
      source: 'manual',
    };
  }

  // Usa o menor valor (mais conservador)
  if (bankBalance <= manualBalance) {
    return {
      balance: Math.max(0, bankBalance),
      source: 'bank',
    };
  } else {
    return {
      balance: Math.max(0, manualBalance),
      source: 'manual',
    };
  }
}

/**
 * Calcula o saldo total considerando múltiplas fontes de renda
 * Cada fonte tem sua própria conta vinculada (ou não)
 */
export function calculateTotalBalance(
  incomeCards: IncomeCardForCalc[],
  accountBalances: AccountBalance[],
  totalManualExpenses: number,
  recentExpenses: number = 0 // Gastos adicionados DEPOIS da última sincronização
): BalanceResult {
  // Calcular salário total
  const totalSalary = incomeCards.reduce((sum, card) => {
    return sum + parseSalaryString(card.salary);
  }, 0);

  // Se não tem income cards, retorna zero
  if (incomeCards.length === 0 || totalSalary === 0) {
    return {
      remainingBalance: 0,
      source: 'none',
      manualBalance: 0,
      bankBalance: null,
      totalSalary: 0,
      totalManualExpenses,
    };
  }

  // Calcular saldo manual (salário - gastos)
  const manualBalance = totalSalary - totalManualExpenses;

  // Verificar se há contas vinculadas ou saldos persistidos
  const linkedCards = incomeCards.filter((card) => card.linkedAccountId);
  const cardsWithPersistedBalance = incomeCards.filter(
    (card) => !card.linkedAccountId && card.lastKnownBalance !== undefined
  );

  // Calcular saldo total das contas vinculadas
  let totalBankBalance = 0;
  let hasValidBankBalance = false;

  // Somar saldos das contas vinculadas
  for (const card of linkedCards) {
    const account = accountBalances.find(
      (acc) => acc.id === card.linkedAccountId
    );
    if (account && account.balance !== null) {
      totalBankBalance += account.balance;
      hasValidBankBalance = true;
    }
  }

  // Somar saldos persistidos (de contas que foram desvinculadas)
  for (const card of cardsWithPersistedBalance) {
    if (card.lastKnownBalance !== undefined) {
      totalBankBalance += card.lastKnownBalance;
      hasValidBankBalance = true;
    }
  }

  // Se não tem conta vinculada NEM saldo persistido, usa apenas cálculo manual
  if (!hasValidBankBalance) {
    return {
      remainingBalance: Math.max(0, manualBalance),
      source: 'manual',
      manualBalance,
      bankBalance: null,
      totalSalary,
      totalManualExpenses,
    };
  }

  // Ajustar saldo do banco: descontar apenas gastos RECENTES (após última sincronização)
  // Gastos antigos já estão refletidos no saldo do banco
  const adjustedBankBalance = totalBankBalance - recentExpenses;

  // Usar o menor valor entre:
  // - Saldo do banco ajustado (banco - gastos recentes)
  // - Cálculo manual (salário - todos os gastos)
  const useBank = adjustedBankBalance <= manualBalance;

  return {
    remainingBalance: Math.max(
      0,
      useBank ? adjustedBankBalance : manualBalance
    ),
    source: useBank ? 'bank' : 'manual',
    manualBalance,
    bankBalance: totalBankBalance,
    totalSalary,
    totalManualExpenses,
  };
}

/**
 * Retorna uma descrição amigável da fonte do saldo
 */
export function getBalanceSourceLabel(source: BalanceSource): string {
  switch (source) {
    case 'bank':
      return 'Baseado no saldo do banco';
    case 'manual':
      return 'Baseado nos gastos registrados';
    case 'none':
      return 'Sem dados de renda';
  }
}
