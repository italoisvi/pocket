import { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { PlusIcon } from '@/components/PlusIcon';
import { LixoIcon } from '@/components/LixoIcon';
import { useTheme } from '@/lib/theme';
import { CardBrandIcon } from '@/lib/cardBrand';
import { syncEvents } from '@/lib/syncEvents';
import { disconnectItem } from '@/lib/pluggy';

type CreditCardBank = {
  accountId: string;
  accountName: string;
  usedCredit: number;
  creditLimit: number;
  availableCredit: number;
  connectorName: string;
  itemId: string;
};

export default function CartoesScreen() {
  const { theme, isDark, themeMode } = useTheme();
  const [banks, setBanks] = useState<CreditCardBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadBanks();
    }, [])
  );

  useEffect(() => {
    // Escutar eventos de sincronização
    const unsubscribe = syncEvents.subscribe(() => {
      console.log('[Cartoes] Sync event received, reloading...');
      loadBanks();
    });

    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadBanks();
  };

  const handleDeleteCard = (itemId: string, connectorName: string) => {
    Alert.alert(
      'Desconectar Cartão',
      `Tem certeza que deseja desconectar ${connectorName}?\n\nTodas as transações do cartão serão removidas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectItem(itemId);
              Alert.alert('Sucesso', `${connectorName} foi desconectado`);
              loadBanks();
            } catch (error) {
              console.error('[cartoes] Error deleting item:', error);
              Alert.alert('Erro', 'Não foi possível desconectar o cartão');
            }
          },
        },
      ]
    );
  };

  const loadBanks = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar contas de cartão de crédito do Open Finance com connector_name e item_id
      const { data: creditAccounts } = await supabase
        .from('pluggy_accounts')
        .select(
          'id, name, credit_limit, available_credit_limit, item_id, pluggy_items(id, connector_name)'
        )
        .eq('user_id', user.id)
        .eq('type', 'CREDIT');

      if (!creditAccounts || creditAccounts.length === 0) {
        setBanks([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Mapear contas para o formato de bancos
      const banksData: CreditCardBank[] = creditAccounts
        .map((account) => {
          if (account.credit_limit && account.available_credit_limit !== null) {
            const usedCredit =
              account.credit_limit - account.available_credit_limit;
            const pluggyItem = account.pluggy_items as any;
            const connectorName = pluggyItem?.connector_name || 'Unknown';
            return {
              accountId: account.id,
              accountName: account.name,
              usedCredit,
              creditLimit: account.credit_limit,
              availableCredit: account.available_credit_limit,
              connectorName,
              itemId: pluggyItem?.id || account.item_id,
            };
          }
          return null;
        })
        .filter((bank): bank is CreditCardBank => bank !== null);

      setBanks(banksData);
    } catch (error) {
      console.error('Erro ao carregar bancos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
        <Text style={[styles.title, { color: theme.text }]}>
          Cartões de Crédito
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() =>
            router.push({
              pathname: '/open-finance/connect',
              params: {
                products: JSON.stringify(['CREDIT_CARDS', 'TRANSACTIONS']),
                title: 'Conectar Cartão',
              },
            })
          }
        >
          <PlusIcon size={20} color={theme.text} />
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
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : banks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Nenhum cartão de crédito conectado
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              Conecte seus cartões via Open Finance para visualizar os saldos
            </Text>
            <TouchableOpacity
              style={[
                styles.connectButton,
                {
                  backgroundColor:
                    themeMode === 'night'
                      ? '#0a1929'
                      : isDark
                        ? '#000'
                        : theme.primary,
                  borderWidth: 2,
                  borderColor:
                    themeMode === 'night'
                      ? '#1a3a5c'
                      : isDark
                        ? '#2c2c2e'
                        : theme.primary,
                },
              ]}
              onPress={() =>
                router.push({
                  pathname: '/open-finance/connect',
                  params: {
                    products: JSON.stringify(['CREDIT_CARDS', 'TRANSACTIONS']),
                    title: 'Conectar Cartão',
                  },
                })
              }
            >
              <Text
                style={[
                  styles.connectButtonText,
                  { color: isDark ? theme.text : '#fff' },
                ]}
              >
                Conectar Cartão
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.banksContainer}>
            {/* Lista de Cartões Conectados */}
            {banks.map((bank) => (
              <View
                key={bank.accountId}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
              >
                {/* Conteúdo do Card - Clicável para ver faturas */}
                <TouchableOpacity
                  style={styles.cardContent}
                  onPress={() =>
                    router.push({
                      pathname: '/cartoes/faturas',
                      params: {
                        accountId: bank.accountId,
                        accountName: bank.accountName,
                      },
                    })
                  }
                >
                  <View style={styles.cardLeft}>
                    <CardBrandIcon
                      cardName={bank.connectorName || bank.accountName}
                      size={48}
                    />
                    <View style={styles.cardTextContainer}>
                      <Text style={[styles.bankName, { color: theme.text }]}>
                        {bank.accountName}
                      </Text>
                      <Text
                        style={[
                          styles.bankSubtitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Cartão de Crédito
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={[styles.cardValue, { color: theme.text }]}>
                      {formatCurrency(bank.usedCredit)}
                    </Text>
                    <ChevronRightIcon size={20} color={theme.text} />
                  </View>
                </TouchableOpacity>

                {/* Botão de Excluir */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.deleteActionButton,
                      {
                        backgroundColor: 'transparent',
                        borderColor: '#f87171',
                      },
                    ]}
                    onPress={() =>
                      handleDeleteCard(bank.itemId, bank.connectorName)
                    }
                  >
                    <LixoIcon size={16} color="#f87171" />
                    <Text
                      style={[styles.actionButtonText, { color: '#f87171' }]}
                    >
                      Excluir
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
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
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  addButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
  connectButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  connectButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  banksContainer: {
    paddingTop: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  deleteActionButton: {
    // Ocupa todo o espaço disponível (herdado do actionButton flex: 1)
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  bankIndicator: {
    width: 8,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
  },
  cardTextContainer: {
    flex: 1,
  },
  bankName: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 4,
  },
  bankSubtitle: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardValue: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
});
