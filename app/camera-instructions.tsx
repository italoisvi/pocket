import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LuzIcon } from '@/components/LuzIcon';
import { FocoIcon } from '@/components/FocoIcon';
import { AnguloIcon } from '@/components/AnguloIcon';

export default function CameraInstructionsScreen() {
  const { theme } = useTheme();

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
          Como tirar a foto
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <View style={styles.content}>
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
              Posicione a câmera perpendicular ao comprovante, evitando ângulos
              inclinados
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

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

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.buttonText, { color: theme.background }]}>
            Entendi
          </Text>
        </TouchableOpacity>
      </View>
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
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
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
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 4,
  },
  tipDescription: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 24,
  },
  additionalTipsTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    lineHeight: 24,
    marginBottom: 8,
  },
  button: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  buttonText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
});
