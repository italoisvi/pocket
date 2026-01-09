import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PieChart } from 'react-native-chart-kit';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import Markdown from 'react-native-markdown-display';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { GraficoCircularIcon } from '@/components/GraficoCircularIcon';
import { GraficoBarrasIcon } from '@/components/GraficoBarrasIcon';
import { useTheme } from '@/lib/theme';
import { categorizeExpense, CATEGORIES } from '@/lib/categories';

const screenWidth = Dimensions.get('window').width;

type ComparisonType =
  | null
  | 'renda-custos'
  | 'renda-fixos'
  | 'renda-variaveis'
  | 'renda-orcamentos'
  | 'renda-custos-orcamentos';

type ComparisonData = {
  renda: number;
  custosFixos: number;
  custosVariaveis: number;
  dividas: number;
  investimentos: number;
  orcamentos: number;
  saldoRestante: number;
};

type ChartType = 'pie' | 'bar';

export default function AnalisesWaltsScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [comparisonType, setComparisonType] = useState<ComparisonType>(null);
  const [chartType, setChartType] = useState<ChartType>('pie');
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(
    null
  );
  const [waltsInsights, setWaltsInsights] = useState<string>('');

  useEffect(() => {
    loadSavedState();
  }, []);

  // Recarregar dados sempre que a tela ganhar foco (para refletir mudanças do Open Finance)
  useFocusEffect(
    useCallback(() => {
      setWaltsInsights('');
      loadComparisonData();
    }, [])
  );

  // Carregar estado salvo
  const loadSavedState = async () => {
    try {
      const savedType = await AsyncStorage.getItem(
        '@analises_walts_comparison_type'
      );
      const savedChartType = await AsyncStorage.getItem(
        '@analises_walts_chart_type'
      );

      if (savedType) {
        setComparisonType(savedType as ComparisonType);
      }
      if (savedChartType) {
        setChartType(savedChartType as ChartType);
      }
    } catch (error) {
      console.error('Erro ao carregar estado salvo:', error);
    }
  };

  // Salvar estado quando mudar
  useEffect(() => {
    if (comparisonType) {
      AsyncStorage.setItem(
        '@analises_walts_comparison_type',
        comparisonType
      ).catch(console.error);
    }
  }, [comparisonType]);

  useEffect(() => {
    AsyncStorage.setItem('@analises_walts_chart_type', chartType).catch(
      console.error
    );
  }, [chartType]);

  const loadComparisonData = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Buscar dados do perfil (renda)
      const { data: profile } = await supabase
        .from('profiles')
        .select('income_cards, monthly_salary')
        .eq('id', user.id)
        .single();

      // Calcular renda total
      let totalIncome = 0;
      if (profile?.income_cards && Array.isArray(profile.income_cards)) {
        totalIncome = profile.income_cards.reduce((sum: number, card: any) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);
      }
      if (totalIncome === 0 && profile?.monthly_salary) {
        totalIncome = profile.monthly_salary;
      }

      // Buscar gastos do mês atual
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, subcategory')
        .eq('user_id', user.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0]);

      // Buscar transações do Open Finance
      const { data: openFinanceTransactions } = await supabase
        .from('pluggy_transactions')
        .select('description, amount, date, type')
        .eq('user_id', user.id)
        .eq('type', 'DEBIT')
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0]);

      // Categorizar gastos por tipo
      let custosFixos = 0;
      let custosVariaveis = 0;
      let dividas = 0;
      let investimentos = 0;
      let totalGastos = 0;

      // Somar gastos de expenses (comprovantes)
      if (expensesData) {
        expensesData.forEach((exp) => {
          totalGastos += exp.amount; // Somar no total de gastos

          // Obter informações da categoria
          const categoryInfo = exp.category
            ? CATEGORIES[exp.category as keyof typeof CATEGORIES]
            : undefined;
          if (!categoryInfo) {
            custosVariaveis += exp.amount;
            return;
          }

          // Classificar por tipo
          switch (categoryInfo.type) {
            case 'essencial':
              custosFixos += exp.amount;
              break;
            case 'nao_essencial':
              custosVariaveis += exp.amount;
              break;
            case 'divida':
              dividas += exp.amount;
              break;
            case 'investimento':
              investimentos += exp.amount;
              break;
            default:
              custosVariaveis += exp.amount;
          }
        });
      }

      // Somar gastos do Open Finance (transações DEBIT)
      if (openFinanceTransactions) {
        openFinanceTransactions.forEach((tx) => {
          const amount = Math.abs(tx.amount);
          totalGastos += amount; // Somar no total de gastos

          const { category } = categorizeExpense(tx.description);

          // Obter informações da categoria
          const categoryInfo = CATEGORIES[category];
          if (!categoryInfo) {
            custosVariaveis += amount;
            return;
          }

          // Classificar por tipo
          switch (categoryInfo.type) {
            case 'essencial':
              custosFixos += amount;
              break;
            case 'nao_essencial':
              custosVariaveis += amount;
              break;
            case 'divida':
              dividas += amount;
              break;
            case 'investimento':
              investimentos += amount;
              break;
            default:
              custosVariaveis += amount;
          }
        });
      }

      // Buscar orçamentos
      const { data: budgetsData } = await supabase
        .from('budgets')
        .select('amount')
        .eq('user_id', user.id);

      const totalBudgets = budgetsData
        ? budgetsData.reduce((sum, b) => sum + Number(b.amount), 0)
        : 0;

      // Saldo = Renda Total - TODOS os gastos (igual à Home)
      const saldoRestante = totalIncome - totalGastos;

      setComparisonData({
        renda: totalIncome,
        custosFixos,
        custosVariaveis,
        dividas,
        investimentos,
        orcamentos: totalBudgets,
        saldoRestante,
      });
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!comparisonData || !comparisonType) return;

    try {
      setAnalyzing(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Carregar contexto completo do usuário (igual ao chat)
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, monthly_salary, income_cards')
        .eq('id', user.id)
        .maybeSingle();

      // Calcular renda total
      let totalIncome = 0;
      if (profile?.income_cards && Array.isArray(profile.income_cards)) {
        totalIncome = profile.income_cards.reduce((sum: number, card: any) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);
      }
      if (totalIncome === 0 && profile?.monthly_salary) {
        totalIncome = profile.monthly_salary;
      }

      // Buscar gastos do mês atual
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: expenses } = await supabase
        .from('expenses')
        .select('establishment_name, amount, category, subcategory, date')
        .eq('user_id', user.id)
        .gte('created_at', firstDayOfMonth.toISOString())
        .order('created_at', { ascending: false });

      // Buscar transações Open Finance
      const { data: openFinanceTransactions } = await supabase
        .from('pluggy_transactions')
        .select('description, amount, date, type, status')
        .eq('user_id', user.id)
        .gte('date', firstDayOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false });

      // Buscar contas Open Finance
      const { data: openFinanceAccounts } = await supabase
        .from('pluggy_accounts')
        .select(
          'id, name, type, subtype, balance, credit_limit, available_credit_limit'
        )
        .eq('user_id', user.id);

      // Categorizar gastos
      const categoryBreakdown: { [key: string]: number } = {};
      const essentialExpenses: { [key: string]: number } = {};
      const nonEssentialExpenses: { [key: string]: number } = {};

      if (expenses) {
        expenses.forEach((exp) => {
          const category = exp.category || 'Outros';
          const subcategory = exp.subcategory || 'Outros';
          categoryBreakdown[category] =
            (categoryBreakdown[category] || 0) + exp.amount;

          const categoryInfo =
            CATEGORIES[exp.category as keyof typeof CATEGORIES];
          if (categoryInfo) {
            const key = `${categoryInfo.name} - ${subcategory}`;
            if (categoryInfo.type === 'essencial') {
              essentialExpenses[key] =
                (essentialExpenses[key] || 0) + exp.amount;
            } else {
              nonEssentialExpenses[key] =
                (nonEssentialExpenses[key] || 0) + exp.amount;
            }
          }
        });
      }

      let comparisonDescription = '';
      switch (comparisonType) {
        case 'renda-custos':
          comparisonDescription = 'Renda X Custos Fixos e Variáveis';
          break;
        case 'renda-fixos':
          comparisonDescription = 'Renda X Custos Fixos';
          break;
        case 'renda-variaveis':
          comparisonDescription = 'Renda X Custos Variáveis';
          break;
        case 'renda-orcamentos':
          comparisonDescription = 'Renda X Orçamentos';
          break;
        case 'renda-custos-orcamentos':
          comparisonDescription = 'Renda X Custos X Orçamentos';
          break;
      }

      const prompt = `Analise minha situação financeira focando em: ${comparisonDescription}

📊 DADOS FINANCEIROS COMPLETOS:
• Renda Total: ${formatCurrency(totalIncome)}
• Custos Fixos (Essenciais): ${formatCurrency(comparisonData.custosFixos)} (${totalIncome > 0 ? ((comparisonData.custosFixos / totalIncome) * 100).toFixed(1) : '0'}% da renda)
• Custos Variáveis (Não essenciais): ${formatCurrency(comparisonData.custosVariaveis)} (${totalIncome > 0 ? ((comparisonData.custosVariaveis / totalIncome) * 100).toFixed(1) : '0'}% da renda)
• Orçamentos Planejados: ${formatCurrency(comparisonData.orcamentos)}
• Saldo Restante: ${formatCurrency(comparisonData.saldoRestante)} (${totalIncome > 0 ? ((comparisonData.saldoRestante / totalIncome) * 100).toFixed(1) : '0'}% da renda)

💳 CONTEXTO ADICIONAL:
${
  openFinanceAccounts && openFinanceAccounts.length > 0
    ? `
