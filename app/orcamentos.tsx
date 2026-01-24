import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { ChevronDownIcon } from '@/components/ChevronDownIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { MaisIcon } from '@/components/MaisIcon';
import { LapisIcon } from '@/components/LapisIcon';
import { LixoIcon } from '@/components/LixoIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { syncEvents } from '@/lib/syncEvents';

type Budget = {
  id: string;
  category_id: ExpenseCategory;
  amount: number;
  period_type: 'monthly' | 'weekly' | 'yearly';
  spent: number;
  notifications_enabled: boolean;
};

type PeriodType = 'monthly' | 'weekly' | 'yearly';

export default function OrcamentosScreen() {
  const { theme, isDark } = useTheme();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);

  // Form state
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBudgets();

    // Escutar eventos de sincronização
    const unsubscribe = syncEvents.subscribe(() => {
      console.log('[Orcamentos] Sync event received, reloading...');
      loadBudgets();
    });

    return () => unsubscribe();
  }, []);

  const loadBudgets = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: budgetsData, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (budgetsData && budgetsData.length > 0) {
        // Calculate spent amount for each budget
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0
        );

        // 1. Buscar gastos MANUAIS
        const { data: expensesData } = await supabase
          .from('expenses')
          .select('amount, category, date')
          .eq('user_id', user.id)
          .gte('date', firstDayOfMonth.toISOString().split('T')[0])
          .lte('date', lastDayOfMonth.toISOString().split('T')[0]);

        // 2. Buscar gastos do EXTRATO BANCÁRIO (transações categorizadas)
        const { data: accounts } = await supabase
          .from('pluggy_accounts')
          .select('id')
          .eq('user_id', user.id);

        let extractExpenses: { amount: number; category: string }[] = [];
        if (accounts && accounts.length > 0) {
          const accountIds = accounts.map((a) => a.id);

          const { data: categorizedTx } = await supabase
            .from('transaction_categories')
            .select(
              `
              category,
              pluggy_transactions!inner(
                amount,
                date,
                account_id
              )
            `
            )
            .eq('user_id', user.id);

          if (categorizedTx) {
            // Filtrar por período e contas
            extractExpenses = categorizedTx
              .filter((tx: any) => {
                const txDate = tx.pluggy_transactions?.date;
                const txAccountId = tx.pluggy_transactions?.account_id;
                if (!txDate || !txAccountId) return false;
                if (!accountIds.includes(txAccountId)) return false;
                const date = new Date(txDate);
                return date >= firstDayOfMonth && date <= lastDayOfMonth;
              })
              .map((tx: any) => ({
                amount: Math.abs(tx.pluggy_transactions?.amount || 0),
                category: tx.category,
              }));
          }
        }

        const budgetsWithSpent = budgetsData.map((budget) => {
          // Somar gastos manuais
          const manualSpent = expensesData
            ? expensesData
                .filter((exp) => exp.category === budget.category_id)
                .reduce((sum, exp) => sum + exp.amount, 0)
            : 0;

          // Somar gastos do extrato
          const extractSpent = extractExpenses
            .filter((exp) => exp.category === budget.category_id)
            .reduce((sum, exp) => sum + exp.amount, 0);

          return {
            id: budget.id,
            category_id: budget.category_id,
            amount: parseFloat(budget.amount),
            period_type: budget.period_type,
            spent: manualSpent + extractSpent,
            notifications_enabled: budget.notifications_enabled,
          };
        });

        setBudgets(budgetsWithSpent);
        setShowCreateForm(false);
      } else {
        // No budgets, show create form
        setShowCreateForm(true);
      }
    } catch (error) {
      console.error('Erro ao carregar orçamentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrencyInput = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    const numberValue = parseFloat(numbers) / 100;

    if (isNaN(numberValue)) return '';

    return numberValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleAmountChange = (text: string) => {
    const formatted = formatCurrencyInput(text);
    setAmount(formatted);
  };

  const getPeriodLabel = (period: PeriodType) => {
    switch (period) {
      case 'weekly':
        return 'Semanal';
      case 'yearly':
        return 'Anual';
      default:
        return 'Mensal';
    }
  };

  const handleCreate = async () => {
    if (!selectedCategory) {
      Alert.alert('Erro', 'Selecione uma categoria');
      return;
    }

    if (
      !amount ||
      parseFloat(amount.replace(/\./g, '').replace(',', '.')) <= 0
    ) {
      Alert.alert('Erro', 'Digite um valor válido');
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Erro', 'Usuário não autenticado');
        return;
      }

      const amountValue = amount.replace(/\./g, '').replace(',', '.');

      const { error } = await supabase.from('budgets').insert({
        user_id: user.id,
        category_id: selectedCategory,
        amount: amountValue,
        period_type: periodType,
        start_date: new Date().toISOString().split('T')[0],
        notifications_enabled: notificationsEnabled,
      });

      if (error) {
        if (error.code === '23505') {
          Alert.alert(
            'Erro',
            'Já existe um orçamento para esta categoria neste período'
          );
        } else {
          throw error;
        }
        return;
      }

      Alert.alert('Sucesso', 'Orçamento criado com sucesso!');

      // Reset form
      setSelectedCategory(null);
      setAmount('');
      setPeriodType('monthly');
      setNotificationsEnabled(true);

      // Reload budgets
      await loadBudgets();
    } catch (error) {
      console.error('Erro ao criar orçamento:', error);
      Alert.alert('Erro', 'Não foi possível criar o orçamento');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async (budgetId: string) => {
    Alert.alert(
      'Excluir Orçamento',
      'Tem certeza que deseja excluir este orçamento?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('budgets')
                .delete()
                .eq('id', budgetId);

              if (error) throw error;

              Alert.alert('Sucesso', 'Orçamento excluído com sucesso!');
              await loadBudgets();
            } catch (error) {
              console.error('Erro ao excluir orçamento:', error);
              Alert.alert('Erro', 'Não foi possível excluir o orçamento');
            }
          },
        },
      ]
    );
  };

  const handleEditBudget = (budget: Budget) => {
    // Navegar para a tela de edição (budget/create.tsx pode ser reutilizada)
    router.push(`/budget/edit/${budget.id}`);
  };

  const toggleBudgetExpansion = (budgetId: string) => {
    setExpandedBudgetId((current) => (current === budgetId ? null : budgetId));
  };

  const categoryList = Object.entries(CATEGORIES)
    .filter(([key]) => key !== 'outros')
    .map(([key, info]) => ({
      key: key as ExpenseCategory,
      name: info.name,
      color: info.color,
    }));

  const renderBudgetCard = (budget: Budget) => {
    const categoryInfo = CATEGORIES[budget.category_id] || CATEGORIES.outros;
    const percentage = (budget.spent / budget.amount) * 100;
    const isOverBudget = percentage > 100;
    const isExpanded = expandedBudgetId === budget.id;

    return (
      <View
        key={budget.id}
        style={[
          styles.budgetCard,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
          },
          getCardShadowStyle(isDark),
        ]}
      >
        <TouchableOpacity
          style={[styles.budgetHeader, isExpanded && { marginBottom: 16 }]}
          onPress={() => toggleBudgetExpansion(budget.id)}
          activeOpacity={0.7}
        >
          <View style={styles.budgetHeaderLeft}>
            <View
              style={[
                styles.categoryIndicator,
                { backgroundColor: categoryInfo.color },
              ]}
            />
            <Text style={[styles.categoryName, { color: theme.text }]}>
              {categoryInfo.name}
            </Text>
          </View>
          <View style={styles.budgetHeaderRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={(e) => {
                e.stopPropagation();
                handleEditBudget(budget);
              }}
            >
              <LapisIcon size={20} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteBudget(budget.id);
              }}
            >
              <LixoIcon size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.budgetContent}>
            <View style={styles.budgetRow}>
              <Text
                style={[styles.budgetLabel, { color: theme.textSecondary }]}
              >
                Gasto
              </Text>
              <Text
                style={[
                  styles.budgetValue,
                  { color: isOverBudget ? '#EF4444' : theme.text },
                ]}
              >
                {formatCurrency(budget.spent)}
              </Text>
            </View>

            <View style={styles.budgetRow}>
              <Text
                style={[styles.budgetLabel, { color: theme.textSecondary }]}
              >
                Limite
              </Text>
              <Text style={[styles.budgetValue, { color: theme.text }]}>
                {formatCurrency(budget.amount)}
              </Text>
            </View>

            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBarBackground,
                  { backgroundColor: theme.border },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(percentage, 100)}%`,
                      backgroundColor: isOverBudget
                        ? '#EF4444'
                        : categoryInfo.color,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.percentageText,
                  { color: isOverBudget ? '#EF4444' : theme.textSecondary },
                ]}
              >
                {percentage.toFixed(1)}%
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderCreateForm = () => (
    <ScrollView style={styles.formContainer}>
      <View style={styles.form}>
        <Text style={[styles.label, { color: theme.text }]}>Categoria *</Text>
        <TouchableOpacity
          style={[
            styles.categoryInput,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            getCardShadowStyle(isDark),
          ]}
          onPress={() => setShowCategoryPicker(!showCategoryPicker)}
        >
          <Text
            style={[
              styles.inputText,
              {
                color: selectedCategory ? theme.text : theme.textSecondary,
              },
            ]}
          >
            {selectedCategory
              ? CATEGORIES[selectedCategory].name
              : 'Selecione uma categoria'}
          </Text>
          {showCategoryPicker ? (
            <ChevronDownIcon size={20} color={theme.textSecondary} />
          ) : (
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          )}
        </TouchableOpacity>

        {showCategoryPicker && (
          <View
            style={[
              styles.categoryPicker,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              getCardShadowStyle(isDark),
            ]}
          >
            <ScrollView style={styles.categoryList}>
              {categoryList.map((category) => (
                <TouchableOpacity
                  key={category.key}
                  style={[
                    styles.categoryItem,
                    {
                      backgroundColor:
                        selectedCategory === category.key
                          ? theme.border
                          : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    setSelectedCategory(category.key);
                    setShowCategoryPicker(false);
                  }}
                >
                  <View
                    style={[
                      styles.categoryColor,
                      { backgroundColor: category.color },
                    ]}
                  />
                  <Text
                    style={[styles.categoryItemName, { color: theme.text }]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={[styles.label, { color: theme.text }]}>
          Valor limite *
        </Text>
        <View
          style={[
            styles.input,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            getCardShadowStyle(isDark),
          ]}
        >
          <Text style={[styles.currencyPrefix, { color: theme.text }]}>R$</Text>
          <TextInput
            style={[styles.inputText, { color: theme.text, flex: 1 }]}
            value={amount}
            onChangeText={handleAmountChange}
            keyboardType="numeric"
            placeholder="0,00"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        <Text style={[styles.label, { color: theme.text }]}>Período *</Text>
        <View style={styles.periodContainer}>
          {(['monthly', 'weekly', 'yearly'] as PeriodType[]).map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                {
                  backgroundColor:
                    periodType === period ? theme.primary : theme.surface,
                  borderColor: theme.border,
                },
                getCardShadowStyle(isDark),
              ]}
              onPress={() => setPeriodType(period)}
            >
              <Text
                style={[
                  styles.periodText,
                  {
                    color:
                      periodType === period ? theme.background : theme.text,
                  },
                ]}
              >
                {getPeriodLabel(period)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.notificationRow}>
          <View style={styles.notificationTextContainer}>
            <Text
              style={[styles.label, { color: theme.text, marginBottom: 0 }]}
            >
              Receber notificações
            </Text>
            <Text
              style={[
                styles.notificationDescription,
                { color: theme.textSecondary },
              ]}
            >
              Alertas quando atingir 80%, 90% e 100% do limite
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{
              false: theme.background === '#000' ? '#333' : '#e0e0e0',
              true: '#f7c359',
            }}
            thumbColor={
              notificationsEnabled
                ? theme.background === '#000'
                  ? '#fff'
                  : '#000'
                : theme.background === '#000'
                  ? '#000'
                  : '#fff'
            }
            ios_backgroundColor={
              theme.background === '#000' ? '#333' : '#e0e0e0'
            }
          />
        </View>
      </View>
    </ScrollView>
  );

  const renderBudgetsList = () => (
    <ScrollView style={styles.budgetsListContainer}>
      {budgets.map((budget) => renderBudgetCard(budget))}
    </ScrollView>
  );

  if (loading) {
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
          <Text style={[styles.title, { color: theme.text }]}>Orçamentos</Text>
          <View style={styles.placeholder} />
        </SafeAreaView>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

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
        <Text style={[styles.title, { color: theme.text }]}>Orçamentos</Text>
        {!showCreateForm && budgets.length > 0 ? (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/budget/create')}
          >
            <MaisIcon size={24} color={theme.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </SafeAreaView>

      {showCreateForm ? renderCreateForm() : renderBudgetsList()}

      {showCreateForm && (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.createButton,
              {
                backgroundColor: theme.primary,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text
                style={[styles.createButtonText, { color: theme.background }]}
              >
                Criar Orçamento
              </Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      )}
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
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  placeholder: {
    width: 40,
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    flex: 1,
    padding: 24,
  },
  budgetsListContainer: {
    flex: 1,
    padding: 24,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  categoryInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  inputText: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
  },
  currencyPrefix: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  categoryPicker: {
    borderRadius: 12,
    borderWidth: 2,
    maxHeight: 300,
    marginTop: 8,
  },
  categoryList: {
    padding: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  categoryColor: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  categoryItemName: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
  },
  periodContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  periodButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  periodText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
  },
  notificationTextContainer: {
    flex: 1,
  },
  notificationDescription: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginTop: 4,
    lineHeight: 20,
  },
  footer: {
    padding: 24,
  },
  createButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
  },
  budgetCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  budgetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  categoryName: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  budgetContent: {
    gap: 12,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetLabel: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  budgetValue: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  progressBarContainer: {
    marginTop: 4,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentageText: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
    textAlign: 'right',
  },
});
