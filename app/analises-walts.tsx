import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { PieChart } from 'react-native-chart-kit';
import Svg, { Rect, Line } from 'react-native-svg';
import Markdown from 'react-native-markdown-display';
import { supabase } from '@/lib/supabase';
import { sendMessageToDeepSeek } from '@/lib/deepseek';
import { formatCurrency } from '@/lib/formatCurrency';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { GraficoCircularIcon } from '@/components/GraficoCircularIcon';
import { GraficoBarrasIcon } from '@/components/GraficoBarrasIcon';
import { RelogioTresIcon } from '@/components/RelogioTresIcon';
import { useTheme } from '@/lib/theme';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import {
  calculateTotalBalance,
  getBalanceSourceLabel,
  type BalanceSource,
} from '@/lib/calculateBalance';

type ChartType = 'pie' | 'bar';

const screenWidth = Dimensions.get('window').width;

type CategoryExpense = {
  category: ExpenseCategory;
  total: number;
  count: number;
};

type MonthData = {
  month: string;
  year: number;
  total: number;
  byCategory: { [key: string]: number };
};

type LeakItem = {
  category: ExpenseCategory;
  total: number;
  count: number;
  avgPerTransaction: number;
};

type IncreaseItem = {
  category: ExpenseCategory;
  currentTotal: number;
  previousTotal: number;
  increase: number;
  percentIncrease: number;
};

