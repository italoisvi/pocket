import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { categorizeWithWalts } from '@/lib/categorize-with-walts';

type Expense = {
  id: string;
  establishment_name: string;
  amount: number;
  date: string;
  category: string;
  subcategory?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  notes: string | null;
};

export default function EditExpenseScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [establishmentName, setEstablishmentName] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadExpense();
  }, [id]);

  const loadExpense = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setExpense(data);
      setEstablishmentName(data.establishment_name);
      setAmount(data.amount.toString());
      setNotes(data.notes || '');
    } catch (error) {
      console.error('Erro ao carregar gasto:', error);
      Alert.alert('Erro', 'Não foi possível carregar o gasto.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!establishmentName.trim()) {
      Alert.alert('Erro', 'Por favor, insira o nome do estabelecimento.');
      return;
    }

    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Erro', 'Por favor, insira um valor válido.');
      return;
    }

    setSaving(true);
    try {
      // Recategorizar com Walts (IA) com base no novo nome do estabelecimento
      const categorization = await categorizeWithWalts(establishmentName, {
        amount: parsedAmount,
      });

      const { error } = await supabase
        .from('expenses')
        .update({
          establishment_name: establishmentName.trim(),
          amount: parsedAmount,
          notes: notes.trim() || null,
          category: categorization.category,
          subcategory: categorization.subcategory,
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Comprovante atualizado com sucesso!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Erro ao salvar gasto:', error);
      Alert.alert('Erro', 'Não foi possível atualizar o comprovante.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={theme.primary} />
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
          Editar Comprovante
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.content}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.label, { color: theme.text }]}>
              Estabelecimento
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.cardBorder,
                  color: theme.text,
                },
              ]}
              value={establishmentName}
              onChangeText={setEstablishmentName}
              placeholder="Nome do estabelecimento"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.label, { color: theme.text }]}>Valor</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.cardBorder,
                  color: theme.text,
                },
              ]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.label, { color: theme.text }]}>
              Observações (opcional)
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.cardBorder,
                  color: theme.text,
                },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Adicione observações sobre este gasto"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              {
                backgroundColor:
                  theme.background === '#000' ? theme.card : theme.primary,
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
                color={theme.background === '#000' ? theme.text : '#FFF'}
              />
            ) : (
              <Text
                style={[
                  styles.saveButtonText,
                  {
                    color: theme.background === '#000' ? theme.text : '#FFF',
                  },
                ]}
              >
                Salvar Alterações
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
  },
  label: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
  },
  input: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  textArea: {
    minHeight: 120,
  },
  saveButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#FFF',
  },
});
