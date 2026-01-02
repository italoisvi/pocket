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
import { getAccountsByItem } from '@/lib/pluggy';

type PluggyAccount = {
  id: string;
  pluggy_account_id: string;
  type: 'BANK' | 'CREDIT';
  subtype: string | null;
  name: string;
  number: string | null;
  balance: number | null;
  currency_code: string;
  credit_limit: number | null;
  available_credit_limit: number | null;
  created_at: string;
  updated_at: string;
};

export default function AccountsScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();

  const itemId = params.id as string;
  const bankName = params.name as string;

  const [accounts, setAccounts] = useState<PluggyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      console.log('[accounts] Loading accounts for item:', itemId);
      const data = await getAccountsByItem(itemId);
      console.log('[accounts] Accounts loaded:', data.length);
      console.log('[accounts] Accounts data:', JSON.stringify(data, null, 2));
      setAccounts(data);
    } catch (error) {
      console.error('[accounts] Error loading accounts:', error);
      Alert.alert('Erro', 'Não foi possível carregar as contas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAccounts();
  };

  const handleViewTransactions = (accountId: string, accountName: string) => {
    router.push({
      pathname: '/open-finance/transactions/[accountId]',
      params: { accountId, accountName },
    });
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getAccountTypeLabel = (type: string, subtype: string | null) => {
    if (type === 'CREDIT') return 'Cartão de Crédito';
    if (subtype === 'CHECKING_ACCOUNT') return 'Conta Corrente';
    if (subtype === 'SAVINGS_ACCOUNT') return 'Conta Poupança';
    return 'Conta Bancária';
  };

  const renderBankAccount = (account: PluggyAccount) => (
    <TouchableOpacity
      key={account.id}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
      onPress={() => handleViewTransactions(account.id, account.name)}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {account.name}
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
          {getAccountTypeLabel(account.type, account.subtype)}
        </Text>
        {account.number && (
          <Text style={[styles.accountNumber, { color: theme.textSecondary }]}>
            {account.number}
          </Text>
        )}
      </View>

      <View style={styles.cardFooter}>
        <View>
          <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
            Saldo Disponível
          </Text>
          <Text
            style={[
              styles.balanceValue,
              {
                color:
                  account.balance && account.balance >= 0
                    ? '#4ade80'
                    : '#f87171',
              },
            ]}
          >
            {formatCurrency(account.balance)}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.viewText, { color: theme.primary }]}>
            Ver transações →
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderCreditCard = (account: PluggyAccount) => (
    <TouchableOpacity
      key={account.id}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
      onPress={() => handleViewTransactions(account.id, account.name)}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {account.name}
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
          Cartão de Crédito
        </Text>
        {account.number && (
          <Text style={[styles.accountNumber, { color: theme.textSecondary }]}>
            •••• {account.number.slice(-4)}
          </Text>
        )}
      </View>

      <View style={styles.cardFooter}>
        <View style={{ flex: 1 }}>
          <View style={styles.creditRow}>
            <Text style={[styles.creditLabel, { color: theme.textSecondary }]}>
              Limite Total
            </Text>
            <Text style={[styles.creditValue, { color: theme.text }]}>
              {formatCurrency(account.credit_limit)}
            </Text>
          </View>
          <View style={styles.creditRow}>
            <Text style={[styles.creditLabel, { color: theme.textSecondary }]}>
              Disponível
            </Text>
            <Text
              style={[
                styles.creditValue,
                {
                  color:
                    account.available_credit_limit &&
                    account.available_credit_limit > 0
                      ? '#4ade80'
                      : '#f87171',
                },
              ]}
            >
              {formatCurrency(account.available_credit_limit)}
            </Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.viewText, { color: theme.primary }]}>
            Ver faturas →
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
        <Text style={[styles.title, { color: theme.text }]}>{bankName}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Lista de contas */}
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
        ) : accounts.length > 0 ? (
          <>
            {accounts
              .filter((a) => a.type === 'BANK')
              .map((account) => renderBankAccount(account))}

            {accounts
              .filter((a) => a.type === 'CREDIT')
              .map((account) => renderCreditCard(account))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma conta encontrada
            </Text>
            <Text
              style={[styles.emptyDescription, { color: theme.textSecondary }]}
            >
              Este banco ainda não possui contas sincronizadas
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
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 40,
  },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 2,
  },
  accountNumber: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 24,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  creditLabel: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  creditValue: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cardRight: {
    marginLeft: 12,
  },
  viewText: {
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
