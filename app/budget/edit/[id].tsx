import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { ChevronDownIcon } from '@/components/ChevronDownIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { supabase } from '@/lib/supabase';

type PeriodType = 'monthly' | 'weekly' | 'yearly';

export default function EditBudgetScreen() {
  const { theme, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBudget();
  }, [id]);

  const loadBudget = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setSelectedCategory(data.category_id as ExpenseCategory);
        setPeriodType(data.period_type as PeriodType);
        setNotificationsEnabled(data.notifications_enabled);

        // Formatar o valor para exibição
        const amountNumber = parseFloat(data.amount);
        const formatted = amountNumber.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        setAmount(formatted);
      }
    } catch (error) {
      console.error('Erro ao carregar orçamento:', error);
      Alert.alert('Erro', 'Não foi possível carregar o orçamento');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    const numberValue = parseFloat(numbers) / 100;

    if (isNaN(numberValue)) return '';

    return numberValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleAmountChange = (text: string) => {
    const formatted = formatCurrency(text);
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

  const handleUpdate = async () => {
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
      const amountValue = amount.replace(/\./g, '').replace(',', '.');

      const { error } = await supabase
        .from('budgets')
        .update({
          category_id: selectedCategory,
          amount: amountValue,
          period_type: periodType,
          notifications_enabled: notificationsEnabled,
        })
        .eq('id', id);

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

      Alert.alert('Sucesso', 'Orçamento atualizado com sucesso!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Erro ao atualizar orçamento:', error);
      Alert.alert('Erro', 'Não foi possível atualizar o orçamento');
    } finally {
      setSaving(false);
    }
  };

  const categoryList = Object.entries(CATEGORIES)
    .filter(([key]) => key !== 'outros')
    .map(([key, info]) => ({
      key: key as ExpenseCategory,
      name: info.name,
      color: info.color,
    }));

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
          <Text style={[styles.title, { color: theme.text }]}>
            Editar Orçamento
          </Text>
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
        <Text style={[styles.title, { color: theme.text }]}>
          Editar Orçamento
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
        <View style={styles.form}>
          <Text style={[styles.label, { color: theme.text }]}>Categoria *</Text>
          <TouchableOpacity
            style={[
              styles.input,
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
                  flex: 1,
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
                    <Text style={[styles.categoryName, { color: theme.text }]}>
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
            <Text style={[styles.currencyPrefix, { color: theme.text }]}>
              R$
            </Text>
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
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={
                notificationsEnabled ? theme.background : theme.textSecondary
              }
            />
          </View>
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.updateButton,
            {
              backgroundColor: theme.primary,
            },
            getCardShadowStyle(isDark),
          ]}
          onPress={handleUpdate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <Text
              style={[styles.updateButtonText, { color: theme.background }]}
            >
              Atualizar Orçamento
            </Text>
          )}
        </TouchableOpacity>
      </SafeAreaView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
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
  inputText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
  },
  currencyPrefix: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
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
  categoryName: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
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
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  footer: {
    padding: 24,
  },
  updateButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Bold',
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
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 4,
    lineHeight: 20,
  },
});
