import { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Text,
  Image,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { UsuarioIcon } from '@/components/UsuarioIcon';
import { EyeIcon } from '@/components/EyeIcon';
import { EyeOffIcon } from '@/components/EyeOffIcon';
import { SalarySetupModal } from '@/components/SalarySetupModal';
import { PaywallModal } from '@/components/PaywallModal';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/lib/theme';
import { getCardShadowStyle } from '@/lib/cardStyles';
import {
  calculateTotalBalance,
  getBalanceSourceLabel,
  type BalanceSource,
} from '@/lib/calculateBalance';
import { usePremium } from '@/lib/usePremium';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';

type IncomeCard = {
  id: string;
  salary: string;
  paymentDay: string;
  incomeSource: string;
  linkedAccountId?: string;
  lastKnownBalance?: number;
};

type CategoryTotal = {
  category: ExpenseCategory;
  total: number;
  budgetAmount: number | null;
};

export default function HomeScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    isPremium,
    loading: premiumLoading,
    refresh: refreshPremium,
  } = usePremium();

  const [showSalarySetup, setShowSalarySetup] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState<number | null>(null);
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [calculatedBalance, setCalculatedBalance] = useState<number>(0);
  const [balanceSource, setBalanceSource] = useState<BalanceSource>('manual');
  const [incomeCards, setIncomeCards] = useState<IncomeCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [dailyBudget, setDailyBudget] = useState<number>(0);
  const [daysUntilNextPayment, setDaysUntilNextPayment] = useState<number>(0);
  const [topCategories, setTopCategories] = useState<CategoryTotal[]>([]);

  useEffect(() => {
    loadProfile();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, []);

  const loadProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'monthly_salary, avatar_url, income_cards, name, salary_payment_day'
        )
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar perfil:', error);
        return;
      }

      if (data?.name) {
        setUserName(data.name);
      }

      let totalIncome = 0;
      let cards: IncomeCard[] = [];
      let nextPaymentDay = data?.salary_payment_day || 1;

      if (data?.income_cards && Array.isArray(data.income_cards)) {
        cards = data.income_cards as IncomeCard[];
        setIncomeCards(cards);

        totalIncome = cards.reduce((sum, card) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);

        const today = new Date();
        const currentDay = today.getDate();
        const paymentDays = cards
          .map((card) => parseInt(card.paymentDay))
          .filter((day) => !isNaN(day) && day >= 1 && day <= 31);

        if (paymentDays.length > 0) {
          const upcomingThisMonth = paymentDays.filter(
            (day) => day > currentDay
          );
          if (upcomingThisMonth.length > 0) {
            nextPaymentDay = Math.min(...upcomingThisMonth);
          } else {
            nextPaymentDay = Math.min(...paymentDays);
          }
        }
      } else if (data?.monthly_salary) {
        totalIncome = data.monthly_salary;
      }

      setMonthlySalary(totalIncome);

      const linkedAccountIds = cards
        .filter((card) => card.linkedAccountId)
        .map((card) => card.linkedAccountId as string);

      let accountBalances: { id: string; balance: number | null }[] = [];
      let lastSyncAt: string | null = null;

      if (linkedAccountIds.length > 0) {
        const { data: linkedAccounts } = await supabase
          .from('pluggy_accounts')
          .select('id, balance, last_sync_at')
          .in('id', linkedAccountIds);

        if (linkedAccounts && linkedAccounts.length > 0) {
          accountBalances = linkedAccounts;
          const syncDates = linkedAccounts
            .map((acc: any) => acc.last_sync_at)
            .filter(Boolean);
          if (syncDates.length > 0) {
            lastSyncAt = syncDates.sort().pop() || null;
          }
        }
      }

      const now = new Date();
      const brazilOffset = -3 * 60;
      const brazilNow = new Date(now.getTime() + brazilOffset * 60 * 1000);

      const year = brazilNow.getFullYear();
      const month = brazilNow.getMonth();
      const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data: allExpensesData } = await supabase
        .from('expenses')
        .select('amount, created_at, source, is_cash, category')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      const manualExpenses = (allExpensesData || []).filter(
        (exp) => !exp.source || exp.source === 'manual'
      );

      const monthTotalExpenses = manualExpenses.reduce(
        (sum, exp) =>
          sum +
          (typeof exp.amount === 'string'
            ? parseFloat(exp.amount)
            : exp.amount),
        0
      );

      setTotalExpenses(monthTotalExpenses);

      let recentExpenses = 0;
      if (manualExpenses.length > 0) {
        const cutoffDate = lastSyncAt
          ? new Date(lastSyncAt)
          : new Date(Date.now() - 24 * 60 * 60 * 1000);

        recentExpenses = manualExpenses
          .filter((exp) => {
            if (exp.is_cash) return true;
            return new Date(exp.created_at) > cutoffDate;
          })
          .reduce(
            (sum, exp) =>
              sum +
              (typeof exp.amount === 'string'
                ? parseFloat(exp.amount)
                : exp.amount),
            0
          );
      }

      const balanceResult = calculateTotalBalance(
        cards,
        accountBalances,
        monthTotalExpenses,
        recentExpenses
      );

      setCalculatedBalance(balanceResult.remainingBalance);
      setBalanceSource(balanceResult.source);

      // Meta Diária calculation
      const remainingBalance =
        balanceResult.source !== 'none'
          ? balanceResult.remainingBalance
          : totalIncome - monthTotalExpenses;

      const currentDay = now.getDate();
      let nextPaymentDate: Date;
      if (currentDay < nextPaymentDay) {
        nextPaymentDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          nextPaymentDay
        );
      } else {
        nextPaymentDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          nextPaymentDay
        );
      }

      const daysRemaining = Math.ceil(
        (nextPaymentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      setDaysUntilNextPayment(daysRemaining);
      setDailyBudget(daysRemaining > 0 ? remainingBalance / daysRemaining : 0);

      // Top categories
      const categoryMap: Record<string, number> = {};
      for (const exp of allExpensesData || []) {
        const cat = exp.category || 'outros';
        const amount =
          typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount;
        categoryMap[cat] = (categoryMap[cat] || 0) + amount;
      }

      const { data: budgetsData } = await supabase
        .from('budgets')
        .select('category_id, amount')
        .eq('user_id', user.id);

      const budgetMap: Record<string, number> = {};
      for (const b of budgetsData || []) {
        budgetMap[b.category_id] =
          typeof b.amount === 'string' ? parseFloat(b.amount) : b.amount;
      }

      const sorted = Object.entries(categoryMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cat, total]) => ({
          category: cat as ExpenseCategory,
          total,
          budgetAmount: budgetMap[cat] ?? null,
        }));

      setTopCategories(sorted);

      if (data?.avatar_url) {
        setProfileImage(data.avatar_url);
      }

      if (
        totalIncome === 0 &&
        (!data?.income_cards || data.income_cards.length === 0)
      ) {
        const hasShownSetup = await AsyncStorage.getItem(
          `salary_setup_shown_${user.id}`
        );
        if (!hasShownSetup) {
          setShowSalarySetup(true);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    }
  };

  const handleSalarySetup = async (salary: number, paymentDay: number) => {
    setSavingSalary(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      const firstIncomeCard = {
        id: Date.now().toString(),
        salary: salary.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        paymentDay: paymentDay.toString(),
        incomeSource: 'outros',
      };

      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          monthly_salary: salary,
          salary_payment_day: paymentDay,
          income_cards: [firstIncomeCard],
        },
        { onConflict: 'id' }
      );

      if (error) throw error;

      await AsyncStorage.setItem(`salary_setup_shown_${user.id}`, 'true');
      setMonthlySalary(salary);
      setShowSalarySetup(false);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a renda mensal.');
    } finally {
      setSavingSalary(false);
    }
  };

  const handleSkipSetup = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await AsyncStorage.setItem(`salary_setup_shown_${user.id}`, 'true');
      }
      setShowSalarySetup(false);
    } catch {
      setShowSalarySetup(false);
    }
  };

  const renderSalaryValue = () => {
    const formatted = formatCurrency(calculatedBalance);
    const currencySymbol = 'R$ ';
    const numberPart = formatted.replace(/^R\$\s*/u, '');
    const barColor = isDark ? '#fff' : '#000';

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[styles.salaryText, { color: theme.text }]}>
          {currencySymbol}
        </Text>
        {salaryVisible ? (
          <Text style={[styles.salaryText, { color: theme.text }]}>
            {numberPart}
          </Text>
        ) : (
          <View
            style={{
              backgroundColor: barColor,
              height: 24,
              borderRadius: 4,
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <Text
              style={[
                styles.salaryText,
                { color: 'transparent', includeFontPadding: false },
              ]}
            >
              {numberPart}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderValue = (value: string, style?: any) => {
    if (salaryVisible) {
      return <Text style={style}>{value}</Text>;
    }
    const barColor = isDark ? '#fff' : '#000';
    const flatStyle = Array.isArray(style)
      ? Object.assign({}, ...style)
      : style || {};
    const fontSize = flatStyle.fontSize || 14;
    const fontFamily = flatStyle.fontFamily || 'DMSans-Medium';
    return (
      <View
        style={{
          backgroundColor: barColor,
          borderRadius: fontSize > 20 ? 5 : 3,
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Text
          style={{
            color: 'transparent',
            fontSize,
            fontFamily,
            includeFontPadding: false,
          }}
        >
          {value}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Fixed Header: Balance + Profile */}
      <View
        style={[
          styles.fixedHeader,
          { paddingTop: insets.top + 16, backgroundColor: theme.background },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.salaryContainer}>
            <TouchableOpacity
              style={styles.salaryTouchable}
              onPress={() => {
                if (premiumLoading || isPremium) {
                  router.push('/financial-overview');
                } else {
                  setShowPaywall(true);
                }
              }}
            >
              {renderSalaryValue()}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setSalaryVisible(!salaryVisible)}
            >
              {salaryVisible ? (
                <EyeIcon size={20} color={theme.textSecondary} />
              ) : (
                <EyeOffIcon size={20} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.spacer} />
          <TouchableOpacity
            style={[
              styles.headerButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => router.push('/perfil')}
          >
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.profileButtonImage}
              />
            ) : (
              <UsuarioIcon size={24} color={theme.text} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        {userName ? (
          <Text style={[styles.greeting, { color: theme.text }]}>
            {`Ol\u00e1, ${userName}!`}
          </Text>
        ) : null}

        {/* Summary Card: Receita vs Gastos */}
        {(monthlySalary ?? 0) > 0 && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Resumo do m{'ê'}s
            </Text>
            <View style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: theme.textSecondary }]}
              >
                Receita
              </Text>
              {renderValue(formatCurrency(monthlySalary ?? 0), [
                styles.summaryValue,
                { color: '#4CAF50' },
              ])}
            </View>
            <View style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: theme.textSecondary }]}
              >
                Gastos
              </Text>
              {renderValue(formatCurrency(totalExpenses), [
                styles.summaryValue,
                { color: theme.error },
              ])}
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: theme.textSecondary }]}
              >
                Saldo restante
              </Text>
              {renderValue(formatCurrency(calculatedBalance), [
                styles.summaryValue,
                { color: theme.text },
              ])}
            </View>
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
        )}

        {/* Meta Diária Card */}
        {(monthlySalary ?? 0) > 0 && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Meta di{'á'}ria
            </Text>
            <Text
              style={[styles.dailyBudgetLabel, { color: theme.textSecondary }]}
            >
              {'Voc\u00ea pode gastar hoje'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              {renderValue(formatCurrency(Math.max(0, dailyBudget)), [
                styles.dailyBudgetValue,
                {
                  color: dailyBudget > 0 ? '#4CAF50' : theme.error,
                },
              ])}
            </View>
            <Text
              style={[styles.daysRemaining, { color: theme.textSecondary }]}
            >
              {daysUntilNextPayment === 1
                ? 'Falta 1 dia para o pr\u00f3ximo sal\u00e1rio'
                : `Faltam ${daysUntilNextPayment} dias para o pr\u00f3ximo sal\u00e1rio`}
            </Text>
          </View>
        )}

        {/* Top Categories */}
        {topCategories.length > 0 && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Este m{'ê'}s
            </Text>
            {topCategories.map((item) => {
              const catInfo = CATEGORIES[item.category] || CATEGORIES.outros;
              const percentage = item.budgetAmount
                ? Math.min((item.total / item.budgetAmount) * 100, 100)
                : null;

              return (
                <View key={item.category} style={styles.categoryRow}>
                  <View style={styles.categoryHeader}>
                    <View style={styles.categoryNameRow}>
                      <View
                        style={[
                          styles.categoryDot,
                          { backgroundColor: catInfo.color },
                        ]}
                      />
                      <Text
                        style={[styles.categoryName, { color: theme.text }]}
                      >
                        {catInfo.name}
                      </Text>
                    </View>
                    {renderValue(formatCurrency(item.total), [
                      styles.categoryAmount,
                      { color: theme.text },
                    ])}
                  </View>
                  {percentage !== null && (
                    <View
                      style={[
                        styles.progressBarBg,
                        { backgroundColor: theme.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            backgroundColor:
                              percentage >= 90
                                ? theme.error
                                : percentage >= 70
                                  ? '#FFD93D'
                                  : catInfo.color,
                            width: `${percentage}%`,
                          },
                        ]}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Link to Financial Overview */}
        <TouchableOpacity
          style={styles.overviewLink}
          onPress={() => {
            if (premiumLoading || isPremium) {
              router.push('/financial-overview');
            } else {
              setShowPaywall(true);
            }
          }}
        >
          <Text style={[styles.overviewLinkText, { color: theme.primary }]}>
            {`Ver an\u00e1lise completa \u2192`}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <SalarySetupModal
        visible={showSalarySetup}
        onConfirm={handleSalarySetup}
        onSkip={handleSkipSetup}
        loading={savingSalary}
      />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={async () => {
          await refreshPremium();
          router.push('/financial-overview');
        }}
        title="An\u00e1lise Financeira"
        subtitle="Acesse sua an\u00e1lise financeira completa"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  salaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  salaryTouchable: {
    paddingVertical: 4,
  },
  salaryText: {
    fontSize: 30,
    fontFamily: 'DMSans-Regular',
  },
  eyeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  profileButtonImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  greeting: {
    fontSize: 18,
    fontFamily: 'DMSans-Medium',
    marginBottom: 20,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  balanceSourceText: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 6,
  },
  dailyBudgetLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginBottom: 4,
  },
  dailyBudgetValue: {
    fontSize: 28,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  daysRemaining: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
  },
  categoryRow: {
    marginBottom: 14,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  categoryAmount: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  overviewLink: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
  },
  overviewLinkText: {
    fontSize: 15,
    fontFamily: 'DMSans-Medium',
  },
});
