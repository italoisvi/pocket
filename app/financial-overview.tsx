import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import { ChevronDownIcon } from '@/components/ChevronDownIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { AlertaIcon } from '@/components/AlertaIcon';
import { KangarooIcon } from '@/components/KangarooIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { useTheme } from '@/lib/theme';
import { sendMessageToDeepSeek } from '@/lib/deepseek';
import {
  calculateTotalBalance,
  getBalanceSourceLabel,
  type BalanceSource,
} from '@/lib/calculateBalance';
import { usePremium } from '@/lib/usePremium';
import { PaywallModal } from '@/components/PaywallModal';

type CategoryExpense = {
  category: ExpenseCategory;
  total: number;
};

type CreditCardAccount = {
  id: string;
  name: string;
  usedCredit: number;
  creditLimit: number;
  availableCredit: number;
};

export default function FinancialOverviewScreen() {
  const { theme } = useTheme();
  const { isPremium, loading: premiumLoading, refresh: refreshPremium } = usePremium();
  const [showPaywall, setShowPaywall] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState<number>(0);
  const [salaryPaymentDay, setSalaryPaymentDay] = useState<number>(1);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [categoryExpenses, setCategoryExpenses] = useState<CategoryExpense[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [creditCardAccounts, setCreditCardAccounts] = useState<
    CreditCardAccount[]
  >([]);
  const [waltsSuggestion, setWaltsSuggestion] = useState<{
    dailyBudget: number;
    reasoning: string;
  } | null>(null);
  const [loadingWaltsSuggestion, setLoadingWaltsSuggestion] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [availableMonths, setAvailableMonths] = useState<Date[]>([]);
  const monthScrollRef = useRef<ScrollView>(null);
  const [balanceSource, setBalanceSource] = useState<BalanceSource>('manual');
  const [calculatedBalance, setCalculatedBalance] = useState<number>(0);

  // Verificar premium e mostrar paywall se necessário
  useEffect(() => {
    if (!premiumLoading && !isPremium) {
      setShowPaywall(true);
    }
  }, [premiumLoading, isPremium]);

  useEffect(() => {
    // Gerar meses disponíveis baseado na data de criação do usuário
    const generateMonths = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Buscar data de criação do perfil
        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', user.id)
          .maybeSingle();

        const today = new Date();
        let startDate: Date;

        if (profile?.created_at) {
          // Começar do mês de criação do perfil
          const createdAt = new Date(profile.created_at);
          startDate = new Date(
            createdAt.getFullYear(),
            createdAt.getMonth(),
            1
          );
        } else {
          // Se não tem created_at, começar do mês atual
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }

        // Gerar meses desde a criação até hoje
        const months: Date[] = [];
        const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        let iterDate = new Date(startDate);
        while (iterDate <= currentMonth) {
          months.push(new Date(iterDate));
          iterDate.setMonth(iterDate.getMonth() + 1);
        }

        setAvailableMonths(months);
      } catch (error) {
        console.error('Erro ao gerar meses disponíveis:', error);
        // Fallback: apenas mês atual
        setAvailableMonths([new Date()]);
      }
    };

    generateMonths();
  }, []);

  // Resetar para o mês atual e fazer scroll quando a tela ganhar foco
  useFocusEffect(
    useCallback(() => {
      // Resetar selectedMonth para o mês atual
      setSelectedMonth(new Date());

      if (availableMonths.length > 0) {
        const currentMonthIndex = availableMonths.findIndex(
          (month) =>
            month.getMonth() === new Date().getMonth() &&
            month.getFullYear() === new Date().getFullYear()
        );
        if (currentMonthIndex !== -1 && monthScrollRef.current) {
          // Delay maior para garantir que o layout está pronto
          setTimeout(() => {
            monthScrollRef.current?.scrollTo({
              x: currentMonthIndex * 88,
              animated: false, // Changed to false for immediate scroll
            });
          }, 300);
        }
      }
    }, [availableMonths])
  );

  // Adicional: scroll quando availableMonths mudar (primeiro load)
  useEffect(() => {
    if (availableMonths.length > 0) {
      const currentMonthIndex = availableMonths.findIndex(
        (month) =>
          month.getMonth() === new Date().getMonth() &&
          month.getFullYear() === new Date().getFullYear()
      );
      if (currentMonthIndex !== -1) {
        setTimeout(() => {
          monthScrollRef.current?.scrollTo({
            x: currentMonthIndex * 88,
            animated: true,
          });
        }, 100);
      }
    }
  }, [availableMonths]);

  useEffect(() => {
    loadFinancialData();
    loadWaltsSuggestion();
  }, [selectedMonth]);

  const loadWaltsSuggestion = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Carregar sugestão específica do mês selecionado
      const monthKey = `${selectedMonth.getFullYear()}_${selectedMonth.getMonth()}`;
      const stored = await AsyncStorage.getItem(
        `walts_suggestion_${user.id}_${monthKey}`
      );
      if (stored) {
        setWaltsSuggestion(JSON.parse(stored));
      } else {
        setWaltsSuggestion(null);
      }
    } catch (error) {
      console.error('Erro ao carregar sugestão do Walts:', error);
    }
  };

  // Colapsar todos os cards quando a tela ganhar foco (usuário retornar de outra página)
  useFocusEffect(
    useCallback(() => {
      setExpandedCard(null);
    }, [])
  );

  const toggleCategory = (cardId: string) => {
    setExpandedCard((currentExpanded) => {
      // Se o card clicado já está expandido, fechar ele
      if (currentExpanded === cardId) {
        return null;
      }
      // Se outro card está expandido, fechar o anterior e abrir o novo
      return cardId;
    });
  };

  const loadFinancialData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Carregar salário, dia de pagamento e income_cards
      const { data: profileData } = await supabase
        .from('profiles')
        .select('monthly_salary, salary_payment_day, income_cards')
        .eq('id', user.id)
        .maybeSingle();

      // Tipo para income_cards
      type IncomeCard = {
        id: string;
        salary: string;
        paymentDay: string;
        incomeSource: string;
        linkedAccountId?: string;
      };

      // Calcular total de rendas e próximo dia de pagamento
      let totalIncome = 0;
      let nextPaymentDay = profileData?.salary_payment_day || 1;
      let incomeCards: IncomeCard[] = [];

      // Verificar se há income_cards (novo sistema)
      if (
        profileData?.income_cards &&
        Array.isArray(profileData.income_cards) &&
        profileData.income_cards.length > 0
      ) {
        incomeCards = profileData.income_cards as IncomeCard[];

        // Calcular total de todas as rendas
        totalIncome = incomeCards.reduce((sum: number, card: IncomeCard) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);

        // Encontrar o próximo dia de pagamento (o mais próximo)
        const today = new Date();
        const currentDay = today.getDate();

        // Extrair todos os dias de pagamento válidos
        const paymentDays = incomeCards
          .map((card: IncomeCard) => parseInt(card.paymentDay))
          .filter((day: number) => !isNaN(day) && day >= 1 && day <= 31);

        if (paymentDays.length > 0) {
          // Encontrar o próximo pagamento (considerando que pode ser neste mês ou no próximo)
          const upcomingThisMonth = paymentDays.filter(
            (day: number) => day > currentDay
          );
          if (upcomingThisMonth.length > 0) {
            // Próximo pagamento é neste mês
            nextPaymentDay = Math.min(...upcomingThisMonth);
          } else {
            // Todos os pagamentos deste mês já passaram, próximo é o menor do próximo mês
            nextPaymentDay = Math.min(...paymentDays);
          }
        }
      } else if (profileData?.monthly_salary) {
        // Só usar monthly_salary se income_cards não existir (sistema antigo)
        totalIncome = profileData.monthly_salary;
      }

      if (totalIncome > 0) {
        setMonthlySalary(totalIncome);
        setSalaryPaymentDay(nextPaymentDay);
      }

      // Buscar saldos das contas vinculadas (para cálculo inteligente do saldo)
      const linkedAccountIds = incomeCards
        .filter((card) => card.linkedAccountId)
        .map((card) => card.linkedAccountId as string);

      let accountBalances: { id: string; balance: number | null }[] = [];
      let lastSyncAt: string | null = null;

      if (linkedAccountIds.length > 0) {
        const { data: linkedAccounts } = await supabase
          .from('pluggy_accounts')
          .select('id, balance, last_sync_at')
          .in('id', linkedAccountIds);

        if (linkedAccounts) {
          accountBalances = linkedAccounts;
          // Usar a sincronização mais recente
          const syncDates = linkedAccounts
            .map((acc: any) => acc.last_sync_at)
            .filter(Boolean);
          if (syncDates.length > 0) {
            lastSyncAt = syncDates.sort().pop() || null;
          }
        }
      }

      // Carregar gastos do mês selecionado
      // Formatar datas diretamente para evitar problemas de timezone
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
      const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, date, created_at')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      if (expensesData) {
        // Calcular total de gastos
        const total = expensesData.reduce((sum, exp) => sum + exp.amount, 0);
        setTotalExpenses(total);

        // Calcular gastos RECENTES (após última sincronização)
        let recentExpenses = 0;
        // Se tiver data de sincronização, usa ela; senão, considera gastos das últimas 24h como recentes
        const cutoffDate = lastSyncAt
          ? new Date(lastSyncAt)
          : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas atrás

        recentExpenses = expensesData
          .filter((exp) => new Date(exp.created_at) > cutoffDate)
          .reduce((sum, exp) => sum + exp.amount, 0);

        // Calcular saldo usando lógica inteligente (menor entre manual e banco)
        const balanceResult = calculateTotalBalance(
          incomeCards,
          accountBalances,
          total,
          recentExpenses
        );

        setCalculatedBalance(balanceResult.remainingBalance);
        setBalanceSource(balanceResult.source);

        // Agrupar por categoria
        const categoryMap = new Map<ExpenseCategory, number>();
        expensesData.forEach((exp) => {
          const category = (exp.category as ExpenseCategory) || 'outros';
          const current = categoryMap.get(category) || 0;
          categoryMap.set(category, current + exp.amount);
        });

        const categories: CategoryExpense[] = Array.from(
          categoryMap.entries()
        ).map(([category, total]) => ({
          category,
          total,
        }));

        setCategoryExpenses(categories.sort((a, b) => b.total - a.total));
      } else {
        // Se não há gastos, calcular saldo apenas com income_cards
        const balanceResult = calculateTotalBalance(
          incomeCards,
          accountBalances,
          0
        );

        setCalculatedBalance(balanceResult.remainingBalance);
        setBalanceSource(balanceResult.source);
      }

      // Carregar cartões de crédito do Open Finance
      const { data: creditAccounts } = await supabase
        .from('pluggy_accounts')
        .select('id, name, balance, credit_limit, available_credit_limit')
        .eq('user_id', user.id)
        .eq('type', 'CREDIT');

      const creditCards: CreditCardAccount[] = [];

      // Analisar cartões de crédito
      if (creditAccounts) {
        creditAccounts.forEach((account) => {
          if (account.credit_limit && account.available_credit_limit !== null) {
            const usedCredit =
              account.credit_limit - account.available_credit_limit;
            if (usedCredit > 0) {
              creditCards.push({
                id: account.id,
                name: account.name,
                usedCredit,
                creditLimit: account.credit_limit,
                availableCredit: account.available_credit_limit,
              });
            }
          }
        });
      }

      setCreditCardAccounts(creditCards);
    } catch (error) {
      console.error('Erro ao carregar dados financeiros:', error);
    } finally {
      setLoading(false);
    }
  };

  // Usar o saldo calculado (que considera contas vinculadas) ou fallback para cálculo manual
  const remainingBalance =
    balanceSource !== 'none'
      ? calculatedBalance
      : monthlySalary - totalExpenses;
  const spentPercentage =
    monthlySalary > 0 ? (totalExpenses / monthlySalary) * 100 : 0;

  // Verificar se o mês selecionado é o mês atual
  const now = new Date();
  const isCurrentMonth =
    selectedMonth.getMonth() === now.getMonth() &&
    selectedMonth.getFullYear() === now.getFullYear();

  // Calcular dias no mês selecionado
  const daysInSelectedMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    0
  ).getDate();

  // Para meses passados: calcular gasto médio diário
  const averageDailySpent =
    daysInSelectedMonth > 0 ? totalExpenses / daysInSelectedMonth : 0;

  // Calcular dias restantes até o próximo pagamento (apenas para mês atual)
  const currentDay = now.getDate();
  let daysUntilNextPayment = 0;
  let dailyBudget = 0;

  if (isCurrentMonth) {
    // Calcular a data do próximo pagamento
    let nextPaymentDate: Date;
    if (currentDay < salaryPaymentDay) {
      // Próximo pagamento é neste mês
      nextPaymentDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        salaryPaymentDay
      );
    } else {
      // Próximo pagamento é no próximo mês
      nextPaymentDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        salaryPaymentDay
      );
    }

    // Calcular dias restantes até o próximo pagamento
    daysUntilNextPayment = Math.ceil(
      (nextPaymentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    dailyBudget =
      daysUntilNextPayment > 0 ? remainingBalance / daysUntilNextPayment : 0;
  }

  const getWaltsSuggestion = async () => {
    setLoadingWaltsSuggestion(true);

    try {
      // Preparar dados de contexto para o Walts
      const essentialExpenses: { [key: string]: number } = {};
      const nonEssentialExpenses: { [key: string]: number } = {};

      categoryExpenses.forEach((cat) => {
        const categoryInfo = CATEGORIES[cat.category];
        if (categoryInfo.type === 'essencial') {
          essentialExpenses[cat.category] = cat.total;
        } else {
          nonEssentialExpenses[cat.category] = cat.total;
        }
      });

      // Calcular total de cartões de crédito
      const totalCreditCards = creditCardAccounts.reduce(
        (sum: number, card: CreditCardAccount) => sum + card.usedCredit,
        0
      );

      // Formatar dados detalhados para o Walts
      const essentialExpensesStr = Object.entries(essentialExpenses)
        .map(
          ([cat, val]) =>
            `  - ${CATEGORIES[cat as ExpenseCategory].name}: R$ ${val.toFixed(2)}`
        )
        .join('\n');

      const nonEssentialExpensesStr = Object.entries(nonEssentialExpenses)
        .map(
          ([cat, val]) =>
            `  - ${CATEGORIES[cat as ExpenseCategory].name}: R$ ${val.toFixed(2)}`
        )
        .join('\n');

      const creditCardsStr = creditCardAccounts
        .map(
          (card: CreditCardAccount) =>
            `  - ${card.name}: R$ ${card.usedCredit.toFixed(2)} / R$ ${card.creditLimit.toFixed(2)}`
        )
        .join('\n');

      const prompt = `Você é o Walts, assistente financeiro pessoal. Analise esta situação financeira completa e sugira uma meta diária inteligente:

📊 RESUMO DO MÊS:
- Renda mensal: R$ ${monthlySalary.toFixed(2)}
- Total gasto até agora: R$ ${totalExpenses.toFixed(2)}
- Saldo restante: R$ ${remainingBalance.toFixed(2)}
- Percentual gasto: ${spentPercentage.toFixed(1)}%
- Dias até próximo pagamento: ${daysUntilNextPayment}
- Meta diária simples: R$ ${dailyBudget.toFixed(2)}

💰 CARTÕES DE CRÉDITO (${creditCardAccounts.length} cartão(ões)):
Total em uso: R$ ${totalCreditCards.toFixed(2)}
${creditCardsStr || '  (Nenhum cartão com saldo devedor)'}

💸 PENDÊNCIAS:
(Verificar na tela de Alertas e Pendências)

🏠 CUSTOS FIXOS (Essenciais):
Total: R$ ${Object.values(essentialExpenses)
        .reduce((sum, val) => sum + val, 0)
        .toFixed(2)}
${essentialExpensesStr || '  (Nenhum custo fixo registrado)'}

🛒 CUSTOS VARIÁVEIS (Não-Essenciais):
Total: R$ ${Object.values(nonEssentialExpenses)
        .reduce((sum, val) => sum + val, 0)
        .toFixed(2)}
${nonEssentialExpensesStr || '  (Nenhum custo variável registrado)'}

🎯 SUA MISSÃO:
Com base em TODA essa saúde financeira (cartões, dívidas, padrão de gastos essenciais e não-essenciais), sugira:
1. Um valor diário realista que o usuário pode gastar
2. Uma explicação clara do porquê dessa meta
3. Considere priorizar pagamento de dívidas se existirem
4. Considere o saldo dos cartões de crédito como compromisso futuro
5. Analise se os gastos não-essenciais estão muito altos

IMPORTANTE: Responda APENAS em formato JSON válido (sem markdown ou texto adicional), seguindo EXATAMENTE este formato:
{
  "dailyBudget": 150.50,
  "reasoning": "Sua explicação em até 150 caracteres, mencionando o fator mais crítico"
}`;

      const response = await sendMessageToDeepSeek(
        [
          {
            id: 'walts-suggestion',
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
          },
        ],
        {
          totalIncome: monthlySalary,
          totalExpenses,
          essentialExpenses,
          nonEssentialExpenses,
        }
      );

      // Parse da resposta JSON
      const cleanResponse = response
        .trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '');
      const suggestion = JSON.parse(cleanResponse);

      const suggestionData = {
        dailyBudget: suggestion.dailyBudget,
        reasoning: suggestion.reasoning,
      };
      setWaltsSuggestion(suggestionData);

      // Persistir no AsyncStorage (por mês)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const monthKey = `${selectedMonth.getFullYear()}_${selectedMonth.getMonth()}`;
        await AsyncStorage.setItem(
          `walts_suggestion_${user.id}_${monthKey}`,
          JSON.stringify(suggestionData)
        );
      }
    } catch (error) {
      console.error('Erro ao obter sugestão do Walts:', error);
      // Fallback para meta calculada
      setWaltsSuggestion({
        dailyBudget: dailyBudget,
        reasoning: 'Baseado no seu saldo restante e dias até o pagamento.',
      });
    } finally {
      setLoadingWaltsSuggestion(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[styles.header, { backgroundColor: theme.background }]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          Análise Financeira
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {loading ? (
          <View
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <LoadingKangaroo size={80} />
          </View>
        ) : (
          <>
            {/* Navegação de Mês - Botões Horizontais */}
            <ScrollView
              ref={monthScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.monthsScroll}
              contentContainerStyle={styles.monthsScrollContent}
            >
              {availableMonths.map((month) => {
                const isSelected =
                  month.getMonth() === selectedMonth.getMonth() &&
                  month.getFullYear() === selectedMonth.getFullYear();
                const monthLabel = month.toLocaleDateString('pt-BR', {
                  month: 'short',
                  year: '2-digit',
                });
                const formattedLabel =
                  monthLabel.charAt(0).toUpperCase() +
                  monthLabel.slice(1).replace('.', '');

                return (
                  <TouchableOpacity
                    key={month.toISOString()}
                    style={[
                      styles.monthButton,
                      {
                        backgroundColor: isSelected
                          ? theme.primary
                          : theme.card,
                        borderColor: theme.cardBorder,
                      },
                    ]}
                    onPress={() => setSelectedMonth(month)}
                  >
                    <Text
                      style={[
                        styles.monthButtonText,
                        {
                          color: isSelected ? theme.background : theme.text,
                        },
                      ]}
                    >
                      {formattedLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Botão de orçamentos */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(theme.background === '#000'),
              ]}
              onPress={() => router.push('/orcamentos')}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Orçamentos
                </Text>
                <ChevronRightIcon size={20} color={theme.text} />
              </View>
            </TouchableOpacity>

            {/* Card Alertas e Pendências */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(theme.background === '#000'),
              ]}
              onPress={() => router.push('/alertas-pendencias')}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Alertas e Pendências
                </Text>
                <ChevronRightIcon size={20} color={theme.text} />
              </View>
            </TouchableOpacity>

            {/* Card Resumo do Mês */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(theme.background === '#000'),
              ]}
              onPress={() => toggleCategory('summary')}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Resumo do Mês
                </Text>
                <View
                  style={{
                    transform: [
                      {
                        rotate: expandedCard === 'summary' ? '180deg' : '0deg',
                      },
                    ],
                  }}
                >
                  <ChevronDownIcon size={20} color={theme.text} />
                </View>
              </View>

              {expandedCard === 'summary' && (
                <View style={styles.cardContent}>
                  <View style={styles.row}>
                    <Text
                      style={[styles.label, { color: theme.textSecondary }]}
                    >
                      Renda Mensal
                    </Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      {formatCurrency(monthlySalary)}
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text
                      style={[styles.label, { color: theme.textSecondary }]}
                    >
                      Total Gasto
                    </Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      {formatCurrency(totalExpenses)}
                    </Text>
                  </View>

                  <View
                    style={[styles.divider, { backgroundColor: theme.border }]}
                  />

                  <View style={styles.row}>
                    <Text style={[styles.labelBold, { color: theme.text }]}>
                      Saldo Restante
                    </Text>
                    <Text style={[styles.valueBold, { color: theme.text }]}>
                      {formatCurrency(remainingBalance)}
                    </Text>
                  </View>

                  {/* Indicador da fonte do saldo */}
                  {balanceSource !== 'none' && (
                    <Text
                      style={[
                        styles.balanceSourceText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {getBalanceSourceLabel(balanceSource)}
                    </Text>
                  )}

                  <View
                    style={[
                      styles.progressBar,
                      { backgroundColor: theme.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(spentPercentage, 100)}%`,
                          backgroundColor: theme.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.progressText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {spentPercentage.toFixed(1)}% do salário gasto
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Card Meta Diária / Gasto Médio */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(theme.background === '#000'),
              ]}
              onPress={() => toggleCategory('daily')}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {isCurrentMonth ? 'Meta Diária' : 'Gasto Médio Diário'}
                </Text>
                <View
                  style={{
                    transform: [
                      { rotate: expandedCard === 'daily' ? '180deg' : '0deg' },
                    ],
                  }}
                >
                  <ChevronDownIcon size={20} color={theme.text} />
                </View>
              </View>

              {expandedCard === 'daily' && (
                <View style={styles.cardContent}>
                  {isCurrentMonth ? (
                    <>
                      <Text style={[styles.dailyAmount, { color: theme.text }]}>
                        {formatCurrency(
                          waltsSuggestion
                            ? waltsSuggestion.dailyBudget
                            : dailyBudget
                        )}
                      </Text>
                      <Text
                        style={[
                          styles.dailyText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {waltsSuggestion
                          ? waltsSuggestion.reasoning
                          : daysUntilNextPayment > 0
                            ? `Voce pode gastar ate esse valor por dia pelos proximos ${daysUntilNextPayment} dias ate o proximo pagamento`
                            : 'Dia do pagamento'}
                      </Text>

                      <TouchableOpacity
                        style={[
                          styles.waltsButton,
                          {
                            backgroundColor: '#f7c359',
                            borderColor: '#f7c359',
                          },
                        ]}
                        onPress={getWaltsSuggestion}
                        disabled={loadingWaltsSuggestion}
                      >
                        {loadingWaltsSuggestion ? (
                          <ActivityIndicator size="small" color="#000" />
                        ) : (
                          <Text style={styles.waltsButtonText}>
                            O Walts sugere...
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.dailyAmount, { color: theme.text }]}>
                        {formatCurrency(averageDailySpent)}
                      </Text>
                      <Text
                        style={[
                          styles.dailyText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {totalExpenses > 0
                          ? `Media de gasto por dia neste mes (${daysInSelectedMonth} dias)`
                          : 'Nenhum gasto registrado neste mes'}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </TouchableOpacity>

            {/* Card Cartões de Crédito */}
            {creditCardAccounts.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(theme.background === '#000'),
                ]}
                onPress={() => router.push('/cartoes')}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Cartões de Crédito
                  </Text>
                  <ChevronRightIcon size={20} color={theme.text} />
                </View>
              </TouchableOpacity>
            )}

            {/* Card Custos Fixos */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(theme.background === '#000'),
              ]}
              onPress={() =>
                router.push({
                  pathname: '/custos-fixos',
                  params: {
                    year: selectedMonth.getFullYear().toString(),
                    month: selectedMonth.getMonth().toString(),
                  },
                })
              }
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Custos Fixos
                </Text>
                <ChevronRightIcon size={20} color={theme.text} />
              </View>
            </TouchableOpacity>

            {/* Card Custos Variáveis */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(theme.background === '#000'),
              ]}
              onPress={() =>
                router.push({
                  pathname: '/custos-variaveis',
                  params: {
                    year: selectedMonth.getFullYear().toString(),
                    month: selectedMonth.getMonth().toString(),
                  },
                })
              }
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Custos Variáveis
                </Text>
                <ChevronRightIcon size={20} color={theme.text} />
              </View>
            </TouchableOpacity>

            {/* Card Gráficos & Tabelas */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(theme.background === '#000'),
              ]}
              onPress={() => router.push('/graficos-tabelas')}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Gráficos & Tabelas
                </Text>
                <ChevronRightIcon size={20} color={theme.text} />
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Paywall Modal para usuários não premium */}
      <PaywallModal
        visible={showPaywall}
        onClose={() => {
          setShowPaywall(false);
          router.back();
        }}
        onSuccess={async () => {
          await refreshPremium();
          setShowPaywall(false);
        }}
        title="Análise Financeira Premium"
        subtitle="Desbloqueie análises detalhadas e insights sobre suas finanças"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 8,
  },
  monthArrow: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    textTransform: 'capitalize',
  },
  monthsScroll: {
    marginBottom: 24,
  },
  monthsScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
  },
  monthButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 8,
  },
  monthButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bankIndicator: {
    width: 8,
    height: 40,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 2,
  },
  cardValue: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cardContent: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  labelBold: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  value: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  valueBold: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 8,
    textAlign: 'center',
  },
  balanceSourceText: {
    fontSize: 13,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 4,
    marginBottom: 8,
    textAlign: 'right',
  },
  dailyAmount: {
    fontSize: 36,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  dailyText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  waltsButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waltsButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#000',
  },
  debtBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  debtBadgeText: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#dc2626',
  },
  debtLabel: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 4,
  },
  debtValue: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