export default function RaioXFinanceiroScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [currentMonthData, setCurrentMonthData] = useState<CategoryExpense[]>(
    []
  );
  const [previousMonthData, setPreviousMonthData] = useState<CategoryExpense[]>(
    []
  );
  const [threeMonthsTrend, setThreeMonthsTrend] = useState<MonthData[]>([]);
  const [leaks, setLeaks] = useState<LeakItem[]>([]);
  const [increases, setIncreases] = useState<IncreaseItem[]>([]);
  const [topExpenses, setTopExpenses] = useState<CategoryExpense[]>([]);
  const [trendChartType, setTrendChartType] = useState<ChartType>('bar');
  const [monthsOfUsage, setMonthsOfUsage] = useState(0); // Quantos meses o usuário usa o app
  const [waltsAnalysis, setWaltsAnalysis] = useState<string | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [balanceSource, setBalanceSource] = useState<BalanceSource>('manual');
  const [calculatedBalance, setCalculatedBalance] = useState<number>(0);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar renda e data de criação
      const { data: profile } = await supabase
        .from('profiles')
        .select('income_cards, monthly_salary, created_at')
        .eq('id', user.id)
        .single();

      // Calcular quantos meses o usuário usa o app
      if (profile?.created_at) {
        const createdAt = new Date(profile.created_at);
        const now = new Date();
        const monthsDiff =
          (now.getFullYear() - createdAt.getFullYear()) * 12 +
          (now.getMonth() - createdAt.getMonth()) +
          1; // +1 porque o mês de criação conta como 1
        setMonthsOfUsage(monthsDiff);
      } else {
        setMonthsOfUsage(1); // Se não tem created_at, assume primeiro mês
      }

      // Tipo para income_cards
      type IncomeCard = {
        id: string;
        salary: string;
        paymentDay: string;
        incomeSource: string;
        linkedAccountId?: string;
      };

      let totalIncome = 0;
      let incomeCards: IncomeCard[] = [];

      if (profile?.income_cards && Array.isArray(profile.income_cards)) {
        incomeCards = profile.income_cards as IncomeCard[];
        totalIncome = incomeCards.reduce((sum: number, card: IncomeCard) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);
      }
      if (totalIncome === 0 && profile?.monthly_salary) {
        totalIncome = profile.monthly_salary;
      }
      setMonthlyIncome(totalIncome);

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

      // Datas para os ultimos 3 meses
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

      // Formatar data como string para evitar problemas de timezone
      const formatDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const twoMonthsAgoStr = formatDateStr(twoMonthsAgo);

      // Buscar gastos MANUAIS dos ultimos 3 meses
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, subcategory, date, created_at')
        .eq('user_id', user.id)
        .gte('date', twoMonthsAgoStr)
        .order('date', { ascending: false });

      // Buscar contas do usuario para transacoes do extrato
      const { data: userAccounts } = await supabase
        .from('pluggy_accounts')
        .select('id')
        .eq('user_id', user.id);

      let extractTransactions: any[] = [];

      if (userAccounts && userAccounts.length > 0) {
        const accountIds = userAccounts.map((a: any) => a.id);

        // Buscar transacoes categorizadas do extrato
        const { data: categorizedTx } = await supabase
          .from('transaction_categories')
          .select(
            `
            category,
            subcategory,
            pluggy_transactions!inner(
              amount,
              date,
              account_id,
              type
            )
          `
          )
          .eq('user_id', user.id);

        if (categorizedTx) {
          // Filtrar por contas do usuario e apenas DEBIT (saidas)
          extractTransactions = categorizedTx
            .filter((tx: any) => {
              const txAccountId = tx.pluggy_transactions?.account_id;
              const txType = tx.pluggy_transactions?.type;
              const txDate = tx.pluggy_transactions?.date;
              if (!txAccountId || !txDate) return false;
              if (!accountIds.includes(txAccountId)) return false;
              if (txType !== 'DEBIT') return false;
              // Filtrar por periodo (ultimos 3 meses) usando string
              const txDateStr = txDate.split('T')[0];
              return txDateStr >= twoMonthsAgoStr;
            })
            .map((tx: any) => ({
              amount: Math.abs(tx.pluggy_transactions?.amount || 0),
              category: tx.category,
              subcategory: tx.subcategory,
              date: tx.pluggy_transactions?.date,
              created_at: tx.pluggy_transactions?.date,
              source: 'extrato',
            }));
        }
      }

      // Combinar expenses manuais com extrato
      const allExpenses = [
        ...(expensesData || []).map((exp) => ({ ...exp, source: 'manual' })),
        ...extractTransactions,
      ];

      if (allExpenses.length === 0) {
        setLoading(false);
        return;
      }

      // Separar gastos por mes
      const currentMonthExpenses: CategoryExpense[] = [];
      const previousMonthExpenses: CategoryExpense[] = [];
      const monthlyTotals: MonthData[] = [];

      // Agrupar por mes e categoria (consolidado por categoria, não subcategoria)
      const groupByMonth = (expenses: any[], monthStart: Date) => {
        // Usar comparação de strings para evitar problemas de timezone
        const year = monthStart.getFullYear();
        const month = monthStart.getMonth();
        const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const filtered = expenses.filter((exp) => {
          const expDateStr = exp.date.split('T')[0]; // Pegar apenas a parte da data (YYYY-MM-DD)
          return expDateStr >= startDateStr && expDateStr <= endDateStr;
        });

        const grouped = new Map<ExpenseCategory, CategoryExpense>();
        filtered.forEach((exp) => {
          const category = (exp.category as ExpenseCategory) || 'outros';

          if (grouped.has(category)) {
            const existing = grouped.get(category)!;
            existing.total += exp.amount;
            existing.count += 1;
          } else {
            grouped.set(category, {
              category,
              total: exp.amount,
              count: 1,
            });
          }
        });

        return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
      };

      const currentData = groupByMonth(allExpenses, currentMonth);
      const previousData = groupByMonth(allExpenses, previousMonth);
      const twoMonthsData = groupByMonth(allExpenses, twoMonthsAgo);

      setCurrentMonthData(currentData);
      setPreviousMonthData(previousData);

      // Calcular total de gastos do mês atual
      const totalCurrentExpenses = currentData.reduce(
        (sum, item) => sum + item.total,
        0
      );

      // Calcular gastos RECENTES (após última sincronização)
      let recentExpenses = 0;
      if (expensesData) {
        // Se tiver data de sincronização, usa ela; senão, considera gastos das últimas 24h como recentes
        const cutoffDate = lastSyncAt
          ? new Date(lastSyncAt)
          : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas atrás

        // Filtrar gastos do mês atual que foram criados após o cutoff
        const currentMonthStart = currentMonth;
        const currentMonthEnd = new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth() + 1,
          0
        );
        recentExpenses = expensesData
          .filter((exp) => {
            const expDate = new Date(exp.date);
            const createdAt = new Date(exp.created_at);
            return (
              expDate >= currentMonthStart &&
              expDate <= currentMonthEnd &&
              createdAt > cutoffDate
            );
          })
          .reduce((sum, exp) => sum + exp.amount, 0);
      }

      // Calcular saldo usando lógica inteligente (menor entre manual e banco)
      const balanceResult = calculateTotalBalance(
        incomeCards,
        accountBalances,
        totalCurrentExpenses,
        recentExpenses
      );

      setCalculatedBalance(balanceResult.remainingBalance);
      setBalanceSource(balanceResult.source);

      // Top 5 gastos do mes atual
      setTopExpenses(currentData.slice(0, 5));

      // Calcular vazamentos (gastos pequenos e frequentes)
      const leakItems: LeakItem[] = currentData
        .filter((item) => {
          // Vazamentos: mais de 3 transacoes E valor medio < R$ 100
          const avgPerTx = item.total / item.count;
          return item.count >= 3 && avgPerTx < 100;
        })
        .map((item) => ({
          ...item,
          avgPerTransaction: item.total / item.count,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setLeaks(leakItems);

      // Calcular aumentos (comparacao com mes anterior - por categoria)
      const increaseItems: IncreaseItem[] = [];
      currentData.forEach((current) => {
        const previous = previousData.find(
          (p) => p.category === current.category
        );
        const previousTotal = previous?.total || 0;

        if (previousTotal > 0) {
          const increase = current.total - previousTotal;
          const percentIncrease = (increase / previousTotal) * 100;

          if (percentIncrease >= 20 && increase >= 50) {
            increaseItems.push({
              category: current.category,
              currentTotal: current.total,
              previousTotal,
              increase,
              percentIncrease,
            });
          }
        } else if (current.total >= 100) {
          // Gasto novo significativo
          increaseItems.push({
            category: current.category,
            currentTotal: current.total,
            previousTotal: 0,
            increase: current.total,
            percentIncrease: 100,
          });
        }
      });
      setIncreases(
        increaseItems
          .sort((a, b) => b.percentIncrease - a.percentIncrease)
          .slice(0, 5)
      );

      // Tendencia 3 meses
      const monthNames = [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
      ];
      setThreeMonthsTrend([
        {
          month: monthNames[twoMonthsAgo.getMonth()],
          year: twoMonthsAgo.getFullYear(),
          total: twoMonthsData.reduce((sum, item) => sum + item.total, 0),
          byCategory: {},
        },
        {
          month: monthNames[previousMonth.getMonth()],
          year: previousMonth.getFullYear(),
          total: previousData.reduce((sum, item) => sum + item.total, 0),
          byCategory: {},
        },
        {
          month: monthNames[currentMonth.getMonth()],
          year: currentMonth.getFullYear(),
          total: currentData.reduce((sum, item) => sum + item.total, 0),
          byCategory: {},
        },
      ]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Gerar análise do Walts
  const generateWaltsAnalysis = async () => {
    try {
      setLoadingAnalysis(true);
      setShowAnalysis(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        Alert.alert('Erro', 'Sessão não encontrada');
        return;
      }

      // Preparar contexto para o Walts
      const context = {
        monthlyIncome,
        currentMonthTotal: currentMonthData.reduce(
          (sum, item) => sum + item.total,
          0
        ),
        topExpenses: topExpenses.slice(0, 5).map((exp) => ({
          category: CATEGORIES[exp.category]?.name || exp.category,
          total: exp.total,
        })),
        leaks: leaks.slice(0, 5).map((leak) => ({
          category: CATEGORIES[leak.category]?.name || leak.category,
          total: leak.total,
          count: leak.count,
          avgPerTransaction: leak.avgPerTransaction,
        })),
        increases: increases.slice(0, 3).map((inc) => ({
          category: CATEGORIES[inc.category]?.name || inc.category,
          currentTotal: inc.currentTotal,
          previousTotal: inc.previousTotal,
          percentIncrease: inc.percentIncrease,
        })),
        threeMonthsTrend: threeMonthsTrend.map((m) => ({
          month: m.month,
          total: m.total,
        })),
      };

      const prompt = `Analise meu Raio-X Financeiro e me dê sugestões práticas e personalizadas.

Aqui estão os dados:
- Renda mensal: R$ ${monthlyIncome.toFixed(2)}
- Gastos do mês atual: R$ ${context.currentMonthTotal.toFixed(2)}
- Top 5 gastos: ${JSON.stringify(context.topExpenses)}
- Vazamentos (pequenos gastos frequentes): ${JSON.stringify(context.leaks)}
- Gastos que aumentaram: ${JSON.stringify(context.increases)}
- Tendência 3 meses: ${JSON.stringify(context.threeMonthsTrend)}

Faça uma análise detalhada e me dê:
1. Um resumo da minha situação financeira
2. Pontos de atenção específicos
3. 3 sugestões práticas para melhorar
4. Uma meta sugerida para o próximo mês

Use formatação markdown para organizar a resposta. NÃO use emojis na resposta.`;

      const response = await sendMessageToDeepSeek([
        {
          id: 'analysis-request',
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
        },
      ]);

      if (!response) {
        Alert.alert('Erro', 'Não foi possível gerar a análise');
        return;
      }

      setWaltsAnalysis(response);
    } catch (error) {
      console.error('Error generating analysis:', error);
      Alert.alert('Erro', 'Ocorreu um erro ao gerar a análise');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Salvar análise no histórico
  const saveAnalysis = async () => {
    if (!waltsAnalysis) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase.from('walts_analyses').insert({
        user_id: user.id,
        analysis_type: 'raio_x_financeiro',
        content: waltsAnalysis,
        context_data: {
          monthlyIncome,
          currentMonthTotal: currentMonthData.reduce(
            (sum, item) => sum + item.total,
            0
          ),
          topExpenses: topExpenses.slice(0, 5),
          leaks: leaks.slice(0, 5),
          increases: increases.slice(0, 3),
        },
      });

      if (error) {
        console.error('Error saving analysis:', error);
        Alert.alert('Erro', 'Não foi possível salvar a análise');
        return;
      }

      // Limpar análise da tela após salvar
      setWaltsAnalysis(null);
      setShowAnalysis(false);

      Alert.alert('Sucesso', 'Análise salva no histórico!');
    } catch (error) {
      console.error('Error saving analysis:', error);
      Alert.alert('Erro', 'Ocorreu um erro ao salvar');
    }
  };

  const totalCurrentMonth = currentMonthData.reduce(
    (sum, item) => sum + item.total,
    0
  );
  const totalLeaks = leaks.reduce((sum, item) => sum + item.total, 0);
  const leaksPercent =
    monthlyIncome > 0 ? (totalLeaks / monthlyIncome) * 100 : 0;

  // Grafico de tendencia
  const maxTrendValue = Math.max(...threeMonthsTrend.map((m) => m.total), 1);
  const trendChartHeight = 120;
  const trendChartWidth = screenWidth - 96;

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
          Raio-X Financeiro
        </Text>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => router.push('/raio-x-history')}
        >
          <RelogioTresIcon size={24} color={theme.text} />
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.text }]}>
              Analisando suas finanças...
            </Text>
          </View>
        ) : (
          <>
            {/* Card Vazamentos */}
            {leaks.length > 0 && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: '#ef4444',
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: '#ef4444' }]}>
                    Vazamentos do Mês
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Gastos pequenos que somaram muito
                  </Text>
                </View>

                {leaks.map((item, index) => {
                  const categoryInfo = CATEGORIES[item.category] || {
                    name: 'Outros',
                    color: '#B0BEC5',
                  };
                  return (
                    <View key={index} style={styles.leakRow}>
                      <View style={styles.leakLeft}>
                        <CategoryIcon
                          categoryInfo={categoryInfo as any}
                          size={20}
                        />
                        <Text style={[styles.leakName, { color: theme.text }]}>
                          {categoryInfo.name}
                        </Text>
                      </View>
                      <View style={styles.leakRight}>
                        <Text
                          style={[styles.leakAmount, { color: theme.text }]}
                        >
                          {formatCurrency(item.total)}
                        </Text>
                        <Text
                          style={[
                            styles.leakCount,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {item.count}x
                        </Text>
                      </View>
                    </View>
                  );
                })}

                <View
                  style={[
                    styles.leakSummary,
                    { borderTopColor: theme.cardBorder },
                  ]}
                >
                  <Text style={[styles.leakSummaryText, { color: theme.text }]}>
                    Total em vazamentos:
                  </Text>
                  <Text style={[styles.leakSummaryValue, { color: '#ef4444' }]}>
                    {formatCurrency(totalLeaks)} ({leaksPercent.toFixed(0)}% da
                    renda)
                  </Text>
                </View>
              </View>
            )}

            {/* Card Gastos que Aumentaram - só aparece a partir do 2º mês */}
            {increases.length > 0 && monthsOfUsage >= 2 && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: '#f59e0b',
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: '#f59e0b' }]}>
                    Gastos que Aumentaram
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Comparado com mês passado
                  </Text>
                </View>

                {increases.map((item, index) => {
                  const categoryInfo = CATEGORIES[item.category] || {
                    name: 'Outros',
                    color: '#B0BEC5',
                  };
                  return (
                    <View key={index} style={styles.increaseRow}>
                      <View style={styles.increaseLeft}>
                        <CategoryIcon
                          categoryInfo={categoryInfo as any}
                          size={20}
                        />
                        <Text
                          style={[styles.increaseName, { color: theme.text }]}
                        >
                          {categoryInfo.name}
                        </Text>
                      </View>
                      <View style={styles.increaseRight}>
                        <Text
                          style={[styles.increasePercent, { color: '#f59e0b' }]}
                        >
                          +{item.percentIncrease.toFixed(0)}%
                        </Text>
                        <Text
                          style={[
                            styles.increaseAmount,
                            { color: theme.textSecondary },
                          ]}
                        >
                          +{formatCurrency(item.increase)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Card Top 5 Gastos */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Top 5 - Onde Foi Seu Dinheiro
                </Text>
                <Text
                  style={[styles.cardSubtitle, { color: theme.textSecondary }]}
                >
                  Maiores gastos deste mês
                </Text>
              </View>

              {topExpenses.map((item, index) => {
                const categoryInfo = CATEGORIES[item.category] || {
                  name: 'Outros',
                  color: '#B0BEC5',
                };
                const percent =
                  monthlyIncome > 0 ? (item.total / monthlyIncome) * 100 : 0;

                return (
                  <View key={index} style={styles.topRow}>
                    <View style={styles.topRank}>
                      <Text
                        style={[styles.topRankText, { color: theme.primary }]}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <View style={styles.topInfo}>
                      <View style={styles.topInfoHeader}>
                        <CategoryIcon
                          categoryInfo={categoryInfo as any}
                          size={18}
                        />
                        <Text style={[styles.topName, { color: theme.text }]}>
                          {categoryInfo.name}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.topBar,
                          { backgroundColor: theme.cardBorder },
                        ]}
                      >
                        <View
                          style={[
                            styles.topBarFill,
                            {
                              backgroundColor: categoryInfo.color,
                              width: `${Math.min(percent * 2, 100)}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={styles.topValues}>
                      <Text style={[styles.topAmount, { color: theme.text }]}>
                        {formatCurrency(item.total)}
                      </Text>
                      <Text
                        style={[
                          styles.topPercent,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {percent.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                );
              })}

              {topExpenses.length === 0 && (
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  Nenhum gasto registrado este mês
                </Text>
              )}
            </View>

            {/* Card Tendência 3 Meses - só aparece a partir do 2º mês */}
            {threeMonthsTrend.length > 0 && monthsOfUsage >= 2 && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <View style={styles.trendHeader}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Tendência - Últimos 3 Meses
                  </Text>
                  <TouchableOpacity
                    style={styles.chartTypeButton}
                    onPress={() =>
                      setTrendChartType(
                        trendChartType === 'bar' ? 'pie' : 'bar'
                      )
                    }
                  >
                    {trendChartType === 'bar' ? (
                      <GraficoCircularIcon size={24} color={theme.text} />
                    ) : (
                      <GraficoBarrasIcon size={24} color={theme.text} />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.trendChart}>
                  {trendChartType === 'bar' ? (
                    <>
                      <Svg
                        width={trendChartWidth}
                        height={trendChartHeight + 40}
                      >
                        {/* Linhas de grade */}
                        {[0, 1, 2].map((i) => (
                          <Line
                            key={`grid-${i}`}
                            x1={0}
                            y1={(trendChartHeight / 2) * i + 10}
                            x2={trendChartWidth}
                            y2={(trendChartHeight / 2) * i + 10}
                            stroke={
                              theme.background === '#000'
                                ? 'rgba(255,255,255,0.1)'
                                : 'rgba(0,0,0,0.1)'
                            }
                            strokeWidth={1}
                          />
                        ))}

                        {/* Barras */}
                        {threeMonthsTrend.map((month, index) => {
                          const barWidth = (trendChartWidth - 60) / 3;
                          const barHeight =
                            (month.total / maxTrendValue) *
                            (trendChartHeight - 20);
                          const x = 30 + index * barWidth;
                          const y = trendChartHeight - barHeight + 10;

                          const isCurrentMonth = index === 2;
                          const color = isCurrentMonth
                            ? theme.primary
                            : theme.textSecondary;

                          return (
                            <React.Fragment key={index}>
                              <Rect
                                x={x}
                                y={y}
                                width={barWidth - 20}
                                height={barHeight}
                                fill={color}
                                rx={4}
                              />
                            </React.Fragment>
                          );
                        })}
                      </Svg>

                      {/* Labels abaixo do gráfico */}
                      <View style={styles.trendLabels}>
                        {threeMonthsTrend.map((month, index) => (
                          <View key={index} style={styles.trendLabel}>
                            <Text
                              style={[
                                styles.trendMonthText,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {month.month}
                            </Text>
                            <Text
                              style={[
                                styles.trendValueText,
                                {
                                  color:
                                    index === 2 ? theme.primary : theme.text,
                                },
                              ]}
                            >
                              {formatCurrency(month.total)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <>
                      <PieChart
                        data={threeMonthsTrend.map((month, index) => ({
                          name: month.month,
                          population: month.total,
                          color:
                            index === 2
                              ? theme.primary
                              : index === 1
                                ? '#9CA3AF'
                                : '#D1D5DB',
                          legendFontColor: theme.text,
                          legendFontSize: 0,
                        }))}
                        width={screenWidth - 88}
                        height={180}
                        chartConfig={{
                          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                        }}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="60"
                        absolute
                        hasLegend={false}
                      />

                      {/* Legenda do gráfico pizza */}
                      <View style={styles.pieLegend}>
                        {threeMonthsTrend.map((month, index) => (
                          <View key={index} style={styles.pieLegendItem}>
                            <View
                              style={[
                                styles.pieLegendColor,
                                {
                                  backgroundColor:
                                    index === 2
                                      ? theme.primary
                                      : index === 1
                                        ? '#9CA3AF'
                                        : '#D1D5DB',
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.pieLegendText,
                                { color: theme.text },
                              ]}
                            >
                              {month.month}: {formatCurrency(month.total)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Resumo */}
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <View style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, { color: theme.textSecondary }]}
                >
                  Renda Mensal
                </Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>
                  {formatCurrency(monthlyIncome)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, { color: theme.textSecondary }]}
                >
                  Total Gasto (mês atual)
                </Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>
                  {formatCurrency(totalCurrentMonth)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, { color: theme.textSecondary }]}
                >
                  Saldo Restante
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    {
                      color: calculatedBalance >= 0 ? '#10b981' : '#ef4444',
                    },
                  ]}
                >
                  {formatCurrency(calculatedBalance)}
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
            </View>

            {/* Área de análise do Walts (aparece acima dos botões) */}
            {showAnalysis && (
              <View style={styles.analysisContainer}>
                {loadingAnalysis ? (
                  <View style={styles.analysisLoading}>
                    <ActivityIndicator size="large" color={theme.primary} />
                    <Text
                      style={[
                        styles.analysisLoadingText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Walts está analisando suas finanças...
                    </Text>
                  </View>
                ) : waltsAnalysis ? (
                  <View
                    style={[
                      styles.analysisCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.cardBorder,
                      },
                    ]}
                  >
                    <Markdown
                      style={{
                        body: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          fontSize: 16,
                        },
                        text: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          fontSize: 16,
                        },
                        heading1: {
                          color: theme.text,
                          fontFamily: 'DMSans-Bold',
                          fontSize: 20,
                          marginTop: 16,
                          marginBottom: 8,
                        },
                        heading2: {
                          color: theme.text,
                          fontFamily: 'DMSans-SemiBold',
                          fontSize: 18,
                          marginTop: 12,
                          marginBottom: 6,
                        },
                        heading3: {
                          color: theme.text,
                          fontFamily: 'DMSans-SemiBold',
                          fontSize: 16,
                          marginTop: 8,
                          marginBottom: 4,
                        },
                        heading4: {
                          color: theme.text,
                          fontFamily: 'DMSans-SemiBold',
                          fontSize: 15,
                          marginTop: 8,
                          marginBottom: 4,
                        },
                        paragraph: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          fontSize: 16,
                          lineHeight: 24,
                          marginBottom: 8,
                        },
                        bullet_list: {
                          marginBottom: 8,
                        },
                        ordered_list: {
                          marginBottom: 8,
                        },
                        list_item: {
                          flexDirection: 'row',
                          marginBottom: 4,
                        },
                        bullet_list_icon: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          fontSize: 16,
                        },
                        ordered_list_icon: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          fontSize: 16,
                        },
                        bullet_list_content: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          fontSize: 16,
                        },
                        ordered_list_content: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          fontSize: 16,
                        },
                        strong: {
                          color: theme.text,
                          fontFamily: 'DMSans-Bold',
                        },
                        em: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                        },
                        link: {
                          color: theme.primary,
                          fontFamily: 'DMSans-Regular',
                        },
                        blockquote: {
                          color: theme.textSecondary,
                          fontFamily: 'DMSans-Regular',
                          borderLeftWidth: 3,
                          borderLeftColor: theme.primary,
                          paddingLeft: 12,
                          marginVertical: 8,
                        },
                        code_inline: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          backgroundColor: theme.cardBorder,
                          paddingHorizontal: 4,
                          borderRadius: 4,
                        },
                        fence: {
                          color: theme.text,
                          fontFamily: 'DMSans-Regular',
                          backgroundColor: theme.cardBorder,
                          padding: 8,
                          borderRadius: 8,
                          marginVertical: 8,
                        },
                        hr: {
                          backgroundColor: theme.cardBorder,
                          height: 1,
                          marginVertical: 12,
                        },
                      }}
                    >
                      {waltsAnalysis}
                    </Markdown>
                  </View>
                ) : null}
              </View>
            )}

            {/* Botões de análise */}
            <View style={styles.analysisButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.analyzeButton,
                  { backgroundColor: theme.primary },
                  showAnalysis && waltsAnalysis && styles.analyzeButtonSmall,
                ]}
                onPress={generateWaltsAnalysis}
                disabled={loadingAnalysis}
              >
                {loadingAnalysis ? (
                  <ActivityIndicator size="small" color={theme.background} />
                ) : (
                  <Text
                    style={[
                      styles.analyzeButtonText,
                      { color: theme.background },
                    ]}
                  >
                    {showAnalysis && waltsAnalysis
                      ? 'Nova Análise'
                      : 'Analisar com o Walts'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Botão Salvar (aparece ao lado quando tem análise) */}
              {showAnalysis && waltsAnalysis && !loadingAnalysis && (
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    { backgroundColor: theme.primary },
                  ]}
                  onPress={saveAnalysis}
                >
                  <Text
                    style={[styles.saveButtonText, { color: theme.background }]}
                  >
                    Salvar
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  historyButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    marginTop: 16,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginTop: 4,
  },
  leakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  leakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  leakName: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  leakRight: {
    alignItems: 'flex-end',
  },
  leakAmount: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  leakCount: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  leakSummary: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
  },
  leakSummaryText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  leakSummaryValue: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    marginTop: 4,
  },
  increaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  increaseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  increaseName: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  increaseRight: {
    alignItems: 'flex-end',
  },
  increasePercent: {
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
  },
  increaseAmount: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  topRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRankText: {
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
  },
  topInfo: {
    flex: 1,
  },
  topInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  topName: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
  },
  topBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  topBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  topValues: {
    alignItems: 'flex-end',
  },
  topAmount: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  topPercent: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTypeButton: {
    padding: 8,
  },
  trendChart: {
    alignItems: 'center',
  },
  pieLegend: {
    marginTop: 16,
    gap: 8,
  },
  pieLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pieLegendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pieLegendText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  trendLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 8,
  },
  trendLabel: {
    alignItems: 'center',
    flex: 1,
  },
  trendMonthText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  trendValueText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    marginTop: 4,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
    borderWidth: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  summaryValue: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    padding: 20,
  },
  analysisContainer: {
    marginTop: 16,
  },
  analysisLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  analysisLoadingText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  analysisContent: {
    marginBottom: 16,
  },
  analyzeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  analyzeButtonText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  newAnalysisButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 2,
  },
  newAnalysisButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  analysisButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 40,
  },
  analyzeButtonSmall: {
    flex: 1,
  },
  analysisCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  balanceSourceText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    marginTop: 4,
    textAlign: 'right',
  },
});
