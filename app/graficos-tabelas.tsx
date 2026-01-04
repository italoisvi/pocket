import React, { useEffect, useState } from 'react';
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
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { GraficoCircularIcon } from '@/components/GraficoCircularIcon';
import { GraficoBarrasIcon } from '@/components/GraficoBarrasIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

const screenWidth = Dimensions.get('window').width;

type SubcategoryExpense = {
  category: ExpenseCategory;
  subcategory: string;
  total: number;
};

type PeriodFilter = 'last7days' | 'last15days' | 'month';
type ChartType = 'pie' | 'bar';

export default function GraficosTabelasScreen() {
  const { theme } = useTheme();
  const [categoryExpenses, setCategoryExpenses] = useState<
    SubcategoryExpense[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [chartType, setChartType] = useState<ChartType>('pie');

  useEffect(() => {
    loadExpenses();
  }, [periodFilter, selectedMonth]);

  const loadExpenses = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      let startDate: Date;
      let endDate: Date;
      const now = new Date();

      switch (periodFilter) {
        case 'last7days':
          endDate = now;
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 6); // Últimos 7 dias incluindo hoje
          break;
        case 'last15days':
          endDate = now;
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 14); // Últimos 15 dias incluindo hoje
          break;
        case 'month':
          startDate = new Date(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth(),
            1
          );
          endDate = new Date(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth() + 1,
            0
          );
          break;
      }

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, subcategory')
        .eq('user_id', user.id)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);

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

  // Preparar dados para os gráficos
  const pieChartData = categoryExpenses
    .filter((item) => CATEGORIES[item.category])
    .map((item) => ({
      name: item.subcategory,
      population: item.total,
      color: CATEGORIES[item.category].color,
      legendFontColor: '#666',
      legendFontSize: 0,
    }));

  const barChartData = categoryExpenses
    .filter((item) => CATEGORIES[item.category])
    .slice(0, 6);

  const maxValue = Math.max(...barChartData.map((item) => item.total), 0);
  const chartWidth = screenWidth - 88;
  const chartHeight = 260;
  const barWidth = 40;
  const barSpacing =
    (chartWidth - barWidth * barChartData.length) / (barChartData.length + 1);

  // Calcular ângulos e posições para o gráfico de pizza
  const calculatePieData = () => {
    const total = pieChartData.reduce((sum, item) => sum + item.population, 0);
    let currentAngle = -90; // Começar do topo

    return pieChartData.map((item) => {
      const percentage = (item.population / total) * 100;
      const angle = (item.population / total) * 360;
      const middleAngle = currentAngle + angle / 2;
      const radians = (middleAngle * Math.PI) / 180;

      // Centro do gráfico
      const centerX = (screenWidth - 48) / 2;
      const centerY = 110;
      const radius = 80;
      const labelRadius = radius + 25; // Distância do label reduzida de 35 para 25

      // Posição do ponto na borda do círculo
      const pointX = centerX + Math.cos(radians) * radius;
      const pointY = centerY + Math.sin(radians) * radius;

      // Posição do label
      const labelX = centerX + Math.cos(radians) * labelRadius;
      const labelY = centerY + Math.sin(radians) * labelRadius;

      currentAngle += angle;

      return {
        ...item,
        percentage,
        pointX,
        pointY,
        labelX,
        labelY,
        isRightSide: labelX > centerX,
      };
    });
  };

  const pieDataWithPositions = calculatePieData();

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
        {/* Filtros de Período */}
        <View style={styles.filtersContainer}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor:
                  periodFilter === 'last7days' ? theme.primary : theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
            onPress={() => setPeriodFilter('last7days')}
          >
            <Text
              style={[
                styles.filterButtonText,
                {
                  color:
                    periodFilter === 'last7days'
                      ? theme.background
                      : theme.text,
                },
              ]}
            >
              Últimos 7 dias
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor:
                  periodFilter === 'last15days' ? theme.primary : theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
            onPress={() => setPeriodFilter('last15days')}
          >
            <Text
              style={[
                styles.filterButtonText,
                {
                  color:
                    periodFilter === 'last15days'
                      ? theme.background
                      : theme.text,
                },
              ]}
            >
              Últimos 15 dias
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor:
                  periodFilter === 'month' ? theme.primary : theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
            onPress={() => setPeriodFilter('month')}
          >
            <Text
              style={[
                styles.filterButtonText,
                {
                  color:
                    periodFilter === 'month' ? theme.background : theme.text,
                },
              ]}
            >
              Mês
            </Text>
          </TouchableOpacity>
        </View>

        {/* Seletor de Mês (só aparece quando filtro "Mês" está ativo) */}
        {periodFilter === 'month' && (
          <View style={styles.monthSelectorContainer}>
            <TouchableOpacity
              style={styles.monthArrow}
              onPress={() => {
                const newDate = new Date(selectedMonth);
                newDate.setMonth(newDate.getMonth() - 1);
                setSelectedMonth(newDate);
              }}
            >
              <Text style={[styles.monthArrowText, { color: theme.text }]}>
                ‹
              </Text>
            </TouchableOpacity>

            <Text style={[styles.monthText, { color: theme.text }]}>
              {selectedMonth.toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric',
              })}
            </Text>

            <TouchableOpacity
              style={styles.monthArrow}
              onPress={() => {
                const newDate = new Date(selectedMonth);
                newDate.setMonth(newDate.getMonth() + 1);
                setSelectedMonth(newDate);
              }}
            >
              <Text style={[styles.monthArrowText, { color: theme.text }]}>
                ›
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <>
            {/* Gráfico de Pizza */}
            {categoryExpenses.length > 0 ? (
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
                  <View style={styles.chartHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      Distribuição por Categoria
                    </Text>
                    <TouchableOpacity
                      style={styles.chartTypeButton}
                      onPress={() =>
                        setChartType(chartType === 'pie' ? 'bar' : 'pie')
                      }
                    >
                      {chartType === 'pie' ? (
                        <GraficoBarrasIcon size={24} color={theme.text} />
                      ) : (
                        <GraficoCircularIcon size={24} color={theme.text} />
                      )}
                    </TouchableOpacity>
                  </View>
                  {chartType === 'pie' ? (
                    <View style={styles.chartWrapper}>
                      <View style={{ position: 'relative' }}>
                        {/* Gráfico de pizza base */}
                        <PieChart
                          data={pieChartData}
                          width={screenWidth - 48}
                          height={220}
                          chartConfig={{
                            color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                          }}
                          accessor="population"
                          backgroundColor="transparent"
                          paddingLeft="90"
                          absolute
                          hasLegend={false}
                        />

                        {/* Labels e linhas sobrepostos */}
                        <Svg
                          width={screenWidth - 48}
                          height={220}
                          style={{ position: 'absolute', top: 0, left: 0 }}
                        >
                          {pieDataWithPositions.map((item, index) => (
                            <G key={`label-${index}`}>
                              {/* Linha do ponto até o label */}
                              <Line
                                x1={item.pointX}
                                y1={item.pointY}
                                x2={item.labelX}
                                y2={item.labelY}
                                stroke={item.color}
                                strokeWidth={2}
                              />

                              {/* Linha horizontal curta no final */}
                              <Line
                                x1={item.labelX}
                                y1={item.labelY}
                                x2={
                                  item.isRightSide
                                    ? item.labelX + 15
                                    : item.labelX - 15
                                }
                                y2={item.labelY}
                                stroke={item.color}
                                strokeWidth={2}
                              />

                              {/* Label com valor */}
                              <SvgText
                                x={
                                  item.isRightSide
                                    ? item.labelX + 20
                                    : item.labelX - 20
                                }
                                y={item.labelY + 5}
                                fontSize={13}
                                fontFamily="CormorantGaramond-SemiBold"
                                fill={theme.text}
                                textAnchor={item.isRightSide ? 'start' : 'end'}
                              >
                                {formatCurrency(item.population)}
                              </SvgText>
                            </G>
                          ))}
                        </Svg>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.chartWrapper}>
                      <Svg width={chartWidth} height={chartHeight + 60}>
                        {/* Linhas de grade horizontais */}
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <Rect
                            key={`grid-${i}`}
                            x={0}
                            y={(chartHeight / 5) * i + 10}
                            width={chartWidth}
                            height={1}
                            fill={
                              theme.background === '#000'
                                ? 'rgba(255, 255, 255, 0.15)'
                                : 'rgba(0, 0, 0, 0.15)'
                            }
                          />
                        ))}

                        {/* Barras */}
                        {barChartData.map((item, index) => {
                          const categoryInfo = CATEGORIES[item.category];
                          const barHeight =
                            maxValue > 0
                              ? (item.total / maxValue) * (chartHeight - 20)
                              : 0;
                          const x =
                            barSpacing + index * (barWidth + barSpacing);
                          const y = chartHeight - barHeight + 10;

                          return (
                            <React.Fragment key={`bar-${index}`}>
                              {/* Barra */}
                              <Rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                fill={categoryInfo.color}
                                rx={4}
                                ry={4}
                              />
                              {/* Valor acima da barra */}
                              <SvgText
                                x={x + barWidth / 2}
                                y={y - 8}
                                fontSize={14}
                                fontFamily="CormorantGaramond-SemiBold"
                                fill={theme.text}
                                textAnchor="middle"
                              >
                                {formatCurrency(item.total)}
                              </SvgText>
                              {/* Label abaixo */}
                              <SvgText
                                x={x + barWidth / 2}
                                y={chartHeight + 30}
                                fontSize={13}
                                fontFamily="CormorantGaramond-Regular"
                                fill={theme.text}
                                textAnchor="middle"
                              >
                                {item.subcategory.substring(0, 8)}
                              </SvgText>
                            </React.Fragment>
                          );
                        })}
                      </Svg>
                    </View>
                  )}

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
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: theme.text, marginBottom: 16 },
                    ]}
                  >
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
  filtersContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  monthSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  monthArrow: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthArrowText: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Bold',
  },
  monthText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    textTransform: 'capitalize',
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
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTypeButton: {
    padding: 8,
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
