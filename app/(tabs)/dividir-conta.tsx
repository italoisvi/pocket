import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { CapturaDeFotoIcon } from '@/components/CapturaDeFotoIcon';
import { CarregarIcon } from '@/components/CarregarIcon';
import { formatCurrency } from '@/lib/formatCurrency';
import { extractReceiptAmount } from '@/lib/ocr';
import DocumentScanner from 'react-native-document-scanner-plugin';

export default function DividirContaScreen() {
  const { theme } = useTheme();
  const [totalValue, setTotalValue] = useState('');
  const [peopleCount, setPeopleCount] = useState('');
  const [includeServiceCharge, setIncludeServiceCharge] = useState(false);
  const [processing, setProcessing] = useState(false);

  const formatCurrencyInput = (value: string) => {
    // Remove tudo exceto números
    const numbers = value.replace(/\D/g, '');

    if (!numbers) return '';

    // Converte para número e divide por 100 para ter os centavos
    const numberValue = parseInt(numbers) / 100;

    // Formata com separadores de milhar e decimal
    return numberValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleValueChange = (text: string) => {
    const formatted = formatCurrencyInput(text);
    setTotalValue(formatted);
  };

  const handleTakePhoto = async () => {
    try {
      setProcessing(true);

      // Usar o scanner de documentos que automaticamente detecta bordas
      const { scannedImages } = await DocumentScanner.scanDocument({
        croppedImageQuality: 100,
        maxNumDocuments: 1,
      });

      if (scannedImages && scannedImages.length > 0) {
        const scannedUri = scannedImages[0];

        try {
          const receiptData = await extractReceiptAmount(scannedUri);

          if (receiptData && receiptData.totalAmount > 0) {
            const formattedValue = receiptData.totalAmount.toLocaleString(
              'pt-BR',
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }
            );
            setTotalValue(formattedValue);
            Alert.alert(
              'Sucesso',
              `Valor detectado: ${formatCurrency(receiptData.totalAmount)}`
            );
          } else {
            Alert.alert(
              'Atenção',
              'Não foi possível detectar o valor total. Por favor, digite manualmente.'
            );
          }
        } catch (ocrError) {
          console.error('Erro ao processar OCR:', ocrError);
          Alert.alert(
            'Atenção',
            'Não foi possível detectar o valor automaticamente. Por favor, digite manualmente.'
          );
        } finally {
          setProcessing(false);
        }
      } else {
        setProcessing(false);
      }
    } catch (error) {
      console.error('Erro ao escanear documento:', error);
      setProcessing(false);
      if ((error as Error).message !== 'User cancelled') {
        Alert.alert('Erro', 'Não foi possível escanear o documento.');
      }
    }
  };

  const handlePickImage = async () => {
    setProcessing(true);
    try {
      const ImagePicker = await import('expo-image-picker');

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permissão Necessária',
          'Precisamos de permissão para acessar sua galeria.'
        );
        setProcessing(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        const imageUri = result.assets[0].uri;

        try {
          const receiptData = await extractReceiptAmount(imageUri);

          if (receiptData && receiptData.totalAmount > 0) {
            const formattedValue = receiptData.totalAmount.toLocaleString(
              'pt-BR',
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }
            );
            setTotalValue(formattedValue);
            Alert.alert(
              'Sucesso',
              `Valor detectado: ${formatCurrency(receiptData.totalAmount)}`
            );
          } else {
            Alert.alert(
              'Atenção',
              'Não foi possível detectar o valor total. Por favor, digite manualmente.'
            );
          }
        } catch (ocrError) {
          console.error('Erro ao processar OCR:', ocrError);
          Alert.alert(
            'Atenção',
            'Não foi possível detectar o valor automaticamente. Por favor, digite manualmente.'
          );
        }
      }
    } catch (error) {
      console.error('Erro ao selecionar imagem:', error);
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    } finally {
      setProcessing(false);
    }
  };

  const calculateSplit = () => {
    const total = parseFloat(totalValue.replace(/\./g, '').replace(',', '.'));
    const people = parseInt(peopleCount);

    if (isNaN(total) || total <= 0) {
      Alert.alert('Erro', 'Por favor, insira um valor válido.');
      return;
    }

    if (isNaN(people) || people <= 0) {
      Alert.alert(
        'Erro',
        'Por favor, insira uma quantidade válida de pessoas.'
      );
      return;
    }

    let finalTotal = total;

    if (includeServiceCharge) {
      finalTotal = total * 1.1; // Adiciona 10%
    }

    const perPerson = finalTotal / people;

    Alert.alert(
      'Resultado',
      `Valor total: ${formatCurrency(finalTotal)}\n\nCada pessoa paga: ${formatCurrency(perPerson)}`,
      [{ text: 'OK' }]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView
        edges={['top']}
        style={[styles.header, { backgroundColor: theme.background }]}
      >
        <Text style={[styles.title, { color: theme.text }]}>Dividir Conta</Text>
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Opções de captura */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Capturar Comprovante
          </Text>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            Tire uma foto ou carregue uma imagem do comprovante
          </Text>
          <View style={styles.captureButtons}>
            <TouchableOpacity
              style={[
                styles.captureButton,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={handleTakePhoto}
              disabled={processing}
            >
              <CapturaDeFotoIcon size={32} color={theme.primary} />
              <Text style={[styles.captureButtonText, { color: theme.text }]}>
                Tirar Foto
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.captureButton,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={handlePickImage}
              disabled={processing}
            >
              <CarregarIcon size={32} color={theme.primary} />
              <Text style={[styles.captureButtonText, { color: theme.text }]}>
                Carregar
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Divisor */}
        <View style={styles.dividerContainer}>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Text style={[styles.dividerText, { color: theme.textSecondary }]}>
            ou digite manualmente
          </Text>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
        </View>

        {/* Valor total */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <Text style={[styles.label, { color: theme.text }]}>
            Valor Total da Conta
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                borderColor: theme.cardBorder,
                color: theme.text,
              },
            ]}
            value={totalValue}
            onChangeText={handleValueChange}
            placeholder="0,00"
            placeholderTextColor={theme.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Quantidade de pessoas */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <Text style={[styles.label, { color: theme.text }]}>
            Quantas Pessoas?
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                borderColor: theme.cardBorder,
                color: theme.text,
              },
            ]}
            value={peopleCount}
            onChangeText={setPeopleCount}
            placeholder="2"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
          />
        </View>

        {/* Taxa de serviço */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={[styles.label, { color: theme.text }]}>
                Incluir Taxa de Serviço (10%)
              </Text>
              <Text
                style={[styles.switchSubtext, { color: theme.textSecondary }]}
              >
                Adicionar 10% ao valor total
              </Text>
            </View>
            <Switch
              value={includeServiceCharge}
              onValueChange={setIncludeServiceCharge}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Botão calcular */}
        <TouchableOpacity
          style={[
            styles.calculateButton,
            {
              backgroundColor:
                theme.background === '#000' ? theme.card : theme.primary,
              borderWidth: 2,
              borderColor:
                theme.background === '#000' ? theme.cardBorder : theme.primary,
            },
          ]}
          onPress={calculateSplit}
        >
          <Text
            style={[
              styles.calculateButtonText,
              {
                color: theme.background === '#000' ? theme.text : '#fff',
              },
            ]}
          >
            Calcular Divisão
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
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
    padding: 24,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 16,
  },
  captureButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  captureButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  captureButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  divider: {
    flex: 1,
    height: 2,
  },
  dividerText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  label: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
  },
  input: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  switchSubtext: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 4,
  },
  calculateButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  calculateButtonText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
