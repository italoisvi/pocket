import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { SettingsIcon } from '@/components/SettingsIcon';
import { CardBrandIcon } from '@/lib/cardBrand';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';

type Debt = {
  id: string;
  accountName: string;
  type: 'CREDIT_CARD' | 'BILL';
  amount: number;
  dueDate: string;
  status: 'OVERDUE' | 'DUE_SOON';
  daysOverdue?: number;
};

export default function DividasScreen() {
  const { theme } = useTheme();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalDebt, setTotalDebt] = useState(0);

  useEffect(() => {
    loadDebts();
  }, []);

  const loadDebts = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar contas de cartão de crédito do Open Finance
      const { data: creditAccounts } = await supabase
        .from('pluggy_accounts')
        .select('id, name, balance, credit_limit, available_credit_limit')
        .eq('user_id', user.id)
        .eq('type', 'CREDIT');

      const detectedDebts: Debt[] = [];

      // Analisar cartões de crédito
      if (creditAccounts) {
        creditAccounts.forEach((account) => {
          // Se o saldo é negativo e próximo ou acima do limite, pode haver dívida
          if (
            account.credit_limit &&
            account.available_credit_limit !== null &&
            account.available_credit_limit < account.credit_limit * 0.1
          ) {
            const usedCredit =
              account.credit_limit - account.available_credit_limit;

            // Considerar como dívida se usou mais de 90% do limite
            if (usedCredit > account.credit_limit * 0.9) {
              detectedDebts.push({
                id: account.id,
                accountName: account.name,
                type: 'CREDIT_CARD',
                amount: usedCredit,
                dueDate: new Date().toISOString().split('T')[0], // Simplificado
                status: 'DUE_SOON',
              });
            }
          }
        });
      }

      // Buscar transações pendentes que podem ser boletos
      const { data: pendingTransactions } = await supabase
        .from('pluggy_transactions')
        .select('id, description, amount, date, status')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .eq('type', 'DEBIT')
        .lt('date', new Date().toISOString().split('T')[0]);

      if (pendingTransactions) {
        pendingTransactions.forEach((tx) => {
          const dueDate = new Date(tx.date);
          const today = new Date();
          const daysOverdue = Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysOverdue > 0) {
            detectedDebts.push({
              id: tx.id,
              accountName: tx.description,
              type: 'BILL',
              amount: Math.abs(tx.amount),
              dueDate: tx.date,
              status: 'OVERDUE',
              daysOverdue,
            });
          }
        });
      }

      setDebts(detectedDebts);
      setTotalDebt(detectedDebts.reduce((sum, debt) => sum + debt.amount, 0));
    } catch (error) {
      console.error('Error loading debts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDebts();
  };

  const renderDebtCard = (debt: Debt) => {
    const isOverdue = debt.status === 'OVERDUE';

    return (
      <View
        key={debt.id}
        style={[
          styles.debtCard,
          {
            backgroundColor: theme.card,
            borderColor: isOverdue ? '#f87171' : theme.cardBorder,
            borderLeftWidth: 4,
            borderLeftColor: isOverdue ? '#f87171' : '#fb923c',
          },
        ]}
      >
        <View style={styles.cardTop}>
          {isOverdue && debt.daysOverdue && (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueText}>
                {debt.daysOverdue} {debt.daysOverdue === 1 ? 'dia' : 'dias'}{' '}
                atrasado
              </Text>
            </View>
          )}
        </View>

        <View style={styles.debtHeader}>
          {debt.type === 'CREDIT_CARD' && (
            <View style={styles.cardIconContainer}>
              <CardBrandIcon cardName={debt.accountName} size={48} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.debtType, { color: theme.textSecondary }]}>
              {debt.type === 'CREDIT_CARD'
                ? 'Cartão de Crédito'
                : 'Boleto/Débito'}
            </Text>
            <Text style={[styles.debtName, { color: theme.text }]}>
              {debt.accountName}
            </Text>
          </View>
        </View>

        <View style={styles.debtFooter}>
          <View>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
              Valor
            </Text>
            <Text style={[styles.amountValue, { color: '#f87171' }]}>
              {formatCurrency(debt.amount)}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.dateLabel, { color: theme.textSecondary }]}>
              Vencimento
            </Text>
            <Text style={[styles.dateValue, { color: theme.text }]}>
              {new Date(debt.dueDate).toLocaleDateString('pt-BR')}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Dívidas</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/dividas-settings')}
        >
          <SettingsIcon size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Total */}
      {!loading && totalDebt > 0 && (
        <View
          style={[
            styles.totalCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
            Total em Dívidas
          </Text>
          <Text style={[styles.totalValue, { color: '#f87171' }]}>
            {formatCurrency(totalDebt)}
          </Text>
        </View>
      )}

      {/* Lista de dívidas */}
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
        {loading ? (
          <ActivityIndicator
            size="large"
            color={theme.primary}
            style={styles.loader}
          />
        ) : debts.length > 0 ? (
          debts.map((debt) => renderDebtCard(debt))
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma dívida detectada
            </Text>
            <Text
              style={[styles.emptyDescription, { color: theme.textSecondary }]}
            >
              Suas contas estão em dia! Continue assim.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
    padding: 4,
  },
  settingsButton: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  totalCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 40,
  },
  debtCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  debtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIconContainer: {
    marginRight: 12,
  },
  debtType: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  overdueBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  overdueText: {
    fontSize: 11,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#dc2626',
  },
  debtName: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
  },
  debtFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  amountLabel: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  dateLabel: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
