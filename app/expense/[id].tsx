import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Expense = {
  id: string;
  establishment_name: string;
  amount: number;
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  image_url: string | null;
  notes: string | null;
};

export default function ExpenseDetailScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);

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
    } catch (error) {
      console.error('Erro ao carregar gasto:', error);
    } finally {
      setLoading(false);
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

  if (!expense) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <Text style={[styles.errorText, { color: theme.text }]}>
          Gasto não encontrado
        </Text>
      </View>
    );
  }

  const formattedDate = new Date(expense.date).toLocaleDateString('pt-BR');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={[styles.backButtonText, { color: theme.text }]}>
            ← Voltar
          </Text>
        </TouchableOpacity>
      </View>

      {expense.image_url && (
        <Image source={{ uri: expense.image_url }} style={styles.image} />
      )}

      <View style={styles.content}>
        <Text style={[styles.establishment, { color: theme.text }]}>
          {expense.establishment_name}
        </Text>
        <Text style={[styles.date, { color: theme.textSecondary }]}>
          {formattedDate}
        </Text>
        <Text style={[styles.amount, { color: theme.text }]}>
          R$ {expense.amount.toFixed(2)}
        </Text>

        {expense.items.length > 0 && (
          <View style={styles.itemsSection}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Itens
            </Text>
            {expense.items.map((item, index) => (
              <View
                key={index}
                style={[styles.item, { borderBottomColor: theme.border }]}
              >
                <View style={styles.itemLeft}>
                  <Text
                    style={[
                      styles.itemQuantity,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.quantity}x
                  </Text>
                  <Text style={[styles.itemName, { color: theme.text }]}>
                    {item.name}
                  </Text>
                </View>
                <Text style={[styles.itemPrice, { color: theme.text }]}>
                  R$ {item.price.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {expense.notes && (
          <View style={styles.notesSection}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Observações
            </Text>
            <Text style={[styles.notes, { color: theme.text }]}>
              {expense.notes}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
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
  errorText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
  },
  header: {
    padding: 16,
    paddingTop: 60,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  image: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  content: {
    padding: 24,
  },
  establishment: {
    fontSize: 28,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 8,
  },
  date: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 16,
  },
  amount: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 32,
  },
  itemsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQuantity: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  itemName: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  itemPrice: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  notesSection: {
    marginBottom: 32,
  },
  notes: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 24,
  },
});
