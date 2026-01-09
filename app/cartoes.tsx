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
import { router, useFocusEffect } from 'expo-router';
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

export default function CartoesScreen() {
  const { theme, isDark } = useTheme();
  const [invoices, setInvoices] = useState<CreditCardInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [availableMonths, setAvailableMonths] = useState<Date[]>([]);
  const monthScrollRef = useRef<ScrollView>(null);

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
  }, [selectedMonth]);

  const loadCardExpenses = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar contas de cartão de crédito do Open Finance
      const { data: creditAccounts } = await supabase
        .from('pluggy_accounts')
        .select('id, name, type')
        .eq('user_id', user.id)
        .eq('type', 'CREDIT');

      if (!creditAccounts || creditAccounts.length === 0) {
        setInvoices([]);
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

      const selectedMonthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;

      // Para cada cartão, buscar transações do mês selecionado
      const allInvoices: CreditCardInvoice[] = [];

      for (const account of creditAccounts) {
        // Buscar transações do mês selecionado
        const { data: transactions } = await supabase
          .from('pluggy_transactions')
          .select('id, amount, date, type')
          .eq('account_id', account.id)
          .gte('date', startOfMonth.toISOString().split('T')[0])
          .lte('date', endOfMonth.toISOString().split('T')[0])
          .order('date', { ascending: false });

        if (transactions && transactions.length > 0) {
          // Separar compras (CREDIT) e pagamentos (DEBIT)
          let compras = 0;
          let pagamentos = 0;
          let transactionCount = 0;

          transactions.forEach((tx) => {
            const amount = Math.abs(tx.amount);

            if (tx.type === 'CREDIT') {
              // Compras no cartão (aumentam a fatura)
              compras += amount;
              transactionCount++;
            } else if (tx.type === 'DEBIT') {
              // Pagamentos da fatura (diminuem o saldo devedor)
              pagamentos += amount;
            }
          });

          // Total da fatura = Compras - Pagamentos
          const monthTotal = compras - pagamentos;

          // Só adicionar se houver saldo devedor ou compras
          if (compras > 0) {
            allInvoices.push({
              accountId: account.id,
              accountName: account.name,
              month: selectedMonthKey,
              total: Math.max(0, monthTotal), // Garantir que não fique negativo
              transactionCount,
            });
          }
        }
      }

      setInvoices(allInvoices);
    } catch (error) {
      console.error('Erro ao carregar faturas de cartões:', error);
    } finally {
      setLoading(false);
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
        <Text style={[styles.title, { color: theme.text }]}>
          Cartões de Crédito
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
                  {month.toLocaleDateString('pt-BR', { month: 'short' })}
                </Text>
                <Text
                  style={[
                    styles.monthButtonYear,
                    {
                      color: isSelected
                        ? theme.background
                        : theme.textSecondary,
                    },
                  ]}
                >
                  {month.getFullYear()}
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
              Nenhuma fatura de cartão de crédito encontrada
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              Conecte seus cartões via Open Finance para visualizar as faturas
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
                Total em Faturas
              </Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>
                {formatCurrency(totalCards)}
              </Text>
            </View>

            {/* Faturas por Cartão e Mês */}
            {invoices.map((invoice, index) => (
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
                onPress={() => {
                  // TODO: Navegar para página de detalhes da fatura
                  console.log('Ver detalhes da fatura:', invoice);
                }}
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
              </TouchableOpacity>
            ))}
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
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
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
    gap: 12,
    paddingRight: 24,
  },
  monthButton: {
    width: 76,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  monthButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    textTransform: 'capitalize',
  },
  monthButtonYear: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 2,
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
});
