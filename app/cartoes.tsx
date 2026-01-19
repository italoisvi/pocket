import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { useTheme } from '@/lib/theme';
import { CardBrandIcon } from '@/lib/cardBrand';

type CreditCardBank = {
  accountId: string;
  accountName: string;
  usedCredit: number;
  creditLimit: number;
  availableCredit: number;
  connectorName: string;
};

export default function CartoesScreen() {
  const { theme, isDark } = useTheme();
  const [banks, setBanks] = useState<CreditCardBank[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadBanks();
    }, [])
  );

  const loadBanks = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar contas de cartão de crédito do Open Finance com connector_name
      const { data: creditAccounts } = await supabase
        .from('pluggy_accounts')
        .select(
          'id, name, credit_limit, available_credit_limit, pluggy_items(connector_name)'
        )
        .eq('user_id', user.id)
        .eq('type', 'CREDIT');

      if (!creditAccounts || creditAccounts.length === 0) {
        setBanks([]);
        setLoading(false);
        return;
      }

      // Mapear contas para o formato de bancos
      const banksData: CreditCardBank[] = creditAccounts
        .map((account) => {
          if (account.credit_limit && account.available_credit_limit !== null) {
            const usedCredit =
              account.credit_limit - account.available_credit_limit;
            const connectorName =
              (account.pluggy_items as any)?.connector_name || 'Unknown';
            return {
              accountId: account.id,
              accountName: account.name,
              usedCredit,
              creditLimit: account.credit_limit,
              availableCredit: account.available_credit_limit,
              connectorName,
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
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <LoadingKangaroo size={80} />
          </View>
        ) : banks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Nenhum cartão de crédito conectado
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              Conecte seus cartões via Open Finance para visualizar as faturas
            </Text>
          </View>
        ) : (
          <View style={styles.banksContainer}>
            {/* Lista de Bancos Conectados */}
            {banks.map((bank) => (
              <TouchableOpacity
                key={bank.accountId}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
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
                <View style={styles.cardContent}>
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
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  placeholder: {
    width: 28,
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
  banksContainer: {
    paddingTop: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 16,
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
