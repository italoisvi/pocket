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

export default function SobrePluggyScreen() {
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
          Sobre a Pluggy
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={[styles.paragraph, { color: theme.text }]}>
          O que é a Pluggy?
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          A Pluggy é uma plataforma de infraestrutura de Open Finance que
          conecta aplicativos como o Pocket às suas instituições financeiras de
          forma segura e regulamentada.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Como funciona a integração?
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Quando você conecta sua conta bancária no Pocket, a Pluggy atua como
          intermediária entre o app e sua instituição financeira, seguindo todas
          as normas do Open Finance Brasil estabelecidas pelo Banco Central.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Dados coletados
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Através da Pluggy, o Pocket pode acessar (mediante sua autorização
          explícita):
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Informações sobre suas contas bancárias (saldo, tipo de conta)
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Histórico de transações (débitos, créditos, transferências)
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Dados de cartões de crédito (faturas e lançamentos)
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Segurança e privacidade
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          A Pluggy utiliza criptografia de ponta a ponta e segue rigorosos
          padrões de segurança do setor financeiro. Seus dados bancários são
          processados de forma segura e de acordo com a Lei Geral de Proteção de
          Dados (LGPD).
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Controle dos seus dados
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Você tem total controle sobre os dados compartilhados:
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Pode revogar o acesso a qualquer momento através do app
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Escolhe quais contas e instituições deseja conectar
        </Text>
        <Text style={[styles.bulletPoint, { color: theme.textSecondary }]}>
          • Mantém controle total sobre suas credenciais bancárias
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Por que usamos a Pluggy?
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          A Pluggy é líder em Open Finance na América Latina, oferecendo uma
          solução confiável, segura e em conformidade com todas as
          regulamentações brasileiras. Isso nos permite oferecer a você uma
          visão completa e automatizada das suas finanças.
        </Text>

        <Text style={[styles.paragraph, { color: theme.text }]}>
          Mais informações
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Para saber mais sobre como a Pluggy protege seus dados e sobre suas
          práticas de privacidade, visite:{'\n\n'}
          www.pluggy.ai
        </Text>

        <Text
          style={[styles.body, { color: theme.textSecondary, marginTop: 32 }]}
        >
          O Pocket não armazena suas credenciais bancárias. Toda autenticação é
          realizada diretamente com sua instituição financeira através da
          infraestrutura segura da Pluggy.
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
    marginBottom: 6,
  },
});
