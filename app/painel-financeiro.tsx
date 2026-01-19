import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { BankLogo } from '@/components/BankLogo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { getApiKey } from '@/lib/pluggy';
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
  linkedAccountId?: string; // UUID da conta bancária vinculada (Open Finance)
  lastKnownBalance?: number; // Saldo persistido quando desvincula o banco
};

type BankAccount = {
  id: string;
  name: string;
  number: string | null;
  balance: number | null;
  item_id: string;
  imageUrl?: string;
  primaryColor?: string;
};

export default function PainelFinanceiroScreen() {
  const { theme, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [incomeCards, setIncomeCards] = useState<IncomeCard[]>([]);
  const [showValues, setShowValues] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  // Form states for editing/adding
  const [salary, setSalary] = useState('');
  const [paymentDay, setPaymentDay] = useState('');
  const [incomeSource, setIncomeSource] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState<string | null>(null);

  // Bank accounts from Open Finance
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

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

      // Carregar income_cards
      const { data: profile } = await supabase
        .from('profiles')
        .select('income_cards')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.income_cards && Array.isArray(profile.income_cards)) {
        setIncomeCards(profile.income_cards);
      }

      // Carregar contas bancárias do Open Finance (apenas tipo BANK)
      // Incluir dados do pluggy_items para pegar connector_id
      const { data: accounts } = await supabase
        .from('pluggy_accounts')
        .select(
          `
          id, name, number, balance, item_id,
          pluggy_items!inner(connector_id)
        `
        )
        .eq('user_id', user.id)
        .eq('type', 'BANK')
        .order('name');

      if (accounts && accounts.length > 0) {
        // Tipo para o resultado do Supabase (pluggy_items é objeto, não array, com !inner)
        type AccountWithItem = {
          id: string;
          name: string;
          number: string | null;
          balance: number | null;
          item_id: string;
          pluggy_items: { connector_id: number };
        };

        // Buscar logos dos connectors
        const typedAccounts = accounts as unknown as AccountWithItem[];
        const connectorIds = [
          ...new Set(typedAccounts.map((acc) => acc.pluggy_items.connector_id)),
        ];

        // Obter API key para autenticar na Pluggy
        const apiKey = await getApiKey();

        const connectorsInfo = await Promise.all(
          connectorIds.map(async (connectorId) => {
            try {
              const response = await fetch(
                `https://api.pluggy.ai/connectors/${connectorId}`,
                {
                  headers: {
                    'X-API-KEY': apiKey,
                  },
                }
              );
              if (response.ok) {
                const connector = await response.json();
                return {
                  id: connector.id,
                  imageUrl: connector.imageUrl,
                  primaryColor: connector.primaryColor,
                };
              }
            } catch (error) {
              console.error(`Error fetching connector ${connectorId}:`, error);
            }
            return null;
          })
        );

        const connectorsMap = new Map(
          connectorsInfo.filter((c) => c !== null).map((c) => [c!.id, c])
        );

        // Mapear contas com logos
        const accountsWithLogos: BankAccount[] = typedAccounts.map((acc) => ({
          id: acc.id,
          name: acc.name,
          number: acc.number,
          balance: acc.balance,
          item_id: acc.item_id,
          imageUrl: connectorsMap.get(acc.pluggy_items.connector_id)?.imageUrl,
          primaryColor: connectorsMap.get(acc.pluggy_items.connector_id)
            ?.primaryColor,
        }));

        setBankAccounts(accountsWithLogos);
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
    setLinkedAccountId(null);
    setEditingCardId(null);
    setIsEditing(true);
  };

  const handleEdit = (card: IncomeCard) => {
    setSalary(card.salary);
    setPaymentDay(card.paymentDay);
    setIncomeSource(card.incomeSource);
    setLinkedAccountId(card.linkedAccountId || null);
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

              // Se não sobrou nenhum card, limpar também os campos antigos
              const updateData: {
                income_cards: IncomeCard[];
                monthly_salary?: null;
                salary_payment_day?: null;
              } = {
                income_cards: updatedCards,
              };

              if (updatedCards.length === 0) {
                updateData.monthly_salary = null;
                updateData.salary_payment_day = null;
              }

              const { error } = await supabase
                .from('profiles')
                .update(updateData)
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
        const currentCard = incomeCards.find((c) => c.id === editingCardId);

        // Verificar se está desvinculando o banco (tinha conta e agora não tem)
        let lastKnownBalance: number | undefined =
          currentCard?.lastKnownBalance;

        if (currentCard?.linkedAccountId && !linkedAccountId) {
          // Está desvinculando - persistir o saldo atual do banco
          const linkedAccount = bankAccounts.find(
            (acc) => acc.id === currentCard.linkedAccountId
          );
          if (
            linkedAccount?.balance !== null &&
            linkedAccount?.balance !== undefined
          ) {
            lastKnownBalance = linkedAccount.balance;
          }
        } else if (linkedAccountId) {
          // Está vinculando uma nova conta - limpar saldo persistido
          lastKnownBalance = undefined;
        }

        updatedCards = incomeCards.map((card) =>
          card.id === editingCardId
            ? {
                ...card,
                salary,
                paymentDay,
                incomeSource,
                linkedAccountId: linkedAccountId || undefined,
                lastKnownBalance,
              }
            : card
        );
      } else {
        // Adding new card
        const newCard: IncomeCard = {
          id: Date.now().toString(),
          salary,
          paymentDay,
          incomeSource,
          linkedAccountId: linkedAccountId || undefined,
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
    setLinkedAccountId(null);
  };

  // Formatar número da conta para exibição
  const formatAccountNumber = (number: string | null) => {
    if (!number) return '';
    // Mostrar apenas últimos 4 dígitos
    const digits = number.replace(/\D/g, '');
    if (digits.length <= 4) return digits;
    return `****${digits.slice(-4)}`;
  };

  // Buscar conta vinculada completa
  const getLinkedAccount = (accountId: string | undefined) => {
    if (!accountId) return null;
    return bankAccounts.find((acc) => acc.id === accountId) || null;
  };

  // Buscar nome da conta vinculada (formatado)
  const getLinkedAccountName = (accountId: string | undefined) => {
    const account = getLinkedAccount(accountId);
    if (!account) return null;
    const numberPart = account.number
      ? ` - ${formatAccountNumber(account.number)}`
      : '';
    return `${account.name}${numberPart}`;
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

  const renderMaskedValue = (value: string) => {
    const barColor = isDark ? '#fff' : '#000';
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[styles.displayCardValue, { color: theme.text }]}>
          R${' '}
        </Text>
        <View
          style={{
            backgroundColor: barColor,
            height: 20,
            borderRadius: 4,
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Text
            style={[
              styles.displayCardValue,
              { color: 'transparent', includeFontPadding: false },
            ]}
          >
            {value}
          </Text>
        </View>
      </View>
    );
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
          Fonte de Renda
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
                          getCardShadowStyle(isDark),
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
                              style={styles.iconButton}
                              onPress={() => handleEdit(card)}
                            >
                              <LapisIcon size={18} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => handleDelete(card.id)}
                            >
                              <TrashIcon size={18} color={theme.text} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        {showValues ? (
                          <Text
                            style={[
                              styles.displayCardValue,
                              { color: theme.text },
                            ]}
                          >
                            R$ {card.salary}
                          </Text>
                        ) : (
                          renderMaskedValue(card.salary)
                        )}
                        <Text
                          style={[
                            styles.displayCardSubtitle,
                            { color: theme.textSecondary },
                          ]}
                        >
                          Dia de recebimento: {card.paymentDay}
                        </Text>
                        {card.linkedAccountId &&
                          getLinkedAccount(card.linkedAccountId) && (
                            <View style={styles.linkedAccountRow}>
                              <BankLogo
                                imageUrl={
                                  getLinkedAccount(card.linkedAccountId)
                                    ?.imageUrl
                                }
                                bankName={
                                  getLinkedAccount(card.linkedAccountId)
                                    ?.name || ''
                                }
                                primaryColor={
                                  getLinkedAccount(card.linkedAccountId)
                                    ?.primaryColor
                                }
                                size={20}
                                backgroundColor={theme.primary}
                              />
                              <Text
                                style={[
                                  styles.displayCardSubtitle,
                                  { color: theme.primary, marginLeft: 8 },
                                ]}
                              >
                                {getLinkedAccountName(card.linkedAccountId)}
                              </Text>
                            </View>
                          )}
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

                  {/* Seletor de conta bancária (Open Finance) */}
                  {bankAccounts.length > 0 && (
                    <View style={styles.section}>
                      <Text style={[styles.label, { color: theme.text }]}>
                        Conta que Recebe (Open Finance)
                      </Text>
                      <Text
                        style={[
                          styles.helperText,
                          { color: theme.textSecondary, marginBottom: 12 },
                        ]}
                      >
                        Vincule a conta bancária onde você recebe esta renda
                        para um cálculo mais preciso do seu saldo
                      </Text>

                      {/* Opção: Não vincular */}
                      <TouchableOpacity
                        style={[
                          styles.sourceOption,
                          {
                            backgroundColor: theme.card,
                            borderColor:
                              linkedAccountId === null
                                ? theme.primary
                                : theme.cardBorder,
                          },
                        ]}
                        onPress={() => setLinkedAccountId(null)}
                      >
                        <View
                          style={[
                            styles.radio,
                            {
                              borderColor:
                                linkedAccountId === null
                                  ? theme.primary
                                  : theme.cardBorder,
                            },
                          ]}
                        >
                          {linkedAccountId === null && (
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
                          Não vincular conta
                        </Text>
                      </TouchableOpacity>

                      {/* Lista de contas bancárias */}
                      {bankAccounts.map((account) => (
                        <TouchableOpacity
                          key={account.id}
                          style={[
                            styles.sourceOption,
                            {
                              backgroundColor: theme.card,
                              borderColor:
                                linkedAccountId === account.id
                                  ? theme.primary
                                  : theme.cardBorder,
                            },
                          ]}
                          onPress={() => setLinkedAccountId(account.id)}
                        >
                          <View
                            style={[
                              styles.radio,
                              {
                                borderColor:
                                  linkedAccountId === account.id
                                    ? theme.primary
                                    : theme.cardBorder,
                              },
                            ]}
                          >
                            {linkedAccountId === account.id && (
                              <View
                                style={[
                                  styles.radioInner,
                                  { backgroundColor: theme.primary },
                                ]}
                              />
                            )}
                          </View>
                          {/* Logo do banco */}
                          <View style={styles.bankLogoWrapper}>
                            <BankLogo
                              imageUrl={account.imageUrl}
                              bankName={account.name}
                              primaryColor={account.primaryColor}
                              size={32}
                              backgroundColor={theme.primary}
                            />
                          </View>
                          <View style={styles.accountInfo}>
                            <Text
                              style={[
                                styles.sourceLabel,
                                { color: theme.text },
                              ]}
                            >
                              {account.name}
                            </Text>
                            {account.number && (
                              <Text
                                style={[
                                  styles.accountNumber,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                Conta {formatAccountNumber(account.number)}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

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
                            isDark
                              ? theme.card
                              : theme.primary,
                          borderWidth: 2,
                          borderColor:
                            isDark
                              ? theme.cardBorder
                              : theme.primary,
                        },
                        saving && styles.saveButtonDisabled,
                      ]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={isDark ? theme.text : '#FFF'} />
                      ) : (
                        <Text
                          style={[
                            styles.saveButtonText,
                            {
                              color:
                                isDark
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
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
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
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  section: {
    marginBottom: 32,
  },
  label: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
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
    fontFamily: 'DMSans-SemiBold',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'DMSans-Regular',
    paddingVertical: 16,
  },
  dayInput: {
    fontSize: 20,
    fontFamily: 'DMSans-Regular',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  helperText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
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
    fontFamily: 'DMSans-Regular',
  },
  accountInfo: {
    flex: 1,
  },
  accountNumber: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  bankLogoWrapper: {
    marginRight: 12,
  },
  linkedAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
    fontFamily: 'DMSans-SemiBold',
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
    fontFamily: 'DMSans-SemiBold',
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
    fontFamily: 'DMSans-SemiBold',
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayCardValue: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  displayCardSubtitle: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
  },
});
