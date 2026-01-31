import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Text,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  type BalanceSource,
} from '@/lib/calculateBalance';
import { usePremium } from '@/lib/usePremium';
import { useFeed } from '@/hooks/useFeed';
import type { FeedItem } from '@/types/feed';

// Importar todos os cards do feed
import { StockQuoteCard } from '@/components/feed/StockQuoteCard';
import { IndexCard } from '@/components/feed/IndexCard';
import { CryptoCard } from '@/components/feed/CryptoCard';
import { NewsCard } from '@/components/feed/NewsCard';
import { IndicatorCard } from '@/components/feed/IndicatorCard';
import { InsightCard } from '@/components/feed/InsightCard';
import { CurrencyCard } from '@/components/feed/CurrencyCard';

type IncomeCard = {
  id: string;
  salary: string;
  paymentDay: string;
  incomeSource: string;
  linkedAccountId?: string;
  lastKnownBalance?: number;
};

export default function HomeScreen() {
  const { theme, isDark } = useTheme();
  const {
    isPremium,
    loading: premiumLoading,
    refresh: refreshPremium,
  } = usePremium();

  // Feed state
  const {
    items: feedItems,
    loading: feedLoading,
    refreshing: feedRefreshing,
    error: feedError,
    refresh: refreshFeed,
  } = useFeed();

  // Header state (mantido da home antiga)
  const [showSalarySetup, setShowSalarySetup] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState<number | null>(null);
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [calculatedBalance, setCalculatedBalance] = useState<number>(0);
  const [balanceSource, setBalanceSource] = useState<BalanceSource>('manual');
  const [incomeCards, setIncomeCards] = useState<IncomeCard[]>([]);

  // Ref para o FlatList
  const flatListRef = useRef<FlatList>(null);
  const previousItemsLength = useRef(0);

  useEffect(() => {
    loadProfile();
  }, []);

  // Rolar para o topo quando novos itens chegarem
  useEffect(() => {
    if (
      feedItems.length > 0 &&
      feedItems.length !== previousItemsLength.current &&
      !feedLoading
    ) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      previousItemsLength.current = feedItems.length;
    }
  }, [feedItems, feedLoading]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Home] Screen focused, reloading profile...');
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
        totalIncome = data.monthly_salary;
      }

      setMonthlySalary(totalIncome);

      // Buscar saldos das contas vinculadas
      const linkedAccountIds = cards
        .filter((card) => card.linkedAccountId)
        .map((card) => card.linkedAccountId as string);

      let accountBalances: { id: string; balance: number | null }[] = [];
      let lastSyncAt: string | null = null;

      if (linkedAccountIds.length > 0) {
        const { data: linkedAccounts, error: accountsError } = await supabase
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

      // Buscar gastos do mês atual
      const now = new Date();
      const brazilOffset = -3 * 60;
      const brazilNow = new Date(now.getTime() + brazilOffset * 60 * 1000);

      const year = brazilNow.getFullYear();
      const month = brazilNow.getMonth();
      const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data: allExpensesData, error: expError } = await supabase
        .from('expenses')
        .select('amount, created_at, source, is_cash')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      const manualExpenses = (allExpensesData || []).filter(
        (exp) => !exp.source || exp.source === 'manual'
      );

      const totalExpenses = manualExpenses.reduce(
        (sum, exp) =>
          sum +
          (typeof exp.amount === 'string'
            ? parseFloat(exp.amount)
            : exp.amount),
        0
      );

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
        totalExpenses,
        recentExpenses
      );

      setCalculatedBalance(balanceResult.remainingBalance);
      setBalanceSource(balanceResult.source);

      if (data?.avatar_url) {
        setProfileImage(data.avatar_url);
      }

      // Mostrar modal de setup se necessário
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
        await AsyncStorage.setItem(`salary_setup_shown_${user.id}`, 'true');
      }

      setShowSalarySetup(false);
    } catch (error) {
      console.error('Erro ao pular setup:', error);
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

  const renderFeedItem = useCallback(({ item }: { item: FeedItem }) => {
    switch (item.type) {
      case 'stock_quote':
        return <StockQuoteCard quote={item.data as any} />;
      case 'index_quote':
        return <IndexCard index={item.data as any} />;
      case 'crypto_quote':
        return <CryptoCard crypto={item.data as any} />;
      case 'news':
        return <NewsCard news={item.data as any} />;
      case 'economic_indicator':
        return <IndicatorCard indicator={item.data as any} />;
      case 'insight':
        return <InsightCard insight={item.data as any} />;
      case 'currency':
        return <CurrencyCard currency={item.data as any} />;
      default:
        return null;
    }
  }, []);


  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <SafeAreaView
        edges={['top']}
        style={[styles.topBar, { backgroundColor: theme.background }]}
      >
        <View style={styles.headerContent}>
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
                onError={(error) => {
                  console.error('[Home] Image load error:', error.nativeEvent);
                  setProfileImage(null);
                }}
              />
            ) : (
              <UsuarioIcon size={24} color={theme.text} />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Feed Content */}
      {feedLoading && !feedRefreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f7c359" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Carregando notícias...
          </Text>
        </View>
      ) : feedError ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>
            {feedError}
          </Text>
          <TouchableOpacity onPress={refreshFeed} style={styles.retryButton}>
            <Text style={[styles.retryText, { color: theme.primary }]}>
              Tentar novamente
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={feedItems}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedItem}
          contentContainerStyle={styles.feedContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Nenhuma notícia disponível
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={feedRefreshing}
              onRefresh={refreshFeed}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
        />
      )}

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
        title="Feed Premium"
        subtitle="Acesse insights personalizados e alertas de mercado"
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
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  feedContent: {
    paddingTop: 120,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'DMSans-Medium',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
});
