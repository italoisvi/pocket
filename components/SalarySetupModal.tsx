import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useTheme } from '@/lib/theme';

type SalarySetupModalProps = {
  visible: boolean;
  onConfirm: (salary: number, paymentDay: number) => void;
  onSkip?: () => void;
  loading?: boolean;
};

export function SalarySetupModal({
  visible,
  onConfirm,
  onSkip,
  loading = false,
}: SalarySetupModalProps) {
  const { theme } = useTheme();
  const [salary, setSalary] = useState('');
  const [paymentDay, setPaymentDay] = useState('');

  const formatCurrency = (value: string) => {
    // Remove tudo exceto números
    const numbers = value.replace(/\D/g, '');

    // Se não tem números, retorna vazio
    if (!numbers) return '';

    // Converte para número e divide por 100 para ter os centavos
    const amount = parseFloat(numbers) / 100;

    // Formata no padrão brasileiro
    return amount.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleSalaryChange = (text: string) => {
    const formatted = formatCurrency(text);
    setSalary(formatted);
  };

  const handleConfirm = () => {
    // Remove formatação e converte para número
    const salaryValue = parseFloat(salary.replace(/\./g, '').replace(',', '.'));
    const day = parseInt(paymentDay, 10);

    if (salaryValue > 0 && day >= 1 && day <= 31) {
      onConfirm(salaryValue, day);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <View style={[styles.container, { backgroundColor: theme.card }]}>
            {onSkip && (
              <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
                <Text
                  style={[
                    styles.skipButtonText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Pular
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: theme.text }]}>
              Bem-vindo ao Pocket!
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Para começar, informe sua renda mensal para que possamos ajudar
              você a gerenciar melhor seus gastos.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Renda Mensal
              </Text>
              <View
                style={[styles.inputWrapper, { borderColor: theme.border }]}
              >
                <Text style={[styles.currency, { color: theme.textSecondary }]}>
                  R$
                </Text>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={salary}
                  onChangeText={handleSalaryChange}
                  keyboardType="number-pad"
                  placeholder="0,00"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Dia do Pagamento
              </Text>
              <View
                style={[styles.inputWrapper, { borderColor: theme.border }]}
              >
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={paymentDay}
                  onChangeText={(text) => {
                    // Permite apenas números de 1 a 31
                    const num = text.replace(/\D/g, '');
                    if (
                      num === '' ||
                      (parseInt(num, 10) >= 1 && parseInt(num, 10) <= 31)
                    ) {
                      setPaymentDay(num);
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="1-31"
                  placeholderTextColor={theme.textSecondary}
                  maxLength={2}
                />
              </View>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Informe o dia do mês em que você recebe seu salário
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.primary },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={loading || !salary || !paymentDay}
            >
              {loading ? (
                <ActivityIndicator
                  color={theme.background === '#000' ? '#000' : '#fff'}
                />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    { color: theme.background === '#000' ? '#000' : '#fff' },
                  ]}
                >
                  Continuar
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    borderRadius: 20,
    padding: 32,
    marginHorizontal: 24,
    width: '100%',
    maxWidth: 400,
    position: 'relative',
  },
  skipButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    zIndex: 10,
  },
  skipButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 26,
  },
  inputContainer: {
    marginBottom: 32,
  },
  label: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currency: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    paddingVertical: 16,
  },
  button: {
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  hint: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginTop: 6,
  },
});
