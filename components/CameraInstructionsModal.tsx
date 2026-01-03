import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { LuzIcon } from '@/components/LuzIcon';
import { FocoIcon } from '@/components/FocoIcon';
import { AnguloIcon } from '@/components/AnguloIcon';

type CameraInstructionsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function CameraInstructionsModal({
  visible,
  onClose,
}: CameraInstructionsModalProps) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            Como tirar a foto
          </Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Para garantir a melhor leitura do comprovante, siga estas dicas:
          </Text>

          <View style={styles.tipContainer}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <LuzIcon size={32} color={theme.primary} />
            </View>
            <View style={styles.tipTextContainer}>
              <Text style={[styles.tipTitle, { color: theme.text }]}>
                Boa iluminação
              </Text>
              <Text
                style={[styles.tipDescription, { color: theme.textSecondary }]}
              >
                Tire a foto em um local bem iluminado, de preferência com luz
                natural ou em ambiente claro
              </Text>
            </View>
          </View>

          <View style={styles.tipContainer}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <FocoIcon size={32} color={theme.primary} />
            </View>
            <View style={styles.tipTextContainer}>
              <Text style={[styles.tipTitle, { color: theme.text }]}>
                Foco nítido
              </Text>
              <Text
                style={[styles.tipDescription, { color: theme.textSecondary }]}
              >
                Mantenha a câmera estável e espere o foco automático antes de
                capturar a imagem
              </Text>
            </View>
          </View>

          <View style={styles.tipContainer}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <AnguloIcon size={32} color={theme.primary} />
            </View>
            <View style={styles.tipTextContainer}>
              <Text style={[styles.tipTitle, { color: theme.text }]}>
                Ângulo reto
              </Text>
              <Text
                style={[styles.tipDescription, { color: theme.textSecondary }]}
              >
                Posicione a câmera perpendicular ao comprovante, evitando
                ângulos inclinados
              </Text>
            </View>
          </View>

          <View
            style={[styles.divider, { backgroundColor: theme.cardBorder }]}
          />

          <Text style={[styles.additionalTipsTitle, { color: theme.text }]}>
            Dicas adicionais
          </Text>
          <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
            • Evite sombras sobre o comprovante
          </Text>
          <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
            • Certifique-se de que todo o texto está visível
          </Text>
          <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
            • Não tire foto de telas de computador ou celular
          </Text>
          <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
            • Evite reflexos e brilhos no papel
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={onClose}
          >
            <Text style={[styles.buttonText, { color: theme.background }]}>
              Entendi
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: 'CormorantGaramond-Bold',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 32,
    lineHeight: 26,
  },
  tipContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  tipTextContainer: {
    flex: 1,
    paddingTop: 4,
  },
  tipTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  tipDescription: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    marginVertical: 24,
  },
  additionalTipsTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 24,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  button: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
