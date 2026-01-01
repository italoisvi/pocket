import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { ReceiptData } from '@/lib/ocr';
import { formatCurrency } from '@/lib/formatCurrency';

type ExpenseConfirmModalProps = {
  visible: boolean;
  receiptData: ReceiptData | null;
  onConfirm: (data: ReceiptData) => void;
  onCancel: () => void;
  loading?: boolean;
};

export function ExpenseConfirmModal({
  visible,
  receiptData,
  onConfirm,
  onCancel,
  loading = false,
}: ExpenseConfirmModalProps) {
  const [editedData, setEditedData] = useState<ReceiptData | null>(receiptData);

  // Update editedData when receiptData changes
  useEffect(() => {
    if (receiptData) {
      setEditedData(receiptData);
    }
  }, [receiptData]);

  const handleConfirm = () => {
    if (editedData) {
      onConfirm(editedData);
    }
  };

  if (!receiptData || !editedData) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <ScrollView
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Confirmar Informações</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Estabelecimento</Text>
              <TextInput
                style={styles.input}
                value={editedData.establishmentName}
                onChangeText={(text) =>
                  setEditedData({ ...editedData, establishmentName: text })
                }
                placeholder="Nome do estabelecimento"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Valor Total</Text>
              <TextInput
                style={styles.input}
                value={editedData.amount.toString()}
                onChangeText={(text) =>
                  setEditedData({
                    ...editedData,
                    amount: parseFloat(text) || 0,
                  })
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Data</Text>
              <TextInput
                style={styles.input}
                value={editedData.date}
                onChangeText={(text) =>
                  setEditedData({ ...editedData, date: text })
                }
                placeholder="YYYY-MM-DD"
              />
            </View>

            {editedData.items.length > 0 && (
              <View style={styles.itemsSection}>
                <Text style={styles.label}>Itens</Text>
                {editedData.items.map((item, index) => (
                  <View key={index} style={styles.item}>
                    <Text style={styles.itemText}>
                      {item.quantity}x {item.name}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {formatCurrency(item.price)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirmar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  scrollView: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 8,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  itemsSection: {
    marginTop: 8,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    color: '#333',
  },
  itemPrice: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#000',
  },
  actions: {
    flexDirection: 'row',
    padding: 24,
    paddingTop: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#666',
  },
  confirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#fff',
  },
});
