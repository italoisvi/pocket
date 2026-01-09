import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { AtualizarIcon } from '@/components/AtualizarIcon';
import { SetaParaBaixoIcon } from '@/components/SetaParaBaixoIcon';
import { SetaParaCimaIcon } from '@/components/SetaParaCimaIcon';
import { BoletoIcon } from '@/components/BoletoIcon';
import {
  getTransactionsByAccount,
  syncTransactions as syncTransactionsAPI,
  syncItem,
} from '@/lib/pluggy';
import { supabase } from '@/lib/supabase';

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
  const [syncing, setSyncing] = useState(false);

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

  const handleSync = async () => {
    setSyncing(true);

    try {
      console.log('[Transactions] Starting sync for accountId:', accountId);
      console.log('[Transactions] Account name:', accountName);

      // Primeiro: buscar o item_id da conta e seus dados
      const { data: accountData, error: accountError } = await supabase
        .from('pluggy_accounts')
        .select(
          'id, pluggy_account_id, type, item_id, pluggy_items(pluggy_item_id, connector_name)'
        )
        .eq('id', accountId)
        .single();

      if (accountError || !accountData) {
        console.error('[Transactions] Error fetching account:', accountError);
        throw new Error('Conta não encontrada');
      }

      console.log(
        '[Transactions] Account data:',
        JSON.stringify(accountData, null, 2)
      );

      const pluggyItemId = (accountData.pluggy_items as any)?.pluggy_item_id;

      if (!pluggyItemId) {
        throw new Error('Item do banco não encontrado');
      }

      console.log('[Transactions] Account type:', accountData.type);
      console.log(
        '[Transactions] Pluggy account ID:',
        accountData.pluggy_account_id
      );
      console.log('[Transactions] Syncing item:', pluggyItemId);

      // Sincronizar dados do Item (buscar dados atuais da Pluggy)
      const syncResult = await syncItem(pluggyItemId);

      console.log(
        '[Transactions] Item sync result:',
        JSON.stringify(syncResult, null, 2)
      );

      // Sincronizar transações dos últimos 90 dias
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      console.log('[Transactions] Syncing transactions from', from, 'to', to);
      console.log('[Transactions] Using accountId (UUID):', accountId);

      const result = await syncTransactionsAPI(accountId, { from, to });

      console.log(
        '[Transactions] Transactions sync result:',
        JSON.stringify(result, null, 2)
      );

      // Sempre recarregar após sincronizar
      await loadTransactions();

      if (result.saved > 0) {
        Alert.alert(
          'Sucesso!',
          `${result.saved} nova(s) transação(ões) sincronizada(s)`
        );
      } else if (result.total > 0) {
        Alert.alert(
          'Sincronização Concluída',
          `Foram encontradas ${result.total} transações, mas todas já estavam sincronizadas.`
        );
      } else {
        Alert.alert(
          'Sincronização Concluída',
          'Nenhuma transação foi encontrada nos últimos 90 dias.'
        );
      }
    } catch (error) {
      console.error('Error syncing transactions:', error);
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Não foi possível sincronizar transações'
      );
    } finally {
      setSyncing(false);
    }
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
        <TouchableOpacity
          style={[
            styles.syncButton,
            {
              backgroundColor:
                theme.background === '#000' ? theme.card : theme.primary,
              borderWidth: 2,
              borderColor:
                theme.background === '#000' ? theme.cardBorder : theme.primary,
            },
          ]}
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator
              size="small"
              color={theme.background === '#000' ? theme.text : '#fff'}
            />
          ) : (
            <AtualizarIcon
              size={20}
              color={theme.background === '#000' ? theme.text : '#fff'}
            />
          )}
        </TouchableOpacity>
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
          <ActivityIndicator
            size="large"
            color={theme.primary}
            style={styles.loader}
          />
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
              Sincronize para ver as transações desta conta
            </Text>
            <TouchableOpacity
              style={[
                styles.emptyButton,
                {
                  backgroundColor:
                    theme.background === '#000' ? theme.card : theme.primary,
                  borderWidth: 2,
                  borderColor:
                    theme.background === '#000'
                      ? theme.cardBorder
                      : theme.primary,
                },
              ]}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator
                  color={theme.background === '#000' ? theme.text : '#fff'}
                />
              ) : (
                <Text
                  style={[
                    styles.emptyButtonText,
                    {
                      color: theme.background === '#000' ? theme.text : '#fff',
                    },
                  ]}
                >
                  Sincronizar
                </Text>
              )}
            </TouchableOpacity>
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
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  syncButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  syncButtonText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
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
    fontFamily: 'CormorantGaramond-SemiBold',
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
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionCategory: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#000',
  },
  transactionRight: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  transactionDate: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 2,
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
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
