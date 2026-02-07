import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { useTheme } from '@/lib/theme';
import { syncTransactions } from '@/lib/pluggy';

type Transaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: 'DEBIT' | 'CREDIT';
};

export default function FaturasScreen() {
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams();
  const accountId = params.accountId as string;
  const accountName = params.accountName as string;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [availableMonths, setAvailableMonths] = useState<Date[]>([]);
  const monthScrollRef = useRef<ScrollView>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [isCurrentMonth, setIsCurrentMonth] = useState(true);

  useEffect(() => {
    const generateMonths = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', user.id)
          .maybeSingle();

        const today = new Date();
        let startDate: Date;

        if (profile?.created_at) {
          const createdAt = new Date(profile.created_at);
          startDate = new Date(
            createdAt.getFullYear(),
            createdAt.getMonth(),
            1
          );
        } else {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }

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
        setAvailableMonths([new Date()]);
      }
    };

    generateMonths();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSelectedMonth(new Date());

      if (availableMonths.length > 0) {
        const currentMonthIndex = availableMonths.findIndex(
          (month) =>
            month.getMonth() === new Date().getMonth() &&
            month.getFullYear() === new Date().getFullYear()
        );
        if (currentMonthIndex !== -1 && monthScrollRef.current) {
          setTimeout(() => {
            monthScrollRef.current?.scrollTo({
              x: currentMonthIndex * 88,
              animated: false,
            });
          }, 300);
        }
      }
    }, [availableMonths])
  );

  useEffect(() => {
    loadCardData();
  }, [selectedMonth, accountId]);

  const loadCardData = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar dados do cartão
      const { data: creditAccount } = await supabase
        .from('pluggy_accounts')
        .select('id, name, type, credit_limit, available_credit_limit')
        .eq('user_id', user.id)
        .eq('id', accountId)
        .eq('type', 'CREDIT')
        .single();

      if (!creditAccount) {
        setCurrentBalance(0);
        setTransactions([]);
        setLoading(false);
        return;
      }

      // Calcular range do mês selecionado
      const startOfMonth = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth(),
        1
      );
      const endOfMonth = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth() + 1,
        0,
        23,
        59,
        59
      );

      // Buscar transações do mês
      const { data: txData } = await supabase
        .from('pluggy_transactions')
        .select('id, description, amount, date, type')
        .eq('account_id', accountId)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false });

      const monthTransactions = (txData as Transaction[]) || [];
      setTransactions(monthTransactions);

      // Verificar se é o mês atual
      const now = new Date();
      const currentMonth =
        selectedMonth.getMonth() === now.getMonth() &&
        selectedMonth.getFullYear() === now.getFullYear();
      setIsCurrentMonth(currentMonth);

      if (currentMonth) {
        // Mês atual: saldo devedor real do cartão
        const usedCredit =
          (creditAccount.credit_limit || 0) -
          (creditAccount.available_credit_limit || 0);
        setCurrentBalance(usedCredit);
      } else {
        // Meses anteriores: total da fatura (soma apenas compras/DEBITs)
        const monthTotal = monthTransactions
          .filter((tx) => tx.type === 'DEBIT')
          .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        setCurrentBalance(monthTotal);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do cartão:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCardData();
  };

  const handleSyncTransactions = async () => {
    if (syncing) return;

    setSyncing(true);
    try {
      // Sincronizar transações do mês corrente
      const now = new Date();
      const to = now.toISOString().split('T')[0];
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      console.log('[faturas] Syncing transactions for account:', accountId);
      console.log('[faturas] Date range:', { from, to });

      const result = await syncTransactions(accountId, { from, to });
      console.log('[faturas] Sync result:', result);

      if (result.saved > 0) {
        Alert.alert(
          'Sucesso',
          `${result.saved} transação(ões) sincronizada(s)!`
        );
      } else if (result.total > 0 && result.skipped === result.total) {
        Alert.alert(
          'Atualizado',
          'Todas as transações já estavam sincronizadas.'
        );
      } else {
        Alert.alert(
          'Sem Transações',
          'Nenhuma transação encontrada para este período.'
        );
      }

      // Recarregar dados
      loadCardData();
    } catch (error) {
      console.error('[faturas] Error syncing transactions:', error);
      Alert.alert(
        'Erro',
        'Não foi possível sincronizar as transações. Tente novamente.'
      );
    } finally {
      setSyncing(false);
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
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {accountName}
        </Text>
        <TouchableOpacity
          style={[
            styles.syncButton,
            {
              backgroundColor: isDark ? theme.card : theme.primary,
              borderColor: isDark ? theme.cardBorder : theme.primary,
            },
            syncing && styles.syncButtonDisabled,
          ]}
          onPress={handleSyncTransactions}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator
              size="small"
              color={isDark ? theme.text : '#fff'}
            />
          ) : (
            <Text
              style={[
                styles.syncButtonText,
                { color: isDark ? theme.text : '#fff' },
              ]}
            >
              Sincronizar
            </Text>
          )}
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Seletor de Mês */}
        <ScrollView
          ref={monthScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.monthSelector}
          contentContainerStyle={styles.monthSelectorContent}
        >
          {availableMonths.map((month, index) => {
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
                key={index}
                style={[
                  styles.monthButton,
                  {
                    backgroundColor: isSelected ? theme.primary : theme.card,
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

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <View style={styles.mainContainer}>
            {/* Card Saldo Devedor Atual */}
            <View
              style={[
                styles.balanceCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(isDark),
              ]}
            >
              <Text
                style={[styles.balanceLabel, { color: theme.textSecondary }]}
              >
                {isCurrentMonth ? 'Saldo Devedor Atual' : 'Total da Fatura'}
              </Text>
              <Text
                style={[
                  styles.balanceValue,
                  { color: currentBalance > 0 ? '#ef4444' : '#10b981' },
                ]}
              >
                {formatCurrency(currentBalance)}
              </Text>
              <Text
                style={[styles.balanceHint, { color: theme.textSecondary }]}
              >
                {isCurrentMonth
                  ? currentBalance > 0
                    ? 'Valor total a pagar no cartao'
                    : 'Nenhuma divida no cartao'
                  : currentBalance > 0
                    ? 'Total gasto neste mes'
                    : 'Nenhum gasto neste mes'}
              </Text>
            </View>

            {/* Lista de Transações do Mês */}
            {transactions.length > 0 ? (
              <View
                style={[
                  styles.transactionsCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
              >
                <Text
                  style={[
                    styles.transactionsTitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Transacoes do Mes
                </Text>
                {transactions.map((tx) => (
                  <View key={tx.id} style={styles.transactionRow}>
                    <View style={styles.transactionLeft}>
                      <Text
                        style={[
                          styles.transactionDescription,
                          { color: theme.text },
                        ]}
                      >
                        {tx.description}
                      </Text>
                      <Text
                        style={[
                          styles.transactionDate,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {new Date(tx.date).toLocaleDateString('pt-BR')}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.transactionAmount,
                        {
                          color: tx.type === 'CREDIT' ? '#10b981' : theme.text,
                        },
                      ]}
                    >
                      {tx.type === 'CREDIT' ? '+' : '-'}
                      {formatCurrency(Math.abs(tx.amount))}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  Nenhuma transacao neste mes
                </Text>
              </View>
            )}
          </View>
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
    flex: 1,
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  monthSelector: {
    marginTop: 16,
    marginBottom: 16,
    paddingLeft: 24,
  },
  monthSelectorContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 24,
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
    fontFamily: 'DMSans-SemiBold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  mainContainer: {
    padding: 24,
  },
  balanceCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 28,
    fontFamily: 'DMSans-Bold',
  },
  balanceHint: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 8,
  },
  transactionsCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
  },
  transactionsTitle: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 16,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  transactionLeft: {
    flex: 1,
    marginRight: 12,
  },
  transactionDescription: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  transactionAmount: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
  syncButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 100,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
});
