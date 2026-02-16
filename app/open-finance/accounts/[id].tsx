import { useState, useEffect, useRef } from 'react';
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
import {
  getAccountsByItem,
  syncItem,
  updateItem,
  getApiKey,
  syncTransactions,
} from '@/lib/pluggy';
import { supabase } from '@/lib/supabase';
import { CardBrandIcon } from '@/lib/cardBrand';
import { syncEvents } from '@/lib/syncEvents';
import { notifySyncCompleted } from '@/lib/notifications';

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
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams();

  const itemId = params.id as string;
  const bankName = params.name as string;

  const [accounts, setAccounts] = useState<PluggyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

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

  // Função unificada de sincronização: dispara update + faz polling + busca dados
  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncStatus('Iniciando...');

      console.log('[accounts] handleSync - itemId:', itemId);

      // Buscar pluggy_item_id do banco de dados
      const { data: itemData, error: itemError } = await supabase
        .from('pluggy_items')
        .select('pluggy_item_id, status, connector_name')
        .eq('id', itemId)
        .single();

      if (itemError || !itemData) {
        Alert.alert('Erro', 'Item não encontrado no banco de dados.');
        return;
      }

      const pluggyItemId = itemData.pluggy_item_id;
      console.log('[accounts] Syncing item:', pluggyItemId);

      // Passo 1: Disparar atualização na Pluggy
      setSyncStatus('Conectando ao banco...');
      console.log('[accounts] Step 1: Triggering update...');

      try {
        const updateResult = await updateItem(pluggyItemId);
        console.log('[accounts] Update result:', updateResult);

        if (updateResult.item.status === 'WAITING_USER_INPUT') {
          Alert.alert(
            'Autenticação Necessária',
            `${bankName} requer autenticação adicional. Volte à tela anterior e toque no banco para autenticar.`
          );
          return;
        }
      } catch (updateError: any) {
        // Se for rate limit, apenas continuar com sync
        if (!updateError.message?.includes('429')) {
          console.error('[accounts] Update error:', updateError);
        }
      }

      // Passo 2: Fazer polling até o status mudar para UPDATED (máximo 30 segundos)
      setSyncStatus('Aguardando dados do banco...');
      console.log('[accounts] Step 2: Polling for status...');

      const apiKey = await getApiKey();
      let attempts = 0;
      const maxAttempts = 15; // 15 tentativas x 2 segundos = 30 segundos
      let itemStatus = 'UPDATING';

      while (attempts < maxAttempts && itemStatus === 'UPDATING') {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Esperar 2 segundos

        try {
          const itemResponse = await fetch(
            `https://api.pluggy.ai/items/${pluggyItemId}`,
            { headers: { 'X-API-KEY': apiKey } }
          );

          if (itemResponse.ok) {
            const item = await itemResponse.json();
            itemStatus = item.status;
            console.log(
              `[accounts] Polling attempt ${attempts + 1}: status = ${itemStatus}`
            );

            if (item.status === 'WAITING_USER_INPUT') {
              Alert.alert(
                'Autenticação Necessária',
                `${bankName} requer autenticação adicional.`
              );
              return;
            }

            if (item.status === 'LOGIN_ERROR' || item.status === 'OUTDATED') {
              Alert.alert(
                'Erro de Conexão',
                item.error?.message ||
                  'Erro ao conectar com o banco. Verifique suas credenciais.'
              );
              return;
            }
          }
        } catch (error) {
          console.error('[accounts] Polling error:', error);
        }

        attempts++;
      }

      // Passo 3: Buscar dados atualizados
      setSyncStatus('Sincronizando contas...');
      console.log('[accounts] Step 3: Syncing item data...');

      const result = await syncItem(pluggyItemId);
      console.log('[accounts] Sync result:', result);

      // Recarregar contas
      await loadAccounts();

      // Passo 4: Sincronizar transações de todas as contas
      setSyncStatus('Sincronizando transações...');
      console.log(
        '[accounts] Step 4: Syncing transactions for all accounts...'
      );

      // Buscar todas as contas deste item
      const { data: accountsData } = await supabase
        .from('pluggy_accounts')
        .select('id, pluggy_account_id, name')
        .eq('item_id', itemId);

      let totalTransactionsSaved = 0;

      if (accountsData && accountsData.length > 0) {
        const now = new Date();
        const to = now.toISOString().split('T')[0];
        // Primeiro dia do mês corrente
        const from = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split('T')[0];

        for (const account of accountsData) {
          try {
            console.log(
              `[accounts] Syncing transactions for account: ${account.name}`
            );
            const txResult = await syncTransactions(account.id, { from, to });
            totalTransactionsSaved += txResult.saved;
            console.log(
              `[accounts] Account ${account.name}: ${txResult.saved} new transactions`
            );
          } catch (txError) {
            console.error(
              `[accounts] Error syncing transactions for ${account.name}:`,
              txError
            );
          }
        }
      }

      // Emitir evento de sincronização para atualizar outras telas
      syncEvents.emit();

      // Enviar notificação de sincronização
      await notifySyncCompleted(bankName, totalTransactionsSaved);

      // Mostrar resultado
      if (result.accountsCount > 0) {
        let message = `${result.accountsCount} conta(s) sincronizada(s) com sucesso!`;

        if (totalTransactionsSaved > 0) {
          message += `\n${totalTransactionsSaved} nova(s) transação(ões) encontrada(s).`;
        }

        if (result.item.executionStatus === 'PARTIAL_SUCCESS') {
          message += '\n\nAlguns dados podem estar incompletos.';
        }

        Alert.alert('Sincronizado!', message);
      } else if (itemStatus === 'UPDATING') {
        Alert.alert(
          'Processando',
          'O banco ainda está processando. Tente novamente em alguns instantes.'
        );
      } else {
        Alert.alert(
          'Atenção',
          'Sincronização concluída, mas nenhuma conta foi encontrada.'
        );
      }
    } catch (error) {
      console.error('[accounts] Error syncing:', error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('429')) {
        Alert.alert(
          'Muitas Tentativas',
          'Aguarde alguns minutos antes de sincronizar novamente.'
        );
      } else {
        Alert.alert('Erro', 'Não foi possível sincronizar. Tente novamente.');
      }
    } finally {
      setSyncing(false);
      setSyncStatus('');
    }
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
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            {account.name}
          </Text>
          <CardBrandIcon cardName={account.name} size={32} />
        </View>
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

      {/* Botão de Sincronização */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: isDark ? '#000' : theme.primary,
              borderWidth: 2,
              borderColor: isDark ? '#2c2c2e' : theme.primary,
              opacity: syncing ? 0.8 : 1,
            },
          ]}
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <View style={styles.syncingContainer}>
              <ActivityIndicator
                size="small"
                color={isDark ? theme.text : '#fff'}
              />
              {syncStatus ? (
                <Text
                  style={[
                    styles.syncStatusText,
                    {
                      color: isDark ? theme.text : '#fff',
                    },
                  ]}
                >
                  {syncStatus}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text
              style={[
                styles.actionButtonText,
                {
                  color: isDark ? theme.text : '#fff',
                },
              ]}
            >
              Sincronizar com o Banco
            </Text>
          )}
        </TouchableOpacity>
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
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
            <TouchableOpacity
              style={[
                styles.syncButton,
                {
                  backgroundColor: isDark ? '#000' : theme.primary,
                  borderWidth: 2,
                  borderColor: isDark ? '#2c2c2e' : theme.primary,
                },
              ]}
              onPress={handleSync}
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
                    {
                      color: isDark ? theme.text : '#fff',
                    },
                  ]}
                >
                  Sincronizar Agora
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
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  actionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  syncingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncStatusText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
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
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    flex: 1,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginBottom: 2,
  },
  accountNumber: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  creditLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  creditValue: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  cardRight: {
    marginLeft: 12,
  },
  viewText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
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
    marginBottom: 24,
  },
  syncButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  syncButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
});
