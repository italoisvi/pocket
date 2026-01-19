import { useState } from 'react';
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
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import { ChevronDownIcon } from '@/components/ChevronDownIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { supabase } from '@/lib/supabase';

type PeriodType = 'monthly' | 'weekly' | 'yearly';

export default function CreateBudgetScreen() {
  const { theme, isDark } = useTheme();
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

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

      Alert.alert('Sucesso', 'Orçamento criado com sucesso!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Erro ao criar orçamento:', error);
      Alert.alert('Erro', 'Não foi possível criar o orçamento');
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
          Criar Orçamento
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
  content: {
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
  categoryName: {
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
});
