import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { useTheme } from '@/lib/theme';

type CreditCardInvoice = {
  accountId: string;
  accountName: string;
  month: string; // YYYY-MM
  total: number;
  transactionCount: number;
};

export default function FaturasScreen() {
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams();
  const accountId = params.accountId as string;
  const accountName = params.accountName as string;

  const [invoices, setInvoices] = useState<CreditCardInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [availableMonths, setAvailableMonths] = useState<Date[]>([]);
  const monthScrollRef = useRef<ScrollView>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    // Gerar últimos 12 meses
    const months: Date[] = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(date);
    }
    setAvailableMonths(months);
  }, []);

  useFocusEffect(
    useCallback(() => {
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
    loadCardExpenses();
    loadTransactions();
  }, [selectedMonth, accountId]);

  const loadCardExpenses = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar apenas o cartão específico
      const { data: creditAccount } = await supabase
        .from('pluggy_accounts')
        .select('id, name, type, credit_limit, available_credit_limit')
        .eq('user_id', user.id)
        .eq('id', accountId)
        .eq('type', 'CREDIT')
        .single();

      if (!creditAccount) {
        setInvoices([]);
        setLoading(false);
        return;
      }

      // Calcular o saldo devedor total do cartão (igual à lista de cartões)
      const usedCredit =
        creditAccount.credit_limit - creditAccount.available_credit_limit;

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

      const selectedMonthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;

      // Buscar transações do mês selecionado para contar
      const { data: transactions } = await supabase
        .from('pluggy_transactions')
        .select('id, amount, date, type')
        .eq('account_id', creditAccount.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])
        .eq('type', 'CREDIT') // Apenas compras para contar transações
        .order('date', { ascending: false });

      const allInvoices: CreditCardInvoice[] = [];

      // Se houver saldo devedor, criar a fatura
      if (usedCredit > 0) {
        allInvoices.push({
          accountId: creditAccount.id,
          accountName: creditAccount.name,
          month: selectedMonthKey,
          total: usedCredit, // Saldo devedor total do cartão
          transactionCount: transactions?.length || 0, // Número de compras no mês
        });
      }

      setInvoices(allInvoices);
    } catch (error) {
      console.error('Erro ao carregar faturas de cartões:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

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

      // Buscar transações do mês selecionado
      const { data: txData } = await supabase
        .from('pluggy_transactions')
        .select('*')
        .eq('account_id', accountId)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false });

      setTransactions(txData || []);
    } catch (error) {
      console.error('Erro ao carregar transações:', error);
    }
  };

  const formatMonthYear = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const totalCards = invoices.reduce((sum, item) => sum + item.total, 0);

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
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
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
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : invoices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Nenhuma fatura encontrada
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              Não foram encontradas transações para este mês
            </Text>
          </View>
        ) : (
          <View style={styles.invoicesContainer}>
            {/* Card Total */}
            <View
              style={[
                styles.totalCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(isDark),
              ]}
            >
              <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                Total da Fatura
              </Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>
                {formatCurrency(totalCards)}
              </Text>
            </View>

            {/* Faturas */}
            {invoices.map((invoice, index) => {
              const invoiceKey = `${invoice.accountId}-${invoice.month}`;
              const isExpanded = expandedInvoice === invoiceKey;

              return (
                <TouchableOpacity
                  key={`${invoice.accountId}-${invoice.month}-${index}`}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.cardBorder,
                    },
                    getCardShadowStyle(isDark),
                  ]}
                  onPress={() =>
                    setExpandedInvoice(isExpanded ? null : invoiceKey)
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.cardLeft}>
                      <View
                        style={[
                          styles.bankIndicator,
                          { backgroundColor: '#f59e0b' },
                        ]}
                      />
                      <View>
                        <Text style={[styles.bankName, { color: theme.text }]}>
                          {invoice.accountName}
                        </Text>
                        <Text
                          style={[
                            styles.monthText,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {formatMonthYear(invoice.month)} •{' '}
                          {invoice.transactionCount}{' '}
                          {invoice.transactionCount === 1
                            ? 'transação'
                            : 'transações'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.cardValue, { color: theme.text }]}>
                      {formatCurrency(invoice.total)}
                    </Text>
                  </View>

                  {/* Detalhes expandidos */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: theme.cardBorder },
                        ]}
                      />
                      {transactions.length > 0 ? (
                        transactions.map((tx) => (
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
                                  color:
                                    tx.type === 'DEBIT'
                                      ? '#10b981'
                                      : theme.text,
                                },
                              ]}
                            >
                              {tx.type === 'DEBIT' ? '+' : ''}
                              {formatCurrency(Math.abs(tx.amount))}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text
                          style={[
                            styles.noTransactions,
                            { color: theme.textSecondary },
                          ]}
                        >
                          Nenhuma transação encontrada neste mês
                        </Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
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
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
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
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  invoicesContainer: {
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
  },
  totalCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Bold',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  bankIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  bankName: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  monthText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  cardValue: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  expandedContent: {
    marginTop: 16,
  },
  divider: {
    height: 1,
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
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
  },
  transactionAmount: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  noTransactions: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
