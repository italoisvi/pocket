import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';

export default function SobreNosScreen() {
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
        <Text style={[styles.title, { color: theme.text }]}>Sobre nós</Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={[styles.paragraph, { color: theme.text }]}>
          Nosso propósito
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Ajudar você a tomar decisões financeiras inteligentes, sem
          complicação.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Nossa missão
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Criar a experiência mais simples e eficiente de controle financeiro
          pessoal — combinando tecnologia de ponta (IA + OCR) com um design que
          respeita seu tempo.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          O que nos diferencia
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Leitura automática de comprovantes: tire uma foto do seu recibo e
          deixe o Pocket fazer o resto.
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Divisão de contas inteligente: racha a conta de forma justa — seja
          por pessoa, porcentagem ou valor fixo.
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Walts, seu assistente financeiro: converse naturalmente sobre suas
          finanças e receba insights personalizados.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Como funciona
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          1. Tire foto do comprovante ou escolha da galeria{'\n'}
          2. O Pocket extrai automaticamente os dados (valor, data,
          estabelecimento, itens){'\n'}
          3. Confirme ou edite as informações{'\n'}
          4. Pronto! Seu gasto está registrado e categorizado
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Feito por quem entende de tecnologia
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          O Pocket é desenvolvido pela Gladius Sistemas, empresa especializada
          em soluções digitais inovadoras.
        </Text>

        <Text
          style={[styles.body, { color: theme.textSecondary, marginTop: 24 }]}
        >
          Dúvidas, sugestões ou feedbacks?{'\n'}
          Entre em contato: contato@gladiussistemas.com.br
        </Text>
      </ScrollView>
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
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  paragraph: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    lineHeight: 26,
  },
  bulletPoint: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    lineHeight: 26,
    marginBottom: 8,
  },
});
