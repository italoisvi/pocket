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
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

type SubcategoryExpense = {
  category: ExpenseCategory;
  subcategory: string;
  total: number;
};

export default function CustosFixosScreen() {
  const { theme } = useTheme();
  const [categoryExpenses, setCategoryExpenses] = useState<
    SubcategoryExpense[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [totalIncome, setTotalIncome] = useState<number>(0);

  useEffect(() => {
    loadFixedExpenses();
  }, []);

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

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, subcategory')
        .eq('user_id', user.id)
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString());

      if (expensesData) {
        // Agrupar por categoria + subcategoria
        const subcategoryMap = new Map<string, SubcategoryExpense>();
        expensesData
          .filter(
            (exp) =>
              CATEGORIES[exp.category as ExpenseCategory] &&
              CATEGORIES[exp.category as ExpenseCategory].type === 'essencial'
          )
          .forEach((exp) => {
            const category = (exp.category as ExpenseCategory) || 'outros';
            const subcategory = exp.subcategory || 'Outros';
            const key = `${category}-${subcategory}`;

            if (subcategoryMap.has(key)) {
              const existing = subcategoryMap.get(key)!;
              existing.total += exp.amount;
            } else {
              subcategoryMap.set(key, {
                category,
                subcategory,
                total: exp.amount,
              });
            }
          });

        const subcategories: SubcategoryExpense[] = Array.from(
          subcategoryMap.values()
        );

        setCategoryExpenses(subcategories.sort((a, b) => b.total - a.total));
      }
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
        <Text style={[styles.title, { color: theme.text }]}>
          Custos Essenciais
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {loading ? (
          <View
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ActivityIndicator size="large" color={theme.primary} />
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

              return (
                <View
                  key={`${item.category}-${item.subcategory}`}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.categoryLeft}>
                      <CategoryIcon categoryInfo={categoryInfo} size={24} />
                      <View>
                        <Text
                          style={[
                            styles.subcategoryName,
                            { color: theme.text },
                          ]}
                        >
                          {item.subcategory}
                        </Text>
                        <Text
                          style={[
                            styles.categoryLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {categoryInfo.name}
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
  },
  subcategoryName: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
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
});
