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

export default function PoliticaPrivacidadeScreen() {
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
          Política de Privacidade
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={[styles.date, { color: theme.textSecondary }]}>
          Última atualização: 03 de janeiro de 2026
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          1. Introdução
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          A Gladius Sistemas ("nós", "nosso" ou "Pocket") está comprometida em
          proteger sua privacidade. Esta Política de Privacidade explica como
          coletamos, usamos, compartilhamos e protegemos suas informações
          pessoais quando você utiliza nosso aplicativo Pocket.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          2. Informações que coletamos
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          2.1. Informações fornecidas por você:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Dados de cadastro: nome, e-mail, senha (criptografada)
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Dados financeiros: comprovantes de gastos, valores,
          estabelecimentos, categorias
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Imagens: fotos de recibos enviadas para processamento OCR
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Dados bancários via Open Finance: transações, saldos e extratos
          (mediante sua autorização explícita através da Pluggy)
        </Text>

        <Text style={[styles.subparagraph, { color: theme.text }]}>
          2.2. Informações coletadas automaticamente:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Dados de uso: interações com o app, recursos utilizados
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Dados do dispositivo: modelo, sistema operacional, identificadores
          únicos
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Logs de erro: relatórios de falhas e desempenho via Sentry
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          3. Como usamos suas informações
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Fornecer e melhorar nossos serviços
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Processar comprovantes usando tecnologia OCR
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Gerar insights financeiros através do assistente Walts
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Personalizar sua experiência no app
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Enviar notificações importantes sobre sua conta
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Analisar e corrigir problemas técnicos
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          4. Compartilhamento de informações
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Não vendemos suas informações pessoais. Podemos compartilhar dados
          apenas com:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Provedores de serviço: Supabase (banco de dados), Google Cloud
          Vision (OCR), Anthropic (IA), Sentry (monitoramento), Pluggy (Open
          Finance)
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Plug gy: ao conectar sua conta bancária via Open Finance, seus dados
          são processados pela Pluggy conforme sua própria política de
          privacidade
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Autoridades legais: quando exigido por lei
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          5. Segurança dos dados
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Implementamos medidas de segurança técnicas e organizacionais:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Criptografia de dados em trânsito (HTTPS/TLS)
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Senhas protegidas com hash bcrypt
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Row Level Security (RLS) no banco de dados
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Acesso restrito aos dados pessoais
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          6. Seus direitos
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Você tem direito a:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Acessar seus dados pessoais
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Corrigir informações incorretas
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Solicitar exclusão da sua conta e dados
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Revogar consentimentos
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Portabilidade dos seus dados
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          7. Retenção de dados
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Mantemos suas informações enquanto sua conta estiver ativa ou conforme
          necessário para fornecer os serviços. Ao excluir sua conta, seus dados
          serão removidos permanentemente em até 30 dias.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          8. Cookies e tecnologias similares
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Usamos AsyncStorage local para manter sua sessão ativa e preferências
          do app. Esses dados ficam apenas no seu dispositivo.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          9. Privacidade de menores
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Nosso serviço não é destinado a menores de 18 anos. Não coletamos
          intencionalmente informações de crianças.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          10. Alterações nesta política
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Podemos atualizar esta Política de Privacidade periodicamente.
          Notificaremos sobre mudanças significativas através do app ou por
          e-mail.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          11. Contato
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Para questões sobre privacidade:{'\n'}
          E-mail: contato@gladiussistemas.com.br{'\n'}
          Gladius Sistemas
        </Text>

        <Text
          style={[styles.body, { color: theme.textSecondary, marginTop: 24 }]}
        >
          Ao utilizar o Pocket, você concorda com esta Política de Privacidade.
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
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
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
  date: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginTop: 20,
    marginBottom: 8,
  },
  subparagraph: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginTop: 12,
    marginBottom: 6,
  },
  body: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 26,
  },
  bulletPoint: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 26,
    marginBottom: 6,
  },
});
