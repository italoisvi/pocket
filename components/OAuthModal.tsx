import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useTheme } from '@/lib/theme';

type OAuthModalProps = {
  visible: boolean;
  onClose: () => void;
  connectorName: string;
  oauthUrl: string;
  onSuccess: () => void;
};

export function OAuthModal({
  visible,
  onClose,
  connectorName,
  oauthUrl,
  onSuccess,
}: OAuthModalProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleOpenOAuth = async () => {
    try {
      setLoading(true);
      console.log('[OAuthModal] Opening OAuth URL:', oauthUrl);

      const canOpen = await Linking.canOpenURL(oauthUrl);

      if (!canOpen) {
        Alert.alert(
          'Erro',
          'Não foi possível abrir o link de autenticação. Por favor, tente novamente.'
        );
        return;
      }

      await Linking.openURL(oauthUrl);

      // Informar ao usuário que ele deve voltar ao app após completar
      Alert.alert(
        'Aguardando Autenticação',
        `Você será redirecionado para o ${connectorName}. Após completar a autenticação, volte para este app e a conexão será finalizada automaticamente.`,
        [
          {
            text: 'OK',
            onPress: () => {
              onClose();
              onSuccess();
            },
          },
        ]
      );
    } catch (error) {
      console.error('[OAuthModal] Error opening OAuth URL:', error);
      Alert.alert(
        'Erro',
        'Não foi possível abrir o link de autenticação. Por favor, tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
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
            Autenticação via Open Finance
          </Text>

          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Para conectar sua conta {connectorName}, você será redirecionado
            para o site ou app oficial do banco para autorizar o acesso.
          </Text>

          <Text style={[styles.description, { color: theme.textSecondary }]}>
            O banco pode solicitar:
          </Text>

          <View style={styles.bulletList}>
            <Text style={[styles.bulletItem, { color: theme.textSecondary }]}>
              • Escanear um QR Code
            </Text>
            <Text style={[styles.bulletItem, { color: theme.textSecondary }]}>
              • Aprovar via push notification
            </Text>
            <Text style={[styles.bulletItem, { color: theme.textSecondary }]}>
              • Fazer login com suas credenciais
            </Text>
          </View>

          <Text style={[styles.warning, { color: '#f59e0b' }]}>
            Após completar a autenticação, volte para este app.
          </Text>

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
              onPress={handleOpenOAuth}
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
                  Continuar
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
  bulletList: {
    marginBottom: 16,
    paddingLeft: 16,
  },
  bulletItem: {
    fontSize: 15,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 6,
    textAlign: 'left',
  },
  warning: {
    fontSize: 15,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 24,
    textAlign: 'center',
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
