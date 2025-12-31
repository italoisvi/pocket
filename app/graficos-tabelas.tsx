import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PieChart } from 'react-native-chart-kit';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

const screenWidth = Dimensions.get('window').width;

type SubcategoryExpense = {
  category: ExpenseCategory;
  subcategory: string;
  total: number;
};

export default function GraficosTabelasScreen() {
  const { theme } = useTheme();
  const [categoryExpenses, setCategoryExpenses] = useState<
    SubcategoryExpense[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
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
        .select('amount, category, subcategory')
        .eq('user_id', user.id)
        .gte('date', firstDayOfMonth.toISOString().split('T')[0])
        .lte('date', lastDayOfMonth.toISOString().split('T')[0]);

      if (expensesData) {
        const total = expensesData.reduce((sum, exp) => sum + exp.amount, 0);
        setTotalExpenses(total);

        // Agrupar por categoria + subcategoria
        const subcategoryMap = new Map<string, SubcategoryExpense>();
        expensesData.forEach((exp) => {
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
      console.error('Erro ao carregar gastos:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartData = categoryExpenses
    .filter((item) => CATEGORIES[item.category])
    .map((item) => ({
      name: item.subcategory,
      population: item.total,
      color: CATEGORIES[item.category].color,
      legendFontColor: '#666',
      legendFontSize: 0,
    }));

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
          Gráficos & Tabelas
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
            {/* Gráfico de Pizza */}
            {chartData.length > 0 ? (
              <>
                <View
                  style={[
                    styles.chartCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Distribuição por Categoria
                  </Text>
                  <View style={styles.chartWrapper}>
                    <PieChart
                      data={chartData}
                      width={screenWidth - 88}
                      height={220}
                      chartConfig={{
                        color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                      }}
                      accessor="population"
                      backgroundColor="transparent"
                      paddingLeft="15"
                      absolute
                      hasLegend={false}
                    />
                  </View>

                  {/* Divider line */}
                  <View
                    style={[
                      styles.chartDivider,
                      { backgroundColor: theme.border },
                    ]}
                  />

                  {/* Legendas customizadas com ícones em scroll horizontal */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={true}
                    contentContainerStyle={styles.legendScrollContent}
                    style={styles.legendScrollView}
                  >
                    {(() => {
                      const filteredItems = categoryExpenses.filter(
                        (item) => CATEGORIES[item.category]
                      );
                      const columns = [];
                      for (let i = 0; i < filteredItems.length; i += 3) {
                        columns.push(filteredItems.slice(i, i + 3));
                      }

                      return columns.map((column, colIndex) => (
                        <View
                          key={`column-${colIndex}`}
                          style={styles.legendColumn}
                        >
                          {column.map((item) => {
                            const categoryInfo = CATEGORIES[item.category];
                            const percentage =
                              totalExpenses > 0
                                ? (item.total / totalExpenses) * 100
                                : 0;

                            return (
                              <View
                                key={`${item.category}-${item.subcategory}`}
                                style={styles.legendItem}
                              >
                                <View
                                  style={[
                                    styles.legendColorBox,
                                    { backgroundColor: categoryInfo.color },
                                  ]}
                                />
                                <CategoryIcon
                                  categoryInfo={categoryInfo}
                                  size={20}
                                />
                                <View style={styles.legendTextContainer}>
                                  <Text
                                    style={[
                                      styles.legendText,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {item.subcategory}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.legendSubtext,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {categoryInfo.name} -{' '}
                                    {percentage.toFixed(1)}%
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ));
                    })()}
                  </ScrollView>
                </View>

                {/* Tabela de Dados */}
                <View
                  style={[
                    styles.tableCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Detalhamento
                  </Text>

                  <View
                    style={[
                      styles.tableHeader,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tableHeaderText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Categoria
                    </Text>
                    <Text
                      style={[
                        styles.tableHeaderText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Valor
                    </Text>
                    <Text
                      style={[
                        styles.tableHeaderText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      %
                    </Text>
                  </View>

                  {categoryExpenses
                    .filter((item) => CATEGORIES[item.category])
                    .map((item) => {
                      const categoryInfo = CATEGORIES[item.category];
                      const percentage =
                        totalExpenses > 0
                          ? (item.total / totalExpenses) * 100
                          : 0;

                      return (
                        <View
                          key={`${item.category}-${item.subcategory}`}
                          style={[
                            styles.tableRow,
                            { borderBottomColor: theme.border },
                          ]}
                        >
                          <View style={styles.tableCategoryCell}>
                            <CategoryIcon
                              categoryInfo={categoryInfo}
                              size={20}
                            />
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
                          <Text
                            style={[styles.tableCell, { color: theme.text }]}
                          >
                            {formatCurrency(item.total)}
                          </Text>
                          <Text
                            style={[styles.tableCell, { color: theme.text }]}
                          >
                            {percentage.toFixed(1)}%
                          </Text>
                        </View>
                      );
                    })}

                  <View
                    style={[
                      styles.tableDivider,
                      { backgroundColor: theme.border },
                    ]}
                  />

                  <View style={styles.tableRow}>
                    <Text
                      style={[styles.tableTotalLabel, { color: theme.text }]}
                    >
                      Total
                    </Text>
                    <Text
                      style={[styles.tableTotalValue, { color: theme.text }]}
                    >
                      {formatCurrency(totalExpenses)}
                    </Text>
                    <Text
                      style={[styles.tableTotalValue, { color: theme.text }]}
                    >
                      100%
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  Nenhum gasto registrado este mês
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
  chartCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  chartDivider: {
    height: 2,
    width: '100%',
    marginVertical: 16,
  },
  tableCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 16,
    alignSelf: 'center',
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tableCategoryCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subcategoryName: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  categoryLabel: {
    fontSize: 13,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 2,
  },
  tableCell: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'right',
  },
  tableDivider: {
    height: 2,
    marginTop: 8,
  },
  tableTotalLabel: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  tableTotalValue: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'right',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
  },
  legendScrollView: {
    width: '100%',
  },
  legendScrollContent: {
    paddingHorizontal: 4,
  },
  legendColumn: {
    flexDirection: 'column',
    gap: 12,
    marginRight: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: (screenWidth - 88) / 2,
  },
  legendColorBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    flexShrink: 0,
  },
  legendTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  legendText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  legendSubtext: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 2,
  },
});
