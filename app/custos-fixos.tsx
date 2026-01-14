import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

type SubcategoryExpense = {
  category: ExpenseCategory;
  subcategory: string;
  total: number;
  source?: 'manual' | 'extrato'; // Flag para indicar origem
  count?: number; // Quantidade de transacoes
};

export default function CustosFixosScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ year?: string; month?: string }>();

  // Usar mês passado por parâmetro ou mês atual como fallback
  const selectedYear = params.year
    ? parseInt(params.year)
    : new Date().getFullYear();
  const selectedMonth =
    params.month !== undefined ? parseInt(params.month) : new Date().getMonth();

  const [categoryExpenses, setCategoryExpenses] = useState<
    SubcategoryExpense[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [totalIncome, setTotalIncome] = useState<number>(0);

  useEffect(() => {
    loadFixedExpenses();
  }, [selectedYear, selectedMonth]);

  const loadFixedExpenses = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Carregar renda total
      const { data: profileData } = await supabase
        .from('profiles')
        .select('monthly_salary, income_cards')
        .eq('id', user.id)
        .maybeSingle();

      let income = 0;
      if (
        profileData?.income_cards &&
        Array.isArray(profileData.income_cards)
      ) {
        income = profileData.income_cards.reduce((sum, card) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);
      }
      if (income === 0 && profileData?.monthly_salary) {
        income = profileData.monthly_salary;
      }
      setTotalIncome(income);

      // Usar mês selecionado (passado por parâmetro)
      const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1);
      const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0);

      // Buscar expenses MANUAIS marcados como custo fixo
      const { data: expensesData } = await supabase
        .from('expenses')
        .select(
          'amount, category, subcategory, source, establishment_name, is_fixed_cost'
        )
        .eq('user_id', user.id)
        .eq('is_fixed_cost', true)
        .gte('date', firstDayOfMonth.toISOString().split('T')[0])
        .lte('date', lastDayOfMonth.toISOString().split('T')[0]);

      // Buscar transacoes do extrato categorizadas (tabela transaction_categories)
      // Primeiro buscar contas do usuario
      const { data: accounts } = await supabase
        .from('pluggy_accounts')
        .select('id')
        .eq('user_id', user.id);

      let extractTransactions: any[] = [];
      if (accounts && accounts.length > 0) {
        const accountIds = accounts.map((a: any) => a.id);

        // Buscar transacoes com categoria (inclui description para granularidade)
        const { data: categorizedTx } = await supabase
          .from('transaction_categories')
          .select(
            `
            category,
            subcategory,
            is_fixed_cost,
            pluggy_transactions!inner(
              amount,
              date,
              account_id,
              description
            )
          `
          )
          .eq('user_id', user.id)
          .eq('is_fixed_cost', true);

        if (categorizedTx) {
          // Filtrar por periodo e contas
          extractTransactions = categorizedTx.filter((tx: any) => {
            const txDate = tx.pluggy_transactions?.date;
            const txAccountId = tx.pluggy_transactions?.account_id;
            if (!txDate || !txAccountId) return false;
            if (!accountIds.includes(txAccountId)) return false;
            const date = new Date(txDate);
            return date >= firstDayOfMonth && date <= lastDayOfMonth;
          });
        }
      }

      // Agrupar por categoria + subcategoria (custos fixos)
      const subcategoryMap = new Map<string, SubcategoryExpense>();

      // Processar expenses manuais (ja filtrados por is_fixed_cost = true)
      if (expensesData) {
        expensesData.forEach((exp) => {
          const category = (exp.category as ExpenseCategory) || 'outros';
          const subcategory = exp.subcategory || 'Outros';
          const establishmentName = exp.establishment_name || subcategory;

          // Usar establishment_name como identificador unico para granularidade
          const key = `manual-${category}-${establishmentName}`;

          if (subcategoryMap.has(key)) {
            const existing = subcategoryMap.get(key)!;
            existing.total += exp.amount;
            existing.count = (existing.count || 1) + 1;
          } else {
            subcategoryMap.set(key, {
              category,
              subcategory: establishmentName,
              total: exp.amount,
              source: 'manual',
              count: 1,
            });
          }
        });
      }

      // Processar transacoes do extrato categorizadas
      extractTransactions.forEach((tx: any) => {
        const category = (tx.category as ExpenseCategory) || 'outros';
        const subcategory = tx.subcategory || 'Extrato';
        const amount = Math.abs(tx.pluggy_transactions?.amount || 0);
        const description = tx.pluggy_transactions?.description || subcategory;

        // Usar description como identificador único para granularidade
        const key = `extrato-${category}-${description}`;

        if (subcategoryMap.has(key)) {
          const existing = subcategoryMap.get(key)!;
          existing.total += amount;
          existing.count = (existing.count || 1) + 1;
        } else {
          subcategoryMap.set(key, {
            category,
            subcategory: description,
            total: amount,
            source: 'extrato',
            count: 1,
          });
        }
      });

      const subcategories: SubcategoryExpense[] = Array.from(
        subcategoryMap.values()
      );

      setCategoryExpenses(subcategories.sort((a, b) => b.total - a.total));
    } catch (error) {
      console.error('Erro ao carregar custos fixos:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalFixed = categoryExpenses.reduce(
    (sum, item) => sum + item.total,
    0
  );

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
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: theme.text }]}>
            Custos Essenciais
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {new Date(selectedYear, selectedMonth).toLocaleDateString('pt-BR', {
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {loading ? (
          <View
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <LoadingKangaroo size={80} />
          </View>
        ) : (
          <>
            <View
              style={[
                styles.totalCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                Total de Custos Essenciais
              </Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>
                {formatCurrency(totalFixed)}
              </Text>
            </View>

            {categoryExpenses.map((item) => {
              const categoryInfo = CATEGORIES[item.category];
              const percentage =
                totalIncome > 0 ? (item.total / totalIncome) * 100 : 0;
              const isExtract = item.source === 'extrato';

              return (
                <View
                  key={`${item.source}-${item.category}-${item.subcategory}`}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.card,
                      borderColor: isExtract ? theme.primary : theme.cardBorder,
                      borderWidth: isExtract ? 1.5 : 1,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.categoryLeft}>
                      <CategoryIcon categoryInfo={categoryInfo} size={24} />
                      <View style={styles.categoryTextContainer}>
                        <View style={styles.subcategoryRow}>
                          <Text
                            style={[
                              styles.subcategoryName,
                              { color: theme.text },
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {item.subcategory}
                          </Text>
                          {isExtract && (
                            <View
                              style={[
                                styles.extractBadge,
                                {
                                  backgroundColor:
                                    theme.background === '#000'
                                      ? 'rgba(247, 195, 89, 0.2)'
                                      : theme.primary,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.extractBadgeText,
                                  {
                                    color:
                                      theme.background === '#000'
                                        ? theme.primary
                                        : '#FFF',
                                  },
                                ]}
                              >
                                Extrato
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.categoryLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {categoryInfo.name}{' '}
                          {item.count && item.count > 1
                            ? `(${item.count}x)`
                            : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.cardContent}>
                    <View style={styles.row}>
                      <Text
                        style={[styles.label, { color: theme.textSecondary }]}
                      >
                        Valor
                      </Text>
                      <Text style={[styles.value, { color: theme.text }]}>
                        {formatCurrency(item.total)}
                      </Text>
                    </View>
                    <View style={styles.row}>
                      <Text
                        style={[styles.label, { color: theme.textSecondary }]}
                      >
                        % da Renda
                      </Text>
                      <Text style={[styles.value, { color: theme.text }]}>
                        {percentage.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

            {categoryExpenses.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  Nenhum custo essencial registrado este mês
                </Text>
              </View>
            )}
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
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    textTransform: 'capitalize',
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
  totalCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 2,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 36,
    fontFamily: 'CormorantGaramond-Bold',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardContent: {
    gap: 8,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryTextContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  subcategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    backgroundColor: 'transparent',
  },
  subcategoryName: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    flexShrink: 1,
  },
  categoryLabel: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  value: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Medium',
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
  extractBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  extractBadgeText: {
    fontSize: 10,
    fontFamily: 'CormorantGaramond-SemiBold',
    textTransform: 'uppercase',
  },
});
