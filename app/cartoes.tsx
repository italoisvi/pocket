import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { useTheme } from '@/lib/theme';

type CardExpense = {
  bank: string;
  total: number;
};

export default function CartoesScreen() {
  const { theme, isDark } = useTheme();
  const [cardExpenses, setCardExpenses] = useState<CardExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCardExpenses();
  }, []);

  const loadCardExpenses = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, subcategory, establishment_name')
        .eq('user_id', user.id)
        .eq('category', 'cartao_credito')
        .gte('date', firstDayOfMonth.toISOString().split('T')[0])
        .lte('date', lastDayOfMonth.toISOString().split('T')[0]);

      if (expensesData) {
        // Agrupar por banco (extraído do establishment_name ou subcategory)
        const bankMap = new Map<string, number>();

        expensesData.forEach((exp) => {
          // Tentar extrair o banco do nome do estabelecimento
          const establishmentLower = exp.establishment_name.toLowerCase();
          let bank = 'Outros';

          // Lista de bancos comuns
          const banks = [
            'nubank',
            'inter',
            'c6',
            'itau',
            'itaú',
            'bradesco',
            'santander',
            'banco do brasil',
            'caixa',
            'original',
            'pan',
            'neon',
            'picpay',
            'mercado pago',
            'pagbank',
            'next',
            'will bank',
            'digio',
            'credz',
            'bmg',
          ];

          // Procurar o nome do banco no establishment_name
          for (const bankName of banks) {
            if (establishmentLower.includes(bankName)) {
              // Capitalizar o nome do banco
              bank =
                bankName.charAt(0).toUpperCase() +
                bankName.slice(1).toLowerCase();
              // Ajustar nomes específicos
              if (bank === 'Banco do brasil') bank = 'Banco do Brasil';
              if (bank === 'Mercado pago') bank = 'Mercado Pago';
              if (bank === 'Pagbank') bank = 'PagBank';
              if (bank === 'Will bank') bank = 'Will Bank';
              break;
            }
          }

          // Agrupar por banco
          const current = bankMap.get(bank) || 0;
          bankMap.set(bank, current + exp.amount);
        });

        const cards: CardExpense[] = Array.from(bankMap.entries()).map(
          ([bank, total]) => ({
            bank,
            total,
          })
        );

        setCardExpenses(cards.sort((a, b) => b.total - a.total));
      }
    } catch (error) {
      console.error('Erro ao carregar gastos de cartões:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalCards = cardExpenses.reduce((sum, item) => sum + item.total, 0);

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
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : cardExpenses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Nenhum gasto com cartão de crédito encontrado neste mês
            </Text>
          </View>
        ) : (
          <>
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
                Total em Cartões
              </Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>
                {formatCurrency(totalCards)}
              </Text>
            </View>

            {/* Cards por Banco */}
            {cardExpenses.map((card, index) => (
              <View
                key={index}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <View
                      style={[
                        styles.bankIndicator,
                        { backgroundColor: '#EF5350' },
                      ]}
                    />
                    <Text style={[styles.bankName, { color: theme.text }]}>
                      {card.bank}
                    </Text>
                  </View>
                  <Text style={[styles.cardValue, { color: theme.text }]}>
                    {formatCurrency(card.total)}
                  </Text>
                </View>
              </View>
            ))}
          </>
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
    padding: 24,
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
    fontSize: 16,
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
  },
  cardValue: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
