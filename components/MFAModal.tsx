import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { sendMFA } from '@/lib/pluggy';

type MFAParameter = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
};

type MFAModalProps = {
  visible: boolean;
  onClose: () => void;
  itemId: string;
  connectorName: string;
  parameter: MFAParameter;
  onSuccess: () => void;
};

export function MFAModal({
  visible,
  onClose,
  itemId,
  connectorName,
  parameter,
  onSuccess,
}: MFAModalProps) {
  const { theme } = useTheme();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) {
      Alert.alert('Erro', `Por favor, digite ${parameter.label.toLowerCase()}`);
      return;
    }

    setLoading(true);

    try {
      console.log('[MFAModal] Sending MFA code for item:', itemId);
      console.log('[MFAModal] Parameter name:', parameter.name);
      console.log('[MFAModal] Code:', code);

      const result = await sendMFA(itemId, {
        [parameter.name]: code,
      });

      console.log('[MFAModal] MFA sent successfully:', result);

      Alert.alert(
        'Código Enviado',
        'O código foi enviado com sucesso! Aguarde enquanto verificamos sua autenticação.',
        [
          {
            text: 'OK',
            onPress: () => {
              setCode('');
              onClose();
              onSuccess();
            },
          },
        ]
      );
    } catch (error) {
      console.error('[MFAModal] Error sending MFA:', error);
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar o código. Verifique se o código está correto e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setCode('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: theme.background,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            Autenticação Necessária
          </Text>

          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {connectorName} requer autenticação adicional.
          </Text>

          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Digite {parameter.label.toLowerCase()} que você recebeu:
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                color: theme.text,
              },
            ]}
            placeholder={parameter.placeholder || parameter.label}
            placeholderTextColor={theme.textSecondary}
            value={code}
            onChangeText={setCode}
            keyboardType={parameter.type === 'number' ? 'numeric' : 'default'}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                Cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                {
                  backgroundColor:
                    theme.background === '#000' ? theme.card : theme.primary,
                  borderColor:
                    theme.background === '#000'
                      ? theme.cardBorder
                      : theme.primary,
                },
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator
                  color={theme.background === '#000' ? theme.text : '#fff'}
                />
              ) : (
                <Text
                  style={[
                    styles.submitButtonText,
                    {
                      color: theme.background === '#000' ? theme.text : '#fff',
                    },
                  ]}
                >
                  Enviar
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    alignItems: 'center',
  },
  cancelButton: {},
  submitButton: {},
  submitButtonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
