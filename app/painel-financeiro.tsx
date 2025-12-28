import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { EyeIcon } from '@/components/EyeIcon';
import { EyeOffIcon } from '@/components/EyeOffIcon';
import { LapisIcon } from '@/components/LapisIcon';
import { MaisIcon } from '@/components/MaisIcon';
import { TrashIcon } from '@/components/TrashIcon';

const INCOME_SOURCES = [
  { value: 'clt', label: 'CLT (Carteira Assinada)' },
  { value: 'pj', label: 'PJ (Pessoa Jurídica)' },
  { value: 'autonomo', label: 'Autônomo' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'empresario', label: 'Empresário' },
  { value: 'aposentado', label: 'Aposentado' },
  { value: 'pensionista', label: 'Pensionista' },
  { value: 'investimentos', label: 'Investimentos' },
  { value: 'outros', label: 'Outros' },
];

type IncomeCard = {
  id: string;
  salary: string;
  paymentDay: string;
  incomeSource: string;
};

export default function PainelFinanceiroScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [incomeCards, setIncomeCards] = useState<IncomeCard[]>([]);
  const [showValues, setShowValues] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  // Form states for editing/adding
  const [salary, setSalary] = useState('');
  const [paymentDay, setPaymentDay] = useState('');
  const [incomeSource, setIncomeSource] = useState('');

  useEffect(() => {
    loadFinancialData();
  }, []);

  const loadFinancialData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('income_cards')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.income_cards && Array.isArray(profile.income_cards)) {
        setIncomeCards(profile.income_cards);
      }
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSalary('');
    setPaymentDay('');
    setIncomeSource('');
    setEditingCardId(null);
    setIsEditing(true);
  };

  const handleEdit = (card: IncomeCard) => {
    setSalary(card.salary);
    setPaymentDay(card.paymentDay);
    setIncomeSource(card.incomeSource);
    setEditingCardId(card.id);
    setIsEditing(true);
  };

  const handleDelete = async (cardId: string) => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir esta renda?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();

              if (!user) return;

              const updatedCards = incomeCards.filter(
                (card) => card.id !== cardId
              );
              setIncomeCards(updatedCards);

              const { error } = await supabase
                .from('profiles')
                .update({ income_cards: updatedCards })
                .eq('id', user.id);

              if (error) throw error;

              Alert.alert('Sucesso', 'Renda excluída com sucesso!');
            } catch (error) {
              console.error('Error deleting income card:', error);
              Alert.alert('Erro', 'Não foi possível excluir a renda.');
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!salary || !paymentDay || !incomeSource) {
      Alert.alert('Atenção', 'Por favor, preencha todos os campos.');
      return;
    }

    const salaryNumber = parseFloat(
      salary.replace(/\./g, '').replace(',', '.')
    );
    const dayNumber = parseInt(paymentDay);

    if (isNaN(salaryNumber) || salaryNumber <= 0) {
      Alert.alert('Atenção', 'Por favor, insira um salário válido.');
      return;
    }

    if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      Alert.alert('Atenção', 'Por favor, insira um dia válido (1-31).');
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      let updatedCards: IncomeCard[];

      if (editingCardId) {
        // Editing existing card
        updatedCards = incomeCards.map((card) =>
          card.id === editingCardId
            ? { ...card, salary, paymentDay, incomeSource }
            : card
        );
      } else {
        // Adding new card
        const newCard: IncomeCard = {
          id: Date.now().toString(),
          salary,
          paymentDay,
          incomeSource,
        };
        updatedCards = [...incomeCards, newCard];
      }

      const { error } = await supabase
        .from('profiles')
        .update({ income_cards: updatedCards })
        .eq('id', user.id);

      if (error) throw error;

      setIncomeCards(updatedCards);
      setIsEditing(false);
      setEditingCardId(null);
      setSalary('');
      setPaymentDay('');
      setIncomeSource('');
      Alert.alert(
        'Sucesso',
        editingCardId
          ? 'Renda atualizada com sucesso!'
          : 'Renda adicionada com sucesso!'
      );
    } catch (error) {
      console.error('Error saving financial data:', error);
      Alert.alert('Erro', 'Não foi possível salvar as informações.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingCardId(null);
    setSalary('');
    setPaymentDay('');
    setIncomeSource('');
  };

  const formatCurrency = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    const amount = parseFloat(numbers) / 100;

    // Format with thousands separator
    const integerPart = Math.floor(amount);
    const decimalPart = (amount - integerPart).toFixed(2).substring(2);
    const formattedInteger = integerPart.toLocaleString('pt-BR');

    return `${formattedInteger},${decimalPart}`;
  };

  const handleSalaryChange = (text: string) => {
    const formatted = formatCurrency(text);
    setSalary(formatted);
  };

  const maskValue = (value: string) => {
    // Replace all digits with *, but keep dots and commas
    return value.replace(/\d/g, '*');
  };

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
          Painel Financeiro
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowValues(!showValues)}
          >
            {showValues ? (
              <EyeIcon size={24} color={theme.text} />
            ) : (
              <EyeOffIcon size={24} color={theme.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleAddNew}>
            <MaisIcon size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView style={styles.content}>
              {!isEditing ? (
                // Display mode - Show all income cards
                <>
                  {incomeCards.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text
                        style={[styles.emptyStateText, { color: theme.text }]}
                      >
                        Nenhuma renda cadastrada
                      </Text>
                      <Text
                        style={[
                          styles.emptyStateSubtext,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Toque no ícone + para adicionar sua primeira renda
                      </Text>
                    </View>
                  ) : (
                    incomeCards.map((card) => (
                      <View
                        key={card.id}
                        style={[
                          styles.displayCard,
                          {
                            backgroundColor: theme.card,
                            borderColor: theme.cardBorder,
                          },
                          getCardShadowStyle(theme.background === '#000'),
                        ]}
                      >
                        <View style={styles.displayCardHeader}>
                          <Text
                            style={[
                              styles.displayCardTitle,
                              { color: theme.text },
                            ]}
                          >
                            {INCOME_SOURCES.find(
                              (s) => s.value === card.incomeSource
                            )?.label || card.incomeSource}
                          </Text>
                          <View style={styles.cardActions}>
                            <TouchableOpacity
                              style={[
                                styles.iconButton,
                                {
                                  backgroundColor: theme.background,
                                  borderColor: theme.cardBorder,
                                },
                              ]}
                              onPress={() => handleEdit(card)}
                            >
                              <LapisIcon size={18} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.iconButton,
                                {
                                  backgroundColor: theme.background,
                                  borderColor: theme.cardBorder,
                                },
                              ]}
                              onPress={() => handleDelete(card.id)}
                            >
                              <TrashIcon size={18} color={theme.text} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.displayCardValue,
                            { color: theme.text },
                          ]}
                        >
                          {showValues
                            ? `R$ ${card.salary}`
                            : `R$ ${maskValue(card.salary)}`}
                        </Text>
                        <Text
                          style={[
                            styles.displayCardSubtitle,
                            { color: theme.textSecondary },
                          ]}
                        >
                          Dia de recebimento: {card.paymentDay}
                        </Text>
                      </View>
                    ))
                  )}
                </>
              ) : (
                // Edit mode - Show form
                <>
                  <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      Salário Mensal
                    </Text>
                    <View
                      style={[
                        styles.inputContainer,
                        {
                          backgroundColor: theme.card,
                          borderColor: theme.cardBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.currency, { color: theme.text }]}>
                        R$
                      </Text>
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        value={salary}
                        onChangeText={handleSalaryChange}
                        placeholder="0,00"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      Dia de Recebimento
                    </Text>
                    <TextInput
                      style={[
                        styles.dayInput,
                        {
                          backgroundColor: theme.card,
                          borderColor: theme.cardBorder,
                          color: theme.text,
                        },
                      ]}
                      value={paymentDay}
                      onChangeText={setPaymentDay}
                      placeholder="1"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                    <Text
                      style={[
                        styles.helperText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Digite um número de 1 a 31
                    </Text>
                  </View>

                  <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      Origem da Renda
                    </Text>
                    {INCOME_SOURCES.map((source) => (
                      <TouchableOpacity
                        key={source.value}
                        style={[
                          styles.sourceOption,
                          {
                            backgroundColor: theme.card,
                            borderColor:
                              incomeSource === source.value
                                ? theme.primary
                                : theme.cardBorder,
                          },
                        ]}
                        onPress={() => setIncomeSource(source.value)}
                      >
                        <View
                          style={[
                            styles.radio,
                            {
                              borderColor:
                                incomeSource === source.value
                                  ? theme.primary
                                  : theme.cardBorder,
                            },
                          ]}
                        >
                          {incomeSource === source.value && (
                            <View
                              style={[
                                styles.radioInner,
                                { backgroundColor: theme.primary },
                              ]}
                            />
                          )}
                        </View>
                        <Text
                          style={[styles.sourceLabel, { color: theme.text }]}
                        >
                          {source.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[
                        styles.cancelButton,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.cardBorder,
                        },
                      ]}
                      onPress={handleCancel}
                    >
                      <Text
                        style={[styles.cancelButtonText, { color: theme.text }]}
                      >
                        Cancelar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.saveButton,
                        {
                          backgroundColor:
                            theme.background === '#000'
                              ? theme.card
                              : theme.primary,
                          borderWidth: 2,
                          borderColor:
                            theme.background === '#000'
                              ? theme.cardBorder
                              : theme.primary,
                        },
                        saving && styles.saveButtonDisabled,
                      ]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator
                          size="small"
                          color={
                            theme.background === '#000' ? theme.text : '#FFF'
                          }
                        />
                      ) : (
                        <Text
                          style={[
                            styles.saveButtonText,
                            {
                              color:
                                theme.background === '#000'
                                  ? theme.text
                                  : '#FFF',
                            },
                          ]}
                        >
                          Salvar
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
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
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
    flex: 1,
    textAlign: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
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
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  section: {
    marginBottom: 32,
  },
  label: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 16,
  },
  currency: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Regular',
    paddingVertical: 16,
  },
  dayInput: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Regular',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  helperText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 8,
  },
  sourceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sourceLabel: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 40,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    borderWidth: 2,
  },
  cancelButtonText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  displayCard: {
    borderRadius: 12,
    padding: 24,
    borderWidth: 2,
    marginBottom: 16,
  },
  displayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  displayCardTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  displayCardValue: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 8,
  },
  displayCardSubtitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
  },
});
