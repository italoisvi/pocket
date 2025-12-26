import { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Text,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { CameraIcon } from '@/components/CameraIcon';
import { SettingsIcon } from '@/components/SettingsIcon';
import { UsuarioIcon } from '@/components/UsuarioIcon';
import { CapturaDeFotoIcon } from '@/components/CapturaDeFotoIcon';
import { CarregarIcon } from '@/components/CarregarIcon';
import { DividirContaIcon } from '@/components/DividirContaIcon';
import { KangarooIcon } from '@/components/KangarooIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { ChevronDownIcon } from '@/components/ChevronDownIcon';
import { EyeIcon } from '@/components/EyeIcon';
import { EyeOffIcon } from '@/components/EyeOffIcon';
import { ExpenseCard } from '@/components/ExpenseCard';
import { ExpenseConfirmModal } from '@/components/ExpenseConfirmModal';
import { SalarySetupModal } from '@/components/SalarySetupModal';
import { extractReceiptData, type ReceiptData } from '@/lib/ocr';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { categorizeExpense } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

type Expense = {
  id: string;
  establishment_name: string;
  amount: number;
  date: string;
  created_at: string;
  category: string;
  subcategory?: string;
};

export default function HomeScreen() {
  const { theme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingImage, setProcessingImage] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [currentImageUri, setCurrentImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSalarySetup, setShowSalarySetup] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState<number | null>(null);
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const floatingButtonsAnim = useRef(new Animated.Value(0)).current;
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return new Set([currentMonthKey]);
  });

  useEffect(() => {
    loadProfile();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadExpenses();
      loadProfile();
    }, [])
  );

  const loadProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('monthly_salary, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar perfil:', error);
        return;
      }

      // Se o perfil existe e tem salário, carregar
      if (data?.monthly_salary !== null && data?.monthly_salary !== undefined) {
        setMonthlySalary(data.monthly_salary);
      }

      // Carregar avatar
      if (data?.avatar_url) {
        setProfileImage(data.avatar_url);
      }

      if (data?.monthly_salary === null || data?.monthly_salary === undefined) {
        // Verificar se já mostrou o modal antes
        const hasShownSetup = await AsyncStorage.getItem(
          `salary_setup_shown_${user.id}`
        );
        // Só mostrar modal se ainda não mostrou antes
        if (!hasShownSetup) {
          setShowSalarySetup(true);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    }
  };

  const loadExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(
          'id, establishment_name, amount, date, created_at, category, subcategory'
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      setExpenses(data || []);
    } catch (error) {
      console.error('Erro ao carregar gastos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSalarySetup = async (salary: number, paymentDay: number) => {
    setSavingSalary(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          monthly_salary: salary,
          salary_payment_day: paymentDay,
        },
        { onConflict: 'id' }
      );

      if (error) throw error;

      // Marcar como já configurado
      await AsyncStorage.setItem(`salary_setup_shown_${user.id}`, 'true');

      setMonthlySalary(salary);
      setShowSalarySetup(false);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a renda mensal.');
      console.error('Erro ao salvar renda mensal:', error);
    } finally {
      setSavingSalary(false);
    }
  };

  const handleCameraPress = () => {
    if (showFloatingButtons) {
      // Fechar com animação
      Animated.timing(floatingButtonsAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowFloatingButtons(false));
    } else {
      // Abrir com animação
      setShowFloatingButtons(true);
      Animated.timing(floatingButtonsAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleTakePhoto = async () => {
    setShowFloatingButtons(false);
    try {
      // Dynamic import to prevent iOS release crash
      const ImagePicker = await import('expo-image-picker');

      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permissão Necessária',
          'Precisamos de permissão para acessar sua câmera.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        const imageUri = result.assets[0].uri;
        setCurrentImageUri(imageUri);
        await processReceipt(imageUri);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  };

  const handlePickImage = async () => {
    setShowFloatingButtons(false);
    try {
      // Dynamic import to prevent iOS release crash
      const ImagePicker = await import('expo-image-picker');

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permissão Necessária',
          'Precisamos de permissão para acessar sua galeria.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        const imageUri = result.assets[0].uri;
        setCurrentImageUri(imageUri);
        await processReceipt(imageUri);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    }
  };

  const processReceipt = async (imageUri: string) => {
    setProcessingImage(true);
    try {
      const data = await extractReceiptData(imageUri);
      setReceiptData(data);
      setShowConfirmModal(true);
    } catch (error) {
      console.error('Erro ao processar comprovante:', error);
      Alert.alert(
        'Erro ao processar comprovante',
        'Não foi possível ler o comprovante automaticamente. Deseja inserir os dados manualmente?',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => {
              setCurrentImageUri(null);
            },
          },
          {
            text: 'Inserir Manualmente',
            onPress: () => {
              const defaultData: ReceiptData = {
                establishmentName: '',
                amount: 0,
                date: new Date().toISOString().split('T')[0],
                items: [],
              };
              setReceiptData(defaultData);
              setShowConfirmModal(true);
            },
          },
        ]
      );
    } finally {
      setProcessingImage(false);
    }
  };

  const handleConfirmExpense = async (data: ReceiptData) => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      let imageUrl = null;
      if (currentImageUri) {
        const fileName = `${user.id}/${Date.now()}.jpg`;
        const response = await fetch(currentImageUri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, blob);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from('receipts').getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Categorizar automaticamente o gasto e obter subcategoria
      const { category, subcategory } = categorizeExpense(
        data.establishmentName
      );

      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        establishment_name: data.establishmentName,
        amount: data.amount,
        date: data.date,
        items: data.items,
        image_url: imageUrl,
        category: category,
        subcategory: subcategory,
      });

      if (error) throw error;

      setShowConfirmModal(false);
      setReceiptData(null);
      setCurrentImageUri(null);
      await loadExpenses();

      Alert.alert('Sucesso', 'Gasto registrado com sucesso!');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar o gasto. Tente novamente.');
      console.error('Erro ao salvar gasto:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setReceiptData(null);
    setCurrentImageUri(null);
  };

  const handleExpensePress = (id: string) => {
    router.push(`/expense/${id}`);
  };

  const handleSettingsPress = () => {
    router.push('/(tabs)/settings');
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  };

  const groupExpensesByMonth = () => {
    const grouped: { [key: string]: Expense[] } = {};

    expenses.forEach((expense) => {
      const date = new Date(expense.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(expense);
    });

    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  };

  const getMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[styles.topBar, { backgroundColor: theme.background }]}
      >
        {monthlySalary !== null && (
          <View style={styles.salaryContainer}>
            <TouchableOpacity
              style={styles.salaryTouchable}
              onPress={() => router.push('/financial-overview')}
            >
              <Text style={[styles.salaryText, { color: theme.text }]}>
                {salaryVisible
                  ? formatCurrency(
                      monthlySalary -
                        expenses.reduce((sum, exp) => sum + exp.amount, 0)
                    )
                  : 'R$ *.***,**'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setSalaryVisible(!salaryVisible)}
            >
              {salaryVisible ? (
                <EyeIcon size={20} color={theme.textSecondary} />
              ) : (
                <EyeOffIcon size={20} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.spacer} />
        <TouchableOpacity
          style={[
            styles.headerButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
          onPress={() => router.push('/perfil')}
        >
          {profileImage ? (
            <Image
              source={{ uri: profileImage }}
              style={styles.profileButtonImage}
            />
          ) : (
            <UsuarioIcon size={24} color={theme.text} />
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.text }]}>
            Nenhum gasto registrado ainda.
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Clique no botão da câmera para começar!
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupExpensesByMonth()}
          keyExtractor={([monthKey]) => monthKey}
          renderItem={({ item: [monthKey, monthExpenses] }) => {
            const isExpanded = expandedMonths.has(monthKey);
            const monthName = getMonthName(monthKey);
            const capitalizedMonth =
              monthName.charAt(0).toUpperCase() + monthName.slice(1);

            return (
              <View key={monthKey}>
                <TouchableOpacity
                  style={styles.monthHeader}
                  onPress={() => toggleMonth(monthKey)}
                >
                  <Text style={[styles.monthTitle, { color: theme.text }]}>
                    {capitalizedMonth}
                  </Text>
                  {isExpanded ? (
                    <ChevronDownIcon size={20} color={theme.textSecondary} />
                  ) : (
                    <ChevronRightIcon size={20} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>

                {isExpanded &&
                  monthExpenses.map((expense) => (
                    <View key={expense.id} style={styles.cardWrapper}>
                      <ExpenseCard
                        id={expense.id}
                        establishmentName={expense.establishment_name}
                        amount={expense.amount}
                        date={expense.date}
                        category={expense.category}
                        subcategory={expense.subcategory}
                        onPress={() => handleExpensePress(expense.id)}
                      />
                    </View>
                  ))}
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Botão flutuante dividir conta */}
      <TouchableOpacity
        style={[
          styles.fabDividir,
          {
            backgroundColor: theme.fabBackground,
            shadowColor: theme.shadow,
          },
        ]}
        onPress={() => router.push('/dividir-conta')}
      >
        <DividirContaIcon size={28} color={theme.fabIcon} />
      </TouchableOpacity>

      {/* Botão flutuante Chat Walts */}
      <TouchableOpacity
        style={[
          styles.fabChat,
          {
            backgroundColor: theme.fabBackground,
            shadowColor: theme.shadow,
          },
        ]}
        onPress={() => router.push('/chat')}
      >
        <KangarooIcon size={40} inverted />
      </TouchableOpacity>

      {/* Botão flutuante câmera */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: theme.fabBackground,
            shadowColor: theme.shadow,
          },
        ]}
        onPress={handleCameraPress}
        disabled={processingImage}
      >
        {processingImage ? (
          <ActivityIndicator color={theme.fabIcon} />
        ) : (
          <CameraIcon size={28} color={theme.fabIcon} />
        )}
      </TouchableOpacity>

      <ExpenseConfirmModal
        visible={showConfirmModal}
        receiptData={receiptData}
        onConfirm={handleConfirmExpense}
        onCancel={handleCancelConfirm}
        loading={saving}
      />

      <SalarySetupModal
        visible={showSalarySetup}
        onConfirm={handleSalarySetup}
        loading={savingSalary}
      />

      {/* Botões flutuantes para tirar foto ou carregar arquivo */}
      {showFloatingButtons && (
        <>
          <Animated.View
            style={[
              styles.floatingButton,
              styles.uploadButton,
              {
                opacity: floatingButtonsAnim,
                transform: [
                  {
                    translateY: floatingButtonsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [80, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.floatingButtonInner,
                { backgroundColor: theme.card },
              ]}
              onPress={handlePickImage}
            >
              <CarregarIcon size={22} color={theme.primary} />
            </TouchableOpacity>
          </Animated.View>
          <Animated.View
            style={[
              styles.floatingButton,
              styles.cameraButton,
              {
                opacity: floatingButtonsAnim,
                transform: [
                  {
                    translateY: floatingButtonsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [80, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.floatingButtonInner,
                { backgroundColor: theme.card },
              ]}
              onPress={handleTakePhoto}
            >
              <CapturaDeFotoIcon size={22} color={theme.primary} />
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  salaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  salaryTouchable: {
    paddingVertical: 4,
  },
  salaryText: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Regular',
  },
  eyeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  profileButtonImage: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyText: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 130,
    paddingBottom: 100,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  monthTitle: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cardWrapper: {
    marginBottom: 8,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  fabDividir: {
    position: 'absolute',
    left: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  fabChat: {
    position: 'absolute',
    left: '50%',
    marginLeft: -40,
    bottom: 24,
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingButton: {
    position: 'absolute',
    right: 24,
  },
  floatingButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  cameraButton: {
    bottom: 96,
  },
  uploadButton: {
    bottom: 160,
  },
});
