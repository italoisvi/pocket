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

type SalarySetupModalProps = {
  visible: boolean;
  onConfirm: (salary: number, paymentDay: number) => void;
  loading?: boolean;
};

export function SalarySetupModal({
  visible,
  onConfirm,
  loading = false,
}: SalarySetupModalProps) {
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
          <View style={styles.container}>
            <Text style={styles.title}>Bem-vindo ao Pocket!</Text>
            <Text style={styles.subtitle}>
              Para começar, informe sua renda mensal para que possamos ajudar
              você a gerenciar melhor seus gastos.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Renda Mensal</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.currency}>R$</Text>
                <TextInput
                  style={styles.input}
                  value={salary}
                  onChangeText={handleSalaryChange}
                  keyboardType="number-pad"
                  placeholder="0,00"
                  placeholderTextColor="#999"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Dia do Pagamento</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
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
                  placeholderTextColor="#999"
                  maxLength={2}
                />
              </View>
              <Text style={styles.hint}>
                Informe o dia do mês em que você recebe seu salário
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={loading || !salary || !paymentDay}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continuar</Text>
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
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    marginHorizontal: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 26,
  },
  inputContainer: {
    marginBottom: 32,
  },
  label: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 8,
    color: '#666',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currency: {
    fontSize: 24,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#666',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontFamily: 'CormorantGaramond-SemiBold',
    paddingVertical: 16,
    color: '#000',
  },
  button: {
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  hint: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    color: '#999',
    marginTop: 6,
  },
});
