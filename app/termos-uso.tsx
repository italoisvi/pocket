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

export default function TermosUsoScreen() {
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
        <Text style={[styles.title, { color: theme.text }]}>Termos de Uso</Text>
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
          1. Aceitação dos Termos
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Ao acessar e usar o aplicativo Pocket, você concorda em cumprir e
          estar vinculado a estes Termos de Uso. Se você não concordar com algum
          destes termos, não utilize nosso serviço.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          2. Descrição do Serviço
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          O Pocket é um aplicativo de gestão financeira pessoal que oferece:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Registro automático de gastos via OCR (reconhecimento óptico de
          caracteres)
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Divisão inteligente de contas
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Assistente financeiro com IA (Walts)
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Categorização e análise de despesas
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Integração com instituições financeiras via Open Finance (através da
          Pluggy)
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          3. Cadastro e Conta
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          3.1. Elegibilidade:
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Você deve ter pelo menos 18 anos para usar o Pocket.
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          3.2. Responsabilidade pela Conta:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Você é responsável por manter a confidencialidade da sua senha
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Você é responsável por todas as atividades que ocorram em sua conta
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Notifique-nos imediatamente sobre qualquer uso não autorizado
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          3.3. Veracidade das Informações:
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Você concorda em fornecer informações verdadeiras, precisas e
          completas durante o cadastro.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          4. Uso Aceitável
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Você concorda em NÃO:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Usar o serviço para fins ilegais ou não autorizados
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Violar qualquer lei em sua jurisdição
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Transmitir vírus, malware ou código malicioso
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Interferir com a operação adequada do serviço
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Tentar acessar áreas não autorizadas do sistema
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Fazer engenharia reversa do aplicativo
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Coletar dados de outros usuários sem consentimento
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          5. Propriedade Intelectual
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Todo o conteúdo, recursos e funcionalidades do Pocket (incluindo
          design, software, texto, gráficos, logos) são de propriedade exclusiva
          da Gladius Sistemas e protegidos por leis de direitos autorais, marcas
          registradas e outras leis de propriedade intelectual.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          6. Seus Dados
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Você mantém todos os direitos sobre os dados financeiros que inserir
          no Pocket. Ao usar nosso serviço, você nos concede uma licença
          limitada para processar esses dados apenas para fornecer e melhorar
          nossos serviços, conforme descrito na Política de Privacidade.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          7. Limitação de Responsabilidade
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          7.1. Precisão do OCR:
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Embora nos esforcemos para fornecer reconhecimento preciso de
          comprovantes, o OCR pode conter erros. Você é responsável por
          verificar e confirmar a precisão de todos os dados extraídos.
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          7.2. Assistente Walts:
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          As respostas do assistente Walts são geradas por IA e fornecidas
          apenas para fins informativos. Não constituem aconselhamento
          financeiro profissional.
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          7.3. Open Finance e Pluggy:
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          A integração com instituições financeiras é realizada através da
          Pluggy, um provedor terceirizado de serviços de Open Finance. Ao
          conectar suas contas bancárias, você está sujeito aos termos e
          políticas da Pluggy. Não nos responsabilizamos por eventuais
          inconsistências, atrasos ou indisponibilidade dos dados fornecidos
          pelas instituições financeiras ou pela Pluggy.
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          7.4. Disponibilidade:
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Não garantimos que o serviço estará disponível ininterruptamente ou
          livre de erros. Podemos modificar, suspender ou descontinuar qualquer
          aspecto do serviço a qualquer momento.
        </Text>
        <Text style={[styles.subparagraph, { color: theme.text }]}>
          7.5. Exclusão de Garantias:
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          O serviço é fornecido "como está" e "conforme disponível", sem
          garantias de qualquer tipo, expressas ou implícitas.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          8. Indenização
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Você concorda em indenizar e isentar a Gladius Sistemas de quaisquer
          reclamações, danos, obrigações, perdas, responsabilidades, custos ou
          dívidas decorrentes do seu uso do Pocket ou violação destes Termos.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          9. Modificações do Serviço e Termos
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Reservamo-nos o direito de modificar ou substituir estes Termos a
          qualquer momento. Se uma revisão for material, tentaremos fornecer
          aviso prévio de pelo menos 30 dias. O uso continuado do serviço após
          alterações constitui aceitação dos novos Termos.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          10. Rescisão
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Podemos encerrar ou suspender sua conta imediatamente, sem aviso
          prévio, por qualquer motivo, incluindo violação destes Termos. Você
          pode encerrar sua conta a qualquer momento através das configurações
          do app.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          11. Lei Aplicável
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Estes Termos serão regidos e interpretados de acordo com as leis do
          Brasil, sem considerar conflitos de disposições legais.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          12. Disposições Gerais
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Se qualquer disposição destes Termos for considerada inválida, as
          demais disposições permanecerão em vigor
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Nossa falha em fazer cumprir qualquer direito não constitui renúncia
          desse direito
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Você não pode transferir seus direitos sob estes Termos sem nosso
          consentimento prévio por escrito
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          13. Contato
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Para questões sobre estes Termos de Uso:{'\n'}
          E-mail: contato@gladiussistemas.com.br{'\n'}
          Gladius Sistemas
        </Text>

        <Text
          style={[
            styles.body,
            { color: theme.textSecondary, marginTop: 24, fontStyle: 'italic' },
          ]}
        >
          Ao criar uma conta e usar o Pocket, você reconhece que leu,
          compreendeu e concorda em estar vinculado a estes Termos de Uso.
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
  date: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginTop: 20,
    marginBottom: 8,
  },
  subparagraph: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    marginTop: 12,
    marginBottom: 6,
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
    marginBottom: 6,
  },
});
