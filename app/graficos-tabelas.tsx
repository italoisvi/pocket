import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { PieChart } from 'react-native-chart-kit';
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import { CategoryIcon } from '@/components/CategoryIcon';
import { GraficoCircularIcon } from '@/components/GraficoCircularIcon';
import { GraficoBarrasIcon } from '@/components/GraficoBarrasIcon';
import { ComparacaoSetaIcon } from '@/components/ComparacaoSetaIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

const screenWidth = Dimensions.get('window').width;

type CategoryExpenseData = {
  category: ExpenseCategory;
  total: number;
  previousTotal?: number; // Total do periodo anterior para comparacao
  change?: number; // Variacao percentual
};

type PeriodFilter = 'last7days' | 'last15days' | 'month';
type ChartType = 'pie' | 'bar';

export default function GraficosTabelasScreen() {
  const { theme } = useTheme();
  const [categoryExpenses, setCategoryExpenses] = useState<
    CategoryExpenseData[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [chartType, setChartType] = useState<ChartType>('pie');
  const [availableMonths, setAvailableMonths] = useState<Date[]>([]);
  const [monthsOfUsage, setMonthsOfUsage] = useState(0); // Quantos meses o usuário usa o app
  const monthScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Gerar meses disponíveis baseado na data de criação do usuário
    const generateMonths = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Buscar data de criação do perfil
        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', user.id)
          .maybeSingle();

        const today = new Date();
        let startDate: Date;

        if (profile?.created_at) {
          // Começar do mês de criação do perfil
          const createdAt = new Date(profile.created_at);
          startDate = new Date(
            createdAt.getFullYear(),
            createdAt.getMonth(),
            1
          );
        } else {
          // Se não tem created_at, começar do mês atual
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }

        // Gerar meses desde a criação até hoje
        const months: Date[] = [];
        const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        let iterDate = new Date(startDate);
        while (iterDate <= currentMonth) {
          months.push(new Date(iterDate));
          iterDate.setMonth(iterDate.getMonth() + 1);
        }

        setAvailableMonths(months);

        // Calcular quantos meses o usuário usa o app
        const monthsDiff =
          (today.getFullYear() - startDate.getFullYear()) * 12 +
          (today.getMonth() - startDate.getMonth()) +
          1; // +1 porque o mês de criação conta como 1
        setMonthsOfUsage(monthsDiff);
      } catch (error) {
        console.error('Erro ao gerar meses disponíveis:', error);
        // Fallback: apenas mês atual
        setAvailableMonths([new Date()]);
      }
    };

    generateMonths();
  }, []);

  // Scroll para o mês atual quando a tela ganhar foco ou quando availableMonths mudar
  useFocusEffect(
    useCallback(() => {
      if (periodFilter === 'month' && availableMonths.length > 0) {
        const currentMonthIndex = availableMonths.findIndex(
          (month) =>
            month.getMonth() === new Date().getMonth() &&
            month.getFullYear() === new Date().getFullYear()
        );
        if (currentMonthIndex !== -1 && monthScrollRef.current) {
          // Delay maior para garantir que o layout está pronto
          setTimeout(() => {
            monthScrollRef.current?.scrollTo({
              x: currentMonthIndex * 88,
              animated: false, // Changed to false for immediate scroll
            });
          }, 300);
        }
      }
    }, [availableMonths, periodFilter])
  );

  // Adicional: scroll quando o periodFilter mudar para 'month'
  useEffect(() => {
    if (periodFilter === 'month' && availableMonths.length > 0) {
      const currentMonthIndex = availableMonths.findIndex(
        (month) =>
          month.getMonth() === new Date().getMonth() &&
          month.getFullYear() === new Date().getFullYear()
      );
      if (currentMonthIndex !== -1) {
        setTimeout(() => {
          monthScrollRef.current?.scrollTo({
            x: currentMonthIndex * 88,
            animated: true,
          });
        }, 100);
      }
    }
  }, [periodFilter, availableMonths]);

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
      let prevStartDate: Date;
      let prevEndDate: Date;
      const now = new Date();

      switch (periodFilter) {
        case 'last7days':
          endDate = now;
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 6);
          // Periodo anterior: 7 dias antes
          prevEndDate = new Date(startDate);
          prevEndDate.setDate(prevEndDate.getDate() - 1);
          prevStartDate = new Date(prevEndDate);
          prevStartDate.setDate(prevStartDate.getDate() - 6);
          break;
        case 'last15days':
          endDate = now;
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 14);
          // Periodo anterior: 15 dias antes
          prevEndDate = new Date(startDate);
          prevEndDate.setDate(prevEndDate.getDate() - 1);
          prevStartDate = new Date(prevEndDate);
          prevStartDate.setDate(prevStartDate.getDate() - 14);
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
          // Periodo anterior: mes anterior
          prevStartDate = new Date(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth() - 1,
            1
          );
          prevEndDate = new Date(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth(),
            0
          );
          break;
      }

      // Buscar expenses MANUAIS do periodo atual
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, subcategory')
        .eq('user_id', user.id)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);

      // Buscar expenses MANUAIS do periodo anterior para comparacao
      const { data: prevExpensesData } = await supabase
        .from('expenses')
        .select('amount, category, subcategory')
        .eq('user_id', user.id)
        .gte('date', prevStartDate.toISOString().split('T')[0])
        .lte('date', prevEndDate.toISOString().split('T')[0]);

      // Buscar contas do usuario para transacoes do extrato
      const { data: accounts } = await supabase
        .from('pluggy_accounts')
        .select('id')
        .eq('user_id', user.id);

      let extractTransactions: any[] = [];
      let prevExtractTransactions: any[] = [];

      if (accounts && accounts.length > 0) {
        const accountIds = accounts.map((a: any) => a.id);

        // Buscar transacoes categorizadas do extrato
        const { data: categorizedTx } = await supabase
          .from('transaction_categories')
          .select(
            `
            category,
            subcategory,
            pluggy_transactions!inner(
              amount,
              date,
              account_id,
              type
            )
          `
          )
          .eq('user_id', user.id);

        if (categorizedTx) {
          // Filtrar por periodo atual e contas (apenas DEBIT = saidas)
          extractTransactions = categorizedTx.filter((tx: any) => {
            const txDate = tx.pluggy_transactions?.date;
            const txAccountId = tx.pluggy_transactions?.account_id;
            const txType = tx.pluggy_transactions?.type;
            if (!txDate || !txAccountId) return false;
            if (!accountIds.includes(txAccountId)) return false;
            if (txType !== 'DEBIT') return false;
            const date = new Date(txDate);
            return date >= startDate && date <= endDate;
          });

          // Filtrar por periodo anterior
          prevExtractTransactions = categorizedTx.filter((tx: any) => {
            const txDate = tx.pluggy_transactions?.date;
            const txAccountId = tx.pluggy_transactions?.account_id;
            const txType = tx.pluggy_transactions?.type;
            if (!txDate || !txAccountId) return false;
            if (!accountIds.includes(txAccountId)) return false;
            if (txType !== 'DEBIT') return false;
            const date = new Date(txDate);
            return date >= prevStartDate && date <= prevEndDate;
          });
        }
      }

      // Agrupar periodo anterior por CATEGORIA (consolidado)
      const prevCategoryMap = new Map<ExpenseCategory, number>();

      // Processar expenses manuais do periodo anterior
      if (prevExpensesData) {
        prevExpensesData.forEach((exp) => {
          const category = (exp.category as ExpenseCategory) || 'outros';
          prevCategoryMap.set(
            category,
            (prevCategoryMap.get(category) || 0) + exp.amount
          );
        });
      }

      // Processar extrato do periodo anterior
      prevExtractTransactions.forEach((tx: any) => {
        const category = (tx.category as ExpenseCategory) || 'outros';
        const amount = Math.abs(tx.pluggy_transactions?.amount || 0);
        prevCategoryMap.set(
          category,
          (prevCategoryMap.get(category) || 0) + amount
        );
      });

      // Agrupar periodo atual por CATEGORIA (consolidado)
      const categoryMap = new Map<ExpenseCategory, number>();

      // Processar expenses manuais do periodo atual
      if (expensesData) {
        expensesData.forEach((exp) => {
          const category = (exp.category as ExpenseCategory) || 'outros';
          categoryMap.set(
            category,
            (categoryMap.get(category) || 0) + exp.amount
          );
        });
      }

      // Processar transacoes do extrato do periodo atual
      extractTransactions.forEach((tx: any) => {
        const category = (tx.category as ExpenseCategory) || 'outros';
        const amount = Math.abs(tx.pluggy_transactions?.amount || 0);
        categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
      });

      // Calcular total combinado
      const total = Array.from(categoryMap.values()).reduce(
        (sum, amount) => sum + amount,
        0
      );
      setTotalExpenses(total);

      // Criar array de categorias com change
      const categories: CategoryExpenseData[] = Array.from(
        categoryMap.entries()
      ).map(([category, currentTotal]) => {
        const previousTotal = prevCategoryMap.get(category) || 0;
        const change =
          previousTotal > 0
            ? ((currentTotal - previousTotal) / previousTotal) * 100
            : currentTotal > 0
              ? 100
              : 0;

        return {
          category,
          total: currentTotal,
          previousTotal,
          change,
        };
      });

      setCategoryExpenses(categories.sort((a, b) => b.total - a.total));
    } catch (error) {
      console.error('Erro ao carregar gastos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Preparar dados para os gráficos
  const pieChartData = categoryExpenses.map((item) => {
    const categoryInfo = CATEGORIES[item.category] || {
      name: item.category,
      color: '#B0BEC5', // Cor cinza padrão para categorias desconhecidas
      icon: 'outros',
    };

    return {
      name: categoryInfo.name,
      population: item.total,
      color: categoryInfo.color,
      legendFontColor: '#666',
      legendFontSize: 0,
    };
  });

  // Mostrar todas as categorias no gráfico de barras com scroll
  const barChartData = categoryExpenses;

  const maxValue = Math.max(...barChartData.map((item) => item.total), 0);
  const chartHeight = 260;
  const barWidth = 60;
  const barSpacing = 30;
  const chartWidth = Math.max(
    screenWidth - 88,
    barChartData.length * (barWidth + barSpacing) + barSpacing
  );

  // Calcular ângulos e posições para o gráfico de pizza
  const calculatePieData = () => {
    const total = pieChartData.reduce((sum, item) => sum + item.population, 0);
    let currentAngle = -90; // Começar do topo
    const centerX = (screenWidth - 48) / 2;
    const centerY = 110;
    const radius = 80;
    const labelRadius = radius + 30;
    const minLabelDistance = 25;

    const positions = pieChartData.map((item, index) => {
      const percentage = (item.population / total) * 100;
      const angle = (item.population / total) * 360;
      const middleAngle = currentAngle + angle / 2;
      const radians = (middleAngle * Math.PI) / 180;

      // Posição do ponto na borda do círculo
      const pointX = centerX + Math.cos(radians) * radius;
      const pointY = centerY + Math.sin(radians) * radius;

      // Posição inicial da label
      const labelX = centerX + Math.cos(radians) * labelRadius;
      const labelY = centerY + Math.sin(radians) * labelRadius;
      const isRightSide = labelX > centerX;

      currentAngle += angle;

      return {
        ...item,
        percentage,
        pointX,
        pointY,
        labelX,
        labelY,
        isRightSide,
        index,
      };
    });

    // Separar por lado e ordenar por Y
    const leftSide = positions
      .filter((p) => !p.isRightSide)
      .sort((a, b) => a.labelY - b.labelY);
    const rightSide = positions
      .filter((p) => p.isRightSide)
      .sort((a, b) => a.labelY - b.labelY);

    // Distribuir labels igualmente no espaço disponível
    const distributeLabels = (labels: any[], side: 'left' | 'right') => {
      if (labels.length === 0) return;

      const minY = 30;
      const maxY = 190;
      const availableSpace = maxY - minY;
      const spacing =
        labels.length > 1 ? availableSpace / (labels.length - 1) : 0;

      labels.forEach((label, i) => {
        // Distribuir igualmente no espaço vertical
        label.labelY = minY + i * spacing;

        // Manter X fixo para cada lado
        label.labelX =
          side === 'right' ? centerX + labelRadius : centerX - labelRadius;
      });
    };

    distributeLabels(leftSide, 'left');
    distributeLabels(rightSide, 'right');

    // Recombinar mantendo a ordem original
    return [...leftSide, ...rightSide].sort((a, b) => a.index - b.index);
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
        <TouchableOpacity
          style={styles.compareButton}
          onPress={() => router.push('/analises-walts')}
        >
          <ComparacaoSetaIcon size={24} color={theme.primary} />
        </TouchableOpacity>
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
          <ScrollView
            ref={monthScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthsScroll}
            contentContainerStyle={styles.monthsScrollContent}
          >
            {availableMonths.map((month) => {
              const isSelected =
                month.getMonth() === selectedMonth.getMonth() &&
                month.getFullYear() === selectedMonth.getFullYear();
              const monthLabel = month.toLocaleDateString('pt-BR', {
                month: 'short',
                year: '2-digit',
              });
              const formattedLabel =
                monthLabel.charAt(0).toUpperCase() +
                monthLabel.slice(1).replace('.', '');

              return (
                <TouchableOpacity
                  key={month.toISOString()}
                  style={[
                    styles.monthButton,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.card,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                  onPress={() => setSelectedMonth(month)}
                >
                  <Text
                    style={[
                      styles.monthButtonText,
                      {
                        color: isSelected ? theme.background : theme.text,
                      },
                    ]}
                  >
                    {formattedLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <View
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <LoadingKangaroo size={80} />
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
                      {/* Gráfico de pizza limpo sem labels */}
                      <PieChart
                        data={pieChartData}
                        width={screenWidth - 48}
                        height={220}
                        chartConfig={{
                          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                        }}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="75"
                        absolute
                        hasLegend={false}
                      />
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={true}
                      style={styles.barChartScrollView}
                    >
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
                          const categoryInfo = CATEGORIES[item.category] || {
                            name: item.category,
                            color: '#B0BEC5',
                            icon: 'outros',
                          };
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
                                {categoryInfo.name.length > 10
                                  ? categoryInfo.name.substring(0, 10) + '...'
                                  : categoryInfo.name}
                              </SvgText>
                            </React.Fragment>
                          );
                        })}
                      </Svg>
                    </ScrollView>
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
                      const columns = [];
                      for (let i = 0; i < categoryExpenses.length; i += 3) {
                        columns.push(categoryExpenses.slice(i, i + 3));
                      }

                      return columns.map((column, colIndex) => (
                        <View
                          key={`column-${colIndex}`}
                          style={styles.legendColumn}
                        >
                          {column.map((item) => {
                            const categoryInfo = CATEGORIES[item.category] || {
                              name: item.category,
                              color: '#B0BEC5',
                              icon: 'outros',
                            };
                            const percentage =
                              totalExpenses > 0
                                ? (item.total / totalExpenses) * 100
                                : 0;

                            return (
                              <View
                                key={item.category}
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
                                    {categoryInfo.name}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.legendSubtext,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
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
                        styles.tableHeaderCategory,
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
                  </View>

                  {categoryExpenses.map((item) => {
                    const categoryInfo = CATEGORIES[item.category] || {
                      name: item.category,
                      color: '#B0BEC5',
                      icon: 'outros',
                    };

                    // Determinar cor e icone da variacao
                    // Só mostrar comparação se o usuário estiver pelo menos no 2º mês
                    const canShowComparison = monthsOfUsage >= 2;
                    const hasChange =
                      canShowComparison &&
                      item.change !== undefined &&
                      item.previousTotal !== undefined;
                    const isIncrease = hasChange && item.change! > 0;
                    const isDecrease = hasChange && item.change! < 0;
                    const changeColor = isIncrease
                      ? '#ef4444'
                      : isDecrease
                        ? '#10b981'
                        : theme.textSecondary;

                    return (
                      <View
                        key={item.category}
                        style={[
                          styles.tableRow,
                          { borderBottomColor: theme.border },
                        ]}
                      >
                        <View style={styles.tableCategoryCell}>
                          <CategoryIcon categoryInfo={categoryInfo} size={20} />
                          <Text
                            style={[styles.categoryName, { color: theme.text }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {categoryInfo.name}
                          </Text>
                        </View>
                        <View style={styles.tableValueCell}>
                          <Text
                            style={[styles.tableCell, { color: theme.text }]}
                          >
                            {formatCurrency(item.total)}
                          </Text>
                          {hasChange && item.change !== 0 && (
                            <Text
                              style={[
                                styles.changeIndicator,
                                { color: changeColor },
                              ]}
                            >
                              {isIncrease ? '↑' : '↓'}{' '}
                              {Math.abs(item.change!).toFixed(0)}%
                            </Text>
                          )}
                        </View>
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
  compareButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
  monthsScroll: {
    marginBottom: 24,
  },
  monthsScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
  },
  monthButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 8,
  },
  monthButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
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
  barChartScrollView: {
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
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'right',
  },
  tableHeaderCategory: {
    flex: 1,
    textAlign: 'left',
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
  categoryName: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  tableCell: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'right',
  },
  tableValueCell: {
    flex: 1,
    alignItems: 'flex-end',
  },
  changeIndicator: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginTop: 2,
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