Contas bancárias conectadas:
${openFinanceAccounts.map((acc) => `• ${acc.name} (${acc.type}): ${acc.balance ? formatCurrency(acc.balance) : 'N/A'}`).join('\n')}
`
    : ''
}

${
  Object.keys(essentialExpenses).length > 0
    ? `
Detalhamento Gastos Essenciais:
${Object.entries(essentialExpenses)
  .slice(0, 10)
  .map(([key, value]) => `• ${key}: ${formatCurrency(value)}`)
  .join('\n')}
`
    : ''
}

${
  Object.keys(nonEssentialExpenses).length > 0
    ? `
Detalhamento Gastos Não Essenciais:
${Object.entries(nonEssentialExpenses)
  .slice(0, 10)
  .map(([key, value]) => `• ${key}: ${formatCurrency(value)}`)
  .join('\n')}
`
    : ''
}

Forneça uma análise ESPECÍFICA sobre ${comparisonDescription}:
1. Como estou gastando em relação à minha renda
2. Se os valores estão adequados (use as regras 50-30-20 como referência)
3. Pontos de atenção e alertas
4. Recomendações práticas e ACIONÁVEIS

Seja direto, objetivo e use markdown para destacar pontos importantes.`;

      const session = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/walts-analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Walts Analysis] Error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(
          `Erro ${response.status}: ${errorText || response.statusText}`
        );
      }

      const { analysis } = await response.json();
      setWaltsInsights(analysis);
    } catch (error) {
      console.error('Erro ao analisar:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      setWaltsInsights(
        `Desculpe, não foi possível gerar a análise no momento.\n\n**Erro:** ${errorMessage}\n\nVerifique:\n- Se a Edge Function está configurada corretamente\n- Se a variável DEEPSEEK_API_KEY está definida no Supabase\n- Os logs da função no painel do Supabase`
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // Preparar dados baseado no tipo de comparação
  const getChartData = () => {
    if (!comparisonData || !comparisonType) return { pieData: [], barData: [] };

    let pieData: any[] = [];
    let barData: any[] = [];

    switch (comparisonType) {
      case 'renda-custos':
        pieData = [
          {
            name: 'Custos Fixos',
            population: comparisonData.custosFixos,
            color: '#FF6B6B',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Custos Variáveis',
            population: comparisonData.custosVariaveis,
            color: '#FFD93D',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Saldo',
            population: Math.max(
              0,
              comparisonData.renda -
                comparisonData.custosFixos -
                comparisonData.custosVariaveis
            ),
            color: '#4ECDC4',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
        ].filter((item) => item.population > 0); // Remover itens com valor zero
        barData = [
          { label: 'Renda', value: comparisonData.renda, color: '#4ECDC4' },
          {
            label: 'Fixos',
            value: comparisonData.custosFixos,
            color: '#FF6B6B',
          },
          {
            label: 'Variáveis',
            value: comparisonData.custosVariaveis,
            color: '#FFD93D',
          },
        ].filter((item) => item.value > 0); // Remover itens com valor zero
        break;

      case 'renda-fixos':
        pieData = [
          {
            name: 'Custos Fixos',
            population: comparisonData.custosFixos,
            color: '#FF6B6B',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Saldo Após Fixos',
            population: Math.max(
              0,
              comparisonData.renda - comparisonData.custosFixos
            ),
            color: '#4ECDC4',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
        ];
        barData = [
          { label: 'Renda', value: comparisonData.renda, color: '#4ECDC4' },
          {
            label: 'Fixos',
            value: comparisonData.custosFixos,
            color: '#FF6B6B',
          },
        ];
        break;

      case 'renda-variaveis':
        pieData = [
          {
            name: 'Custos Variáveis',
            population: comparisonData.custosVariaveis,
            color: '#FFD93D',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Saldo Após Variáveis',
            population: Math.max(
              0,
              comparisonData.renda - comparisonData.custosVariaveis
            ),
            color: '#4ECDC4',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
        ];
        barData = [
          { label: 'Renda', value: comparisonData.renda, color: '#4ECDC4' },
          {
            label: 'Variáveis',
            value: comparisonData.custosVariaveis,
            color: '#FFD93D',
          },
        ];
        break;

      case 'renda-orcamentos':
        pieData = [
          {
            name: 'Orçamentos',
            population: comparisonData.orcamentos,
            color: '#A8D8EA',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Saldo Após Orçamentos',
            population: Math.max(
              0,
              comparisonData.renda - comparisonData.orcamentos
            ),
            color: '#4ECDC4',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
        ];
        barData = [
          { label: 'Renda', value: comparisonData.renda, color: '#4ECDC4' },
          {
            label: 'Orçamentos',
            value: comparisonData.orcamentos,
            color: '#A8D8EA',
          },
        ];
        break;

      case 'renda-custos-orcamentos':
        pieData = [
          {
            name: 'Custos Fixos',
            population: comparisonData.custosFixos,
            color: '#FF6B6B',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Custos Variáveis',
            population: comparisonData.custosVariaveis,
            color: '#FFD93D',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Orçamentos',
            population: comparisonData.orcamentos,
            color: '#A8D8EA',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
          {
            name: 'Saldo',
            population: Math.max(0, comparisonData.saldoRestante),
            color: '#4ECDC4',
            legendFontColor: '#666',
            legendFontSize: 0,
          },
        ];
        barData = [
          { label: 'Renda', value: comparisonData.renda, color: '#4ECDC4' },
          {
            label: 'Fixos',
            value: comparisonData.custosFixos,
            color: '#FF6B6B',
          },
          {
            label: 'Variáveis',
            value: comparisonData.custosVariaveis,
            color: '#FFD93D',
          },
          {
            label: 'Orçamentos',
            value: comparisonData.orcamentos,
            color: '#A8D8EA',
          },
        ];
        break;
    }

    return { pieData, barData };
  };

  const { pieData, barData } = getChartData();

  const maxBarValue = Math.max(...barData.map((d) => d.value), 0);
  const chartHeight = 220;
  const barWidth = 60;
  const barSpacing = 30;
  const chartWidth = Math.max(
    screenWidth - 88,
    barData.length * (barWidth + barSpacing) + barSpacing
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
          Análise Comparativa
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.text }]}>
              Carregando dados...
            </Text>
          </View>
        ) : (
          <>
            {/* Descrição */}
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              Escolha o tipo de comparação que deseja visualizar e obtenha
              insights inteligentes do Walts sobre suas finanças.
            </Text>

            {/* Seletores de Comparação com Scroll Horizontal */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.comparisonScrollView}
              contentContainerStyle={styles.comparisonSelector}
            >
              <TouchableOpacity
                style={[
                  styles.comparisonButton,
                  {
                    backgroundColor:
                      comparisonType === 'renda-custos'
                        ? theme.primary
                        : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={() => {
                  setComparisonType('renda-custos');
                  setWaltsInsights('');
                }}
              >
                <Text
                  style={[
                    styles.comparisonButtonText,
                    {
                      color:
                        comparisonType === 'renda-custos'
                          ? theme.background
                          : theme.text,
                    },
                  ]}
                >
                  Renda X Custos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.comparisonButton,
                  {
                    backgroundColor:
                      comparisonType === 'renda-fixos'
                        ? theme.primary
                        : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={() => {
                  setComparisonType('renda-fixos');
                  setWaltsInsights('');
                }}
              >
                <Text
                  style={[
                    styles.comparisonButtonText,
                    {
                      color:
                        comparisonType === 'renda-fixos'
                          ? theme.background
                          : theme.text,
                    },
                  ]}
                >
                  Renda X Fixos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.comparisonButton,
                  {
                    backgroundColor:
                      comparisonType === 'renda-variaveis'
                        ? theme.primary
                        : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={() => {
                  setComparisonType('renda-variaveis');
                  setWaltsInsights('');
                }}
              >
                <Text
                  style={[
                    styles.comparisonButtonText,
                    {
                      color:
                        comparisonType === 'renda-variaveis'
                          ? theme.background
                          : theme.text,
                    },
                  ]}
                >
                  Renda X Variáveis
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.comparisonButton,
                  {
                    backgroundColor:
                      comparisonType === 'renda-orcamentos'
                        ? theme.primary
                        : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={() => {
                  setComparisonType('renda-orcamentos');
                  setWaltsInsights('');
                }}
              >
                <Text
                  style={[
                    styles.comparisonButtonText,
                    {
                      color:
                        comparisonType === 'renda-orcamentos'
                          ? theme.background
                          : theme.text,
                    },
                  ]}
                >
                  Renda X Orçamentos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.comparisonButton,
                  {
                    backgroundColor:
                      comparisonType === 'renda-custos-orcamentos'
                        ? theme.primary
                        : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={() => {
                  setComparisonType('renda-custos-orcamentos');
                  setWaltsInsights('');
                }}
              >
                <Text
                  style={[
                    styles.comparisonButtonText,
                    {
                      color:
                        comparisonType === 'renda-custos-orcamentos'
                          ? theme.background
                          : theme.text,
                    },
                  ]}
                >
                  Renda X Custos X Orçamentos
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Gráficos (só aparecem após selecionar) */}
            {comparisonType && comparisonData && (
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
                    Visualização
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
                    <PieChart
                      data={pieData}
                      width={screenWidth - 88}
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <Svg width={chartWidth} height={chartHeight + 60}>
                      {/* Linhas de grade */}
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
                      {barData.map((item, index) => {
                        const barHeight =
                          maxBarValue > 0
                            ? (item.value / maxBarValue) * (chartHeight - 20)
                            : 0;
                        const x = barSpacing + index * (barWidth + barSpacing);
                        const y = chartHeight - barHeight + 10;

                        return (
                          <React.Fragment key={`bar-${index}`}>
                            <Rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={barHeight}
                              fill={item.color}
                              rx={4}
                              ry={4}
                            />
                            <SvgText
                              x={x + barWidth / 2}
                              y={y - 8}
                              fontSize={12}
                              fontFamily="CormorantGaramond-SemiBold"
                              fill={theme.text}
                              textAnchor="middle"
                            >
                              {formatCurrency(item.value)}
                            </SvgText>
                            <SvgText
                              x={x + barWidth / 2}
                              y={chartHeight + 30}
                              fontSize={14}
                              fontFamily="CormorantGaramond-Regular"
                              fill={theme.text}
                              textAnchor="middle"
                            >
                              {item.label}
                            </SvgText>
                          </React.Fragment>
                        );
                      })}
                    </Svg>
                  </ScrollView>
                )}

                {/* Legendas */}
                <View style={styles.legendsContainer}>
                  {pieData.map((item, index) => (
                    <View key={index} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendColorBox,
                          { backgroundColor: item.color },
                        ]}
                      />
                      <Text style={[styles.legendText, { color: theme.text }]}>
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.legendValue,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {formatCurrency(item.population)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Insights do Walts (Card separado acima do botão) */}
            {comparisonType && waltsInsights && (
              <View
                style={[
                  styles.insightsCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.insightsTitle, { color: theme.text }]}>
                  💡 Insights do Walts
                </Text>
                <Markdown
                  style={{
                    body: {
                      color: theme.text,
                      fontSize: 16,
                      fontFamily: 'CormorantGaramond-Regular',
                      lineHeight: 24,
                    },
                    heading1: {
                      color: theme.text,
                      fontSize: 22,
                      fontFamily: 'CormorantGaramond-SemiBold',
                      marginBottom: 8,
                    },
                    heading2: {
                      color: theme.text,
                      fontSize: 20,
                      fontFamily: 'CormorantGaramond-SemiBold',
                      marginBottom: 6,
                    },
                    strong: {
                      color: theme.text,
                      fontFamily: 'CormorantGaramond-SemiBold',
                    },
                    bullet_list: {
                      marginBottom: 8,
                    },
                    bullet_list_icon: {
                      color: theme.primary,
                    },
                    code_inline: {
                      backgroundColor:
                        theme.background === '#000'
                          ? 'rgba(255, 255, 255, 0.1)'
                          : 'rgba(0, 0, 0, 0.1)',
                      color: theme.primary,
                      fontFamily: 'monospace',
                      paddingHorizontal: 4,
                      paddingVertical: 2,
                      borderRadius: 4,
                    },
                  }}
                >
                  {waltsInsights}
                </Markdown>
              </View>
            )}

            {/* Botão de Análise (fora do card) */}
            {comparisonType && (
              <TouchableOpacity
                style={[
                  styles.analyzeButton,
                  {
                    backgroundColor: theme.primary,
                    opacity: analyzing ? 0.5 : 1,
                  },
                ]}
                onPress={handleAnalyze}
                disabled={analyzing}
              >
                {analyzing ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <Text
                    style={[
                      styles.analyzeButtonText,
                      { color: theme.background },
                    ]}
                  >
                    {waltsInsights ? 'Atualizar Análise' : 'Análise do Walts'}
                  </Text>
                )}
              </TouchableOpacity>
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
  description: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 24,
    lineHeight: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 16,
  },
  comparisonScrollView: {
    marginBottom: 24,
  },
  comparisonSelector: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 24,
  },
  comparisonButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  comparisonButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
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
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  chartTypeButton: {
    padding: 8,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendsContainer: {
    marginTop: 20,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColorBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  legendValue: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  insightsCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
  },
  insightsTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
  },
  analyzeButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  analyzeButtonText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
