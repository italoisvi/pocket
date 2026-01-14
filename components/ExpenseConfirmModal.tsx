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
  Switch,
} from 'react-native';
import type { ReceiptData } from '@/lib/ocr';
import { formatCurrency } from '@/lib/formatCurrency';
import { useTheme } from '@/lib/theme';

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
  const { theme } = useTheme();
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
        <View style={[styles.container, { backgroundColor: theme.card }]}>
          <ScrollView
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.title, { color: theme.text }]}>
              Confirmar Informações
            </Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Estabelecimento
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { borderColor: theme.border, color: theme.text },
                ]}
                value={editedData.establishmentName}
                onChangeText={(text) =>
                  setEditedData({ ...editedData, establishmentName: text })
                }
                placeholder="Nome do estabelecimento"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Valor Total
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { borderColor: theme.border, color: theme.text },
                ]}
                value={editedData.amount.toString()}
                onChangeText={(text) =>
                  setEditedData({
                    ...editedData,
                    amount: parseFloat(text) || 0,
                  })
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Data
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { borderColor: theme.border, color: theme.text },
                ]}
                value={editedData.date}
                onChangeText={(text) =>
                  setEditedData({ ...editedData, date: text })
                }
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <View style={styles.cashField}>
              <View style={styles.cashTextContainer}>
                <Text style={[styles.cashLabel, { color: theme.text }]}>
                  Paguei em dinheiro?
                </Text>
                <Text
                  style={[
                    styles.cashDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Gastos em dinheiro não aparecem no extrato bancário
                </Text>
              </View>
              <Switch
                value={editedData.isCash || false}
                onValueChange={(value) =>
                  setEditedData({ ...editedData, isCash: value })
                }
                trackColor={{
                  false: theme.background === '#000' ? '#333' : '#e0e0e0',
                  true: '#f7c359',
                }}
                thumbColor={
                  editedData.isCash
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

            {editedData.items.length > 0 && (
              <View style={styles.itemsSection}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  Itens
                </Text>
                {editedData.items.map((item, index) => (
                  <View
                    key={index}
                    style={[styles.item, { borderBottomColor: theme.border }]}
                  >
                    <Text style={[styles.itemText, { color: theme.text }]}>
                      {item.quantity}x {item.name}
                    </Text>
                    <Text style={[styles.itemPrice, { color: theme.text }]}>
                      {formatCurrency(item.price)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.cancelButton,
                { backgroundColor: theme.background },
              ]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  { color: theme.textSecondary },
                ]}
              >
                Cancelar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: theme.primary }]}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator
                  color={theme.background === '#000' ? '#000' : '#fff'}
                />
              ) : (
                <Text
                  style={[
                    styles.confirmButtonText,
                    { color: theme.background === '#000' ? '#000' : '#fff' },
                  ]}
                >
                  Confirmar
                </Text>
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
  },
  input: {
    borderWidth: 1,
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
  },
  itemText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  itemPrice: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  actions: {
    flexDirection: 'row',
    padding: 24,
    paddingTop: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  confirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cashField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingVertical: 12,
  },
  cashTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  cashLabel: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cashDescription: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 2,
  },
});
