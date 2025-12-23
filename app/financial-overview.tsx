import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PieChart } from 'react-native-chart-kit';
import { supabase } from '@/lib/supabase';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { ChevronDownIcon } from '@/components/ChevronDownIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

const screenWidth = Dimensions.get('window').width;

type CategoryExpense = {
  category: ExpenseCategory;
  total: number;
};

export default function FinancialOverviewScreen() {
  const { theme } = useTheme();
  const [monthlySalary, setMonthlySalary] = useState<number>(0);
  const [salaryPaymentDay, setSalaryPaymentDay] = useState<number>(1);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [categoryExpenses, setCategoryExpenses] = useState<CategoryExpense[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [showDailyBudget, setShowDailyBudget] = useState(false);

  useEffect(() => {
    loadFinancialData();
  }, []);

  const loadFinancialData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Carregar salário e dia de pagamento
      const { data: profileData } = await supabase
        .from('profiles')
        .select('monthly_salary, salary_payment_day')
        .eq('id', user.id)
        .maybeSingle();

      if (profileData?.monthly_salary) {
        setMonthlySalary(profileData.monthly_salary);
        setSalaryPaymentDay(profileData.salary_payment_day || 1);
      }

      // Carregar gastos do mês atual
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category')
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString());

      if (expensesData) {
        // Calcular total de gastos
        const total = expensesData.reduce((sum, exp) => sum + exp.amount, 0);
        setTotalExpenses(total);

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
      }
    } catch (error) {
      console.error('Erro ao carregar dados financeiros:', error);
    } finally {
      setLoading(false);
    }
  };

  const remainingBalance = monthlySalary - totalExpenses;
  const spentPercentage =
    monthlySalary > 0 ? (totalExpenses / monthlySalary) * 100 : 0;

  // Calcular dias restantes até o próximo pagamento e saldo diário
  const now = new Date();
  const currentDay = now.getDate();

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
  const daysUntilNextPayment = Math.ceil(
    (nextPaymentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  const dailyBudget =
    daysUntilNextPayment > 0 ? remainingBalance / daysUntilNextPayment : 0;

  // Preparar dados para o gráfico de pizza (filtrar categorias desconhecidas)
  const chartData = categoryExpenses
    .filter((item) => CATEGORIES[item.category]) // Ignorar categorias antigas/desconhecidas
    .map((item) => ({
      name: CATEGORIES[item.category].name,
      population: item.total,
      color: CATEGORIES[item.category].color,
      legendFontColor: '#7F7F7F',
      legendFontSize: 12,
    }));

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
          <View style={styles.loadingContainer}>
            <Text style={{ color: theme.text }}>Carregando...</Text>
          </View>
        ) : (
          <>
            {/* Card Resumo do Mês */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={() => setShowSummary(!showSummary)}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Resumo do Mês
                </Text>
                <View
                  style={{
                    transform: [{ rotate: showSummary ? '180deg' : '0deg' }],
                  }}
                >
                  <ChevronDownIcon size={20} color={theme.text} />
                </View>
              </View>

              {showSummary && (
                <View style={styles.cardContent}>
                  <View style={styles.row}>
                    <Text
                      style={[styles.label, { color: theme.textSecondary }]}
                    >
                      Renda Mensal
                    </Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      R$ {monthlySalary.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text
                      style={[styles.label, { color: theme.textSecondary }]}
                    >
                      Total Gasto
                    </Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      R$ {totalExpenses.toFixed(2).replace('.', ',')}
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
                      R$ {remainingBalance.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>

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

            {/* Card Meta Diária */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={() => setShowDailyBudget(!showDailyBudget)}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Meta Diária
                </Text>
                <View
                  style={{
                    transform: [
                      { rotate: showDailyBudget ? '180deg' : '0deg' },
                    ],
                  }}
                >
                  <ChevronDownIcon size={20} color={theme.text} />
                </View>
              </View>

              {showDailyBudget && (
                <View style={styles.cardContent}>
                  <Text style={[styles.dailyAmount, { color: theme.text }]}>
                    R$ {dailyBudget.toFixed(2).replace('.', ',')}
                  </Text>
                  <Text
                    style={[styles.dailyText, { color: theme.textSecondary }]}
                  >
                    {daysUntilNextPayment > 0
                      ? `Você pode gastar até esse valor por dia pelos próximos ${daysUntilNextPayment} dias até o próximo pagamento`
                      : 'Dia do pagamento'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Card Custos Fixos */}
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={() => router.push('/custos-fixos')}
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
              ]}
              onPress={() => router.push('/custos-variaveis')}
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
  cardTitle: {
    fontSize: 20,
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
});
