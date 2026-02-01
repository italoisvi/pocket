import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { useTheme } from '@/lib/theme';
import { LixoIcon } from '@/components/LixoIcon';
import { LapisIcon } from '@/components/LapisIcon';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

      console.log('[ExpenseDetail] Loaded expense:', data);
      console.log('[ExpenseDetail] Image URL:', data.image_url);

      setExpense(data);
    } catch (error) {
      console.error('Erro ao carregar gasto:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!expense) return;

    setDeleting(true);
    try {
      // Delete image from storage if it exists
      if (expense.image_url && expense.image_url.includes('supabase')) {
        try {
          // Extrair o caminho do arquivo da URL pública
          const urlParts = expense.image_url.split(
            '/storage/v1/object/public/receipts/'
          );
          if (urlParts.length > 1) {
            const filePath = urlParts[1];
            await supabase.storage.from('receipts').remove([filePath]);
          }
        } catch (storageError) {
          console.error('Erro ao deletar imagem do storage:', storageError);
          // Continuar com a deleção do expense mesmo se falhar ao deletar a imagem
        }
      }

      // Remove reference from pluggy_transactions before deleting expense
      const { error: unlinkError } = await supabase
        .from('pluggy_transactions')
        .update({ expense_id: null })
        .eq('expense_id', expense.id);

      if (unlinkError) {
        console.error('Erro ao desvincular transações:', unlinkError);
        // Continuar mesmo se falhar - pode não haver transações vinculadas
      }

      // Delete expense from database
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expense.id);

      if (error) throw error;

      // Navigate back to comprovantes
      router.replace('/(tabs)/comprovantes');
    } catch (error) {
      console.error('Erro ao deletar gasto:', error);
      Alert.alert('Erro', 'Não foi possível deletar o gasto. Tente novamente.');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleEdit = () => {
    router.push(`/expense/edit/${id}`);
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
    <>
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
          <Text style={[styles.title, { color: theme.text }]}>Detalhes</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconButton} onPress={handleEdit}>
              <LapisIcon size={24} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowDeleteModal(true)}
            >
              <LixoIcon size={24} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <ScrollView style={styles.scrollContent}>
          {expense.image_url && (
            <Image
              source={{ uri: expense.image_url }}
              style={styles.image}
              onError={(error) => {
                console.error(
                  '[ExpenseDetail] Erro ao carregar imagem:',
                  error.nativeEvent
                );
              }}
              onLoad={() => {
                console.log('[ExpenseDetail] Imagem carregada com sucesso!');
              }}
              onLoadStart={() => {
                console.log(
                  '[ExpenseDetail] Iniciando carregamento da imagem...'
                );
              }}
            />
          )}

          <View style={styles.content}>
            <Text style={[styles.establishment, { color: theme.text }]}>
              {expense.establishment_name}
            </Text>
            <Text style={[styles.date, { color: theme.textSecondary }]}>
              {formattedDate}
            </Text>
            <Text style={[styles.amount, { color: theme.text }]}>
              {formatCurrency(expense.amount)}
            </Text>

            {expense.items.length > 0 && (
              <View style={styles.itemsSection}>
                <Text
                  style={[styles.sectionTitle, { color: theme.textSecondary }]}
                >
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
                      {formatCurrency(item.price)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {expense.notes && (
              <View style={styles.notesSection}>
                <Text
                  style={[styles.sectionTitle, { color: theme.textSecondary }]}
                >
                  Observações
                </Text>
                <Text style={[styles.notes, { color: theme.text }]}>
                  {expense.notes}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Confirmar Exclusão
            </Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              Tem certeza que deseja excluir este comprovante? Esta ação não
              pode ser desfeita.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteButtonText}>Excluir</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
    fontFamily: 'DMSans-Regular',
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
    fontFamily: 'DMSans-SemiBold',
    position: 'absolute',
    left: 56,
    right: 96,
    textAlign: 'center',
    alignSelf: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: 300,
    resizeMode: 'contain',
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 24,
  },
  establishment: {
    fontSize: 22,
    fontFamily: 'DMSans-Bold',
    marginBottom: 8,
  },
  date: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    marginBottom: 16,
  },
  amount: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    marginBottom: 32,
  },
  itemsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
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
    fontFamily: 'DMSans-SemiBold',
  },
  itemName: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  itemPrice: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  notesSection: {
    marginBottom: 32,
  },
  notes: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    lineHeight: 24,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  cancelButtonText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  deleteButtonText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    color: '#fff',
  },
});
