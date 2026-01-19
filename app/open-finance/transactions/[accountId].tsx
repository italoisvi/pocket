import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { SetaParaBaixoIcon } from '@/components/SetaParaBaixoIcon';
import { SetaParaCimaIcon } from '@/components/SetaParaCimaIcon';
import { BoletoIcon } from '@/components/BoletoIcon';
import { getTransactionsByAccount } from '@/lib/pluggy';

type PluggyTransaction = {
  id: string;
  pluggy_transaction_id: string;
  description: string;
  description_raw: string | null;
  amount: number;
  date: string;
  status: 'PENDING' | 'POSTED';
  type: 'DEBIT' | 'CREDIT';
  category: string | null;
  synced: boolean;
  created_at: string;
};

export default function TransactionsScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();

  const accountId = params.accountId as string;
  const accountName = params.accountName as string;

  const [transactions, setTransactions] = useState<PluggyTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      const data = await getTransactionsByAccount(accountId, {
        limit: 100,
      });
      setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
      Alert.alert('Erro', 'Não foi possível carregar as transações');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTransactions();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Math.abs(value));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };

  const getTransactionColor = (transaction: PluggyTransaction) => {
    if (transaction.type === 'CREDIT') return '#4ade80';
    if (transaction.type === 'DEBIT') return '#f87171';
    return theme.text;
  };

  const getTransactionIcon = (transaction: PluggyTransaction) => {
    const description = transaction.description.toLowerCase();

    // Pix recebido
    if (
      transaction.type === 'CREDIT' &&
      (description.includes('pix') ||
        description.includes('transferência recebida') ||
        description.includes('transferencia recebida'))
    ) {
      return <SetaParaBaixoIcon size={40} color="#4ade80" />;
    }

    // Pix enviado
    if (
      transaction.type === 'DEBIT' &&
      (description.includes('pix') ||
        description.includes('transferência') ||
        description.includes('transferencia'))
    ) {
      return <SetaParaCimaIcon size={40} color="#f87171" />;
    }

    // Boleto ou Fatura de cartão
    if (
      transaction.type === 'DEBIT' &&
      (description.includes('pagamento') ||
        description.includes('fatura') ||
        description.includes('boleto'))
    ) {
      return <BoletoIcon size={40} color="#f87171" />;
    }

    // Default: Débito = seta para cima, Crédito = seta para baixo
    if (transaction.type === 'CREDIT') {
      return <SetaParaBaixoIcon size={40} color="#4ade80" />;
    }

    return <SetaParaCimaIcon size={40} color="#f87171" />;
  };

  const groupTransactionsByDate = (txs: PluggyTransaction[]) => {
    const groups: Record<string, PluggyTransaction[]> = {};

    txs.forEach((tx) => {
      const date = new Date(tx.date + 'T00:00:00');
      const key = date.toLocaleDateString('pt-BR', {
        year: 'numeric',
        month: 'long',
      });

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(tx);
    });

    return groups;
  };

  const groupedTransactions = groupTransactionsByDate(transactions);

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
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {accountName}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Lista de transações */}
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : transactions.length > 0 ? (
          Object.keys(groupedTransactions).map((monthYear) => (
            <View key={monthYear}>
              <Text
                style={[styles.monthHeader, { color: theme.textSecondary }]}
              >
                {monthYear}
              </Text>
              {groupedTransactions[monthYear].map((transaction) => (
                <View
                  key={transaction.id}
                  style={[
                    styles.transactionCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.transactionLeft}>
                    {getTransactionIcon(transaction)}
                  </View>

                  <View style={styles.transactionMiddle}>
                    <Text
                      style={[
                        styles.transactionDescription,
                        { color: theme.text },
                      ]}
                    >
                      {transaction.description}
                    </Text>
                    <View style={styles.transactionMeta}>
                      {transaction.category && (
                        <Text
                          style={[
                            styles.transactionCategory,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {transaction.category}
                        </Text>
                      )}
                      {transaction.status === 'PENDING' && (
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: '#fbbf24' },
                          ]}
                        >
                          <Text style={styles.statusText}>Pendente</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.transactionRight}>
                    <Text
                      style={[
                        styles.transactionAmount,
                        { color: getTransactionColor(transaction) },
                      ]}
                    >
                      {transaction.type === 'CREDIT' ? '+' : '-'}
                      {formatCurrency(transaction.amount)}
                    </Text>
                    <Text
                      style={[
                        styles.transactionDate,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {formatDate(transaction.date)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma transação
            </Text>
            <Text
              style={[styles.emptyDescription, { color: theme.textSecondary }]}
            >
              Use o botão "Sincronizar com o Banco" na tela anterior para buscar
              as transações
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 40,
  },
  monthHeader: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  transactionCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionLeft: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionMiddle: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 4,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionCategory: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontFamily: 'DMSans-SemiBold',
    color: '#000',
  },
  transactionRight: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  transactionDate: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
