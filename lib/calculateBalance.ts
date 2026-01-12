/**
 * Calcula o saldo restante usando o EXTRATO BANCÁRIO como fonte da verdade
 *
 * Lógica:
 * 1. Se tem conta vinculada (Open Finance), usa o saldo do BANCO como base
 * 2. Desconta apenas gastos MANUAIS adicionados APÓS a última sincronização
 * 3. Quando sincroniza o Open Finance, o saldo volta a ser o do banco
 * 4. Se não tem conta vinculada, usa cálculo manual (salário - gastos)
 *
 * O saldo do extrato bancário é a FONTE DA VERDADE.
 * Gastos manuais são débitos temporários até a próxima sincronização.
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

  // SALDO DO BANCO É A FONTE DA VERDADE
  // Descontar apenas gastos RECENTES (manuais adicionados após última sincronização)
  // Gastos antigos já estão refletidos no saldo do banco (já saíram da conta)
  const adjustedBankBalance = totalBankBalance - recentExpenses;

  // Usar SEMPRE o saldo do banco quando disponível (é a fonte da verdade)
  // Gastos manuais são débitos temporários até a próxima sincronização
  return {
    remainingBalance: Math.max(0, adjustedBankBalance),
    source: 'bank',
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
