import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Text,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { SettingsIcon } from '@/components/SettingsIcon';
import { UsuarioIcon } from '@/components/UsuarioIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { ChevronDownIcon } from '@/components/ChevronDownIcon';
import { EyeIcon } from '@/components/EyeIcon';
import { EyeOffIcon } from '@/components/EyeOffIcon';
import { ExpenseCard } from '@/components/ExpenseCard';
import { SalarySetupModal } from '@/components/SalarySetupModal';
import { PaywallModal } from '@/components/PaywallModal';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/lib/theme';
import { getCardShadowStyle } from '@/lib/cardStyles';
import {
  calculateTotalBalance,
  type BalanceSource,
} from '@/lib/calculateBalance';
import { usePremium } from '@/lib/usePremium';

type Expense = {
  id: string;
  establishment_name: string;
  amount: number;
  date: string;
  created_at: string;
  category: string;
  subcategory?: string;
};

type IncomeCard = {
  id: string;
  salary: string;
  paymentDay: string;
  incomeSource: string;
  linkedAccountId?: string;
  lastKnownBalance?: number;
};

export default function HomeScreen() {
  const { theme } = useTheme();
  const {
    isPremium,
    loading: premiumLoading,
    refresh: refreshPremium,
  } = usePremium();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSalarySetup, setShowSalarySetup] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState<number | null>(null);
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return new Set([currentMonthKey]);
  });
  const [calculatedBalance, setCalculatedBalance] = useState<number>(0);
  const [balanceSource, setBalanceSource] = useState<BalanceSource>('manual');
  const [incomeCards, setIncomeCards] = useState<IncomeCard[]>([]);

  useEffect(() => {
    loadProfile();
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[Home] ========================================');
      console.log('[Home] Screen focused, reloading data...');
      console.log('[Home] Timestamp:', new Date().toISOString());
      loadExpenses();
      loadProfile();
    }, [])
  );

  const loadProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('monthly_salary, avatar_url, income_cards')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar perfil:', error);
        return;
      }

      // Calcular total de rendas
      let totalIncome = 0;
      let cards: IncomeCard[] = [];

      // Verificar se há income_cards (novo sistema)
      if (data?.income_cards && Array.isArray(data.income_cards)) {
        cards = data.income_cards as IncomeCard[];
        setIncomeCards(cards);

        totalIncome = cards.reduce((sum, card) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);
      } else if (data?.monthly_salary) {
        // Só usar monthly_salary se income_cards não existir (sistema antigo)
        totalIncome = data.monthly_salary;
      }

      // Sempre definir a renda (mesmo que seja 0)
      setMonthlySalary(totalIncome);

      // Buscar saldos das contas vinculadas (para cálculo inteligente)
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

        if (linkedAccounts) {
          accountBalances = linkedAccounts;
          // Usar a sincronização mais recente entre todas as contas vinculadas
          const syncDates = linkedAccounts
            .map((acc: any) => acc.last_sync_at)
            .filter(Boolean);
          if (syncDates.length > 0) {
            lastSyncAt = syncDates.sort().pop() || null;
          }
        }
      }

      // Buscar total de gastos do MÊS ATUAL para cálculo do saldo
      // Usar timezone do Brasil (UTC-3) para evitar problemas de fuso horário
      const now = new Date();
      const brazilOffset = -3 * 60; // -180 minutos
      const brazilNow = new Date(now.getTime() + brazilOffset * 60 * 1000);

      const year = brazilNow.getFullYear();
      const month = brazilNow.getMonth();
      const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data: expensesData, error: expError } = await supabase
        .from('expenses')
        .select('amount, created_at')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      console.log('[Home] Expenses query:', {
        startDateStr,
        endDateStr,
        expensesCount: expensesData?.length,
        lastSyncAt,
        error: expError,
      });

      const totalExpenses = expensesData
        ? expensesData.reduce(
            (sum, exp) =>
              sum +
              (typeof exp.amount === 'string'
                ? parseFloat(exp.amount)
                : exp.amount),
            0
          )
        : 0;

      // Calcular gastos RECENTES (criados DEPOIS da última sincronização do Open Finance)
      // Esses gastos ainda não estão refletidos no saldo do banco
      let recentExpenses = 0;
      if (expensesData) {
        // Se tiver data de sincronização, usa ela; senão, considera gastos das últimas 24h como recentes
        const cutoffDate = lastSyncAt
          ? new Date(lastSyncAt)
          : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas atrás

        recentExpenses = expensesData
          .filter((exp) => new Date(exp.created_at) > cutoffDate)
          .reduce(
            (sum, exp) =>
              sum +
              (typeof exp.amount === 'string'
                ? parseFloat(exp.amount)
                : exp.amount),
            0
          );
      }

      console.log('[Home] Balance calculation:', {
        totalIncome,
        totalExpenses,
        recentExpenses,
        lastSyncAt,
        cardsCount: cards.length,
        accountBalancesCount: accountBalances.length,
      });

      // Calcular saldo usando lógica inteligente
      const balanceResult = calculateTotalBalance(
        cards,
        accountBalances,
        totalExpenses,
        recentExpenses
      );

      console.log('[Home] Balance result:', balanceResult);

      setCalculatedBalance(balanceResult.remainingBalance);
      setBalanceSource(balanceResult.source);

      // Carregar avatar
      console.log('[Home] Avatar URL from database:', data?.avatar_url);
      if (data?.avatar_url) {
        console.log('[Home] Setting profile image:', data.avatar_url);
        setProfileImage(data.avatar_url);
      } else {
        console.log('[Home] No avatar_url found');
      }

      // Mostrar modal de setup se não tem nenhuma renda configurada
      if (
        totalIncome === 0 &&
        (!data?.income_cards || data.income_cards.length === 0)
      ) {
        // Verificar se já mostrou o modal antes
        const hasShownSetup = await AsyncStorage.getItem(
          `salary_setup_shown_${user.id}`
        );
        // Só mostrar modal se ainda não mostrou antes
        if (!hasShownSetup) {
          setShowSalarySetup(true);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    }
  };

  const loadExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(
          'id, establishment_name, amount, date, created_at, category, subcategory'
        )
        .order('created_at', { ascending: false });

      console.log('[Home] All expenses:', data);
      console.log('[Home] Expenses count:', data?.length);

      if (error) throw error;

      setExpenses(data || []);
    } catch (error) {
      console.error('Erro ao carregar gastos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSalarySetup = async (salary: number, paymentDay: number) => {
    setSavingSalary(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      // Criar primeiro income card
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

      // Marcar como já configurado
      await AsyncStorage.setItem(`salary_setup_shown_${user.id}`, 'true');

      setMonthlySalary(salary);
      setShowSalarySetup(false);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a renda mensal.');
      console.error('Erro ao salvar renda mensal:', error);
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
        // Marcar como já mostrado para não aparecer novamente
        await AsyncStorage.setItem(`salary_setup_shown_${user.id}`, 'true');
      }

      setShowSalarySetup(false);
    } catch (error) {
      console.error('Erro ao pular setup:', error);
      setShowSalarySetup(false);
    }
  };

  const maskValue = (value: number) => {
    // Formatar o valor para obter a string formatada
    const formatted = formatCurrency(value);
    // Substituir todos os dígitos por asteriscos, mantendo pontos e vírgulas
    return formatted.replace(/\d/g, '*');
  };

  const handleExpensePress = (id: string) => {
    router.push(`/expense/${id}`);
  };

  const handleSettingsPress = () => {
    router.push('/(tabs)/settings');
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  };

  const groupExpensesByMonth = () => {
    const grouped: { [key: string]: Expense[] } = {};

    expenses.forEach((expense) => {
      // Extrair ano e mês diretamente da string da data (formato YYYY-MM-DD)
      // Isso evita problemas de timezone que ocorriam ao usar new Date()
      const dateParts = expense.date.split('-');
      const monthKey = `${dateParts[0]}-${dateParts[1]}`;
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(expense);
    });

    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  };

  const getMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[styles.topBar, { backgroundColor: theme.background }]}
      >
        <View style={styles.salaryContainer}>
          <TouchableOpacity
            style={styles.salaryTouchable}
            onPress={() => {
              if (isPremium) {
                router.push('/financial-overview');
              } else {
                setShowPaywall(true);
              }
            }}
          >
            <Text style={[styles.salaryText, { color: theme.text }]}>
              {salaryVisible
                ? formatCurrency(calculatedBalance)
                : maskValue(calculatedBalance)}
            </Text>
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
            getCardShadowStyle(theme.background === '#000'),
          ]}
          onPress={() => router.push('/perfil')}
        >
          {profileImage ? (
            <Image
              source={{ uri: profileImage }}
              style={styles.profileButtonImage}
              onError={(error) => {
                console.error('[Home] Image load error:', error.nativeEvent);
                setProfileImage(null);
              }}
              onLoad={() => {
                console.log('[Home] Image loaded successfully!');
              }}
            />
          ) : (
            <UsuarioIcon size={24} color={theme.text} />
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.text }]}>
            Nenhum gasto registrado ainda.
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Clique no botão da câmera para começar!
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupExpensesByMonth()}
          keyExtractor={([monthKey]) => monthKey}
          renderItem={({ item: [monthKey, monthExpenses] }) => {
            const isExpanded = expandedMonths.has(monthKey);
            const monthName = getMonthName(monthKey);
            const capitalizedMonth =
              monthName.charAt(0).toUpperCase() + monthName.slice(1);

            return (
              <View key={monthKey}>
                <TouchableOpacity
                  style={styles.monthHeader}
                  onPress={() => toggleMonth(monthKey)}
                >
                  <Text style={[styles.monthTitle, { color: theme.text }]}>
                    {capitalizedMonth}
                  </Text>
                  {isExpanded ? (
                    <ChevronDownIcon size={20} color={theme.textSecondary} />
                  ) : (
                    <ChevronRightIcon size={20} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>

                {isExpanded &&
                  monthExpenses.map((expense) => (
                    <View key={expense.id} style={styles.cardWrapper}>
                      <ExpenseCard
                        id={expense.id}
                        establishmentName={expense.establishment_name}
                        amount={expense.amount}
                        date={expense.date}
                        category={expense.category}
                        subcategory={expense.subcategory}
                        onPress={() => handleExpensePress(expense.id)}
                      />
                    </View>
                  ))}
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      <SalarySetupModal
        visible={showSalarySetup}
        onConfirm={handleSalarySetup}
        onSkip={handleSkipSetup}
        loading={savingSalary}
      />

      {/* Paywall Modal */}
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={async () => {
          await refreshPremium();
          router.push('/financial-overview');
        }}
        title="Raio-X Financeiro Premium"
        subtitle="Análises detalhadas e insights sobre suas finanças"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 8,
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
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Regular',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyText: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 130,
    paddingBottom: 100,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  monthTitle: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cardWrapper: {
    marginBottom: 8,
  },
});
