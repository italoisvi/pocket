import { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { useTheme } from '@/lib/theme';
import { CapturaDeFotoIcon } from '@/components/CapturaDeFotoIcon';
import { CarregarIcon } from '@/components/CarregarIcon';
import { ExpenseConfirmModal } from '@/components/ExpenseConfirmModal';
import { extractReceiptData, type ReceiptData } from '@/lib/ocr';
import { supabase } from '@/lib/supabase';
import { categorizeExpense } from '@/lib/categories';

export default function CameraScreen() {
  const { theme } = useTheme();
  const [processingImage, setProcessingImage] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [currentImageUri, setCurrentImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const processImageToScan = async (imageUri: string): Promise<string> => {
    try {
      // Processar a imagem para criar efeito de scan
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Redimensionar mantendo proporção (max 1920px)
          { resize: { width: 1920 } },
        ],
        {
          // Aumentar contraste e nitidez para efeito de scan
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return manipulatedImage.uri;
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      // Se falhar, retornar a imagem original
      return imageUri;
    }
  };

  const handleTakePhoto = async () => {
    try {
      setProcessingImage(true);

      // Usar o scanner de documentos que automaticamente detecta bordas e cria efeito de scan
      const { scannedImages } = await DocumentScanner.scanDocument({
        croppedImageQuality: 100,
        maxNumDocuments: 1,
      });

      if (scannedImages && scannedImages.length > 0) {
        const scannedUri = scannedImages[0];
        setCurrentImageUri(scannedUri);

        try {
          // Extrair dados do comprovante escaneado
          const data = await extractReceiptData(scannedUri);
          setReceiptData(data);
          setShowConfirmModal(true);
        } catch (error) {
          console.error('Erro ao processar imagem:', error);
          Alert.alert('Erro', 'Não foi possível processar a imagem.');
        } finally {
          setProcessingImage(false);
        }
      } else {
        setProcessingImage(false);
      }
    } catch (error) {
      console.error('Erro ao escanear documento:', error);
      setProcessingImage(false);
      if ((error as Error).message !== 'User cancelled') {
        Alert.alert('Erro', 'Não foi possível escanear o documento.');
      }
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permissão negada',
          'É necessário permitir o acesso à galeria para selecionar fotos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const originalUri = result.assets[0].uri;
        setProcessingImage(true);

        try {
          // Processar imagem para efeito de scan
          const processedUri = await processImageToScan(originalUri);
          setCurrentImageUri(processedUri);

          // Extrair dados do comprovante
          const data = await extractReceiptData(processedUri);
          setReceiptData(data);
          setShowConfirmModal(true);
        } catch (error) {
          console.error('Erro ao processar imagem:', error);
          Alert.alert('Erro', 'Não foi possível processar a imagem.');
        } finally {
          setProcessingImage(false);
        }
      }
    } catch (error) {
      console.error('Erro ao selecionar imagem:', error);
      setProcessingImage(false);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
    }
  };

  const handleConfirmExpense = async (editedData: ReceiptData) => {
    if (!currentImageUri) {
      Alert.alert('Erro', 'Nenhuma imagem selecionada.');
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Erro', 'Usuário não autenticado.');
        return;
      }

      // Upload da imagem para o Supabase Storage
      let publicUrl: string | null = null;

      try {
        console.log('[Camera] Iniciando upload da imagem...');
        console.log('[Camera] URI da imagem:', currentImageUri);

        // Criar nome único para o arquivo
        const fileExt =
          currentImageUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        console.log('[Camera] Caminho do arquivo:', filePath);

        // Ler o arquivo usando o novo API do expo-file-system
        const file = new FileSystem.File(currentImageUri);
        const arrayBuffer = await file.arrayBuffer();

        console.log(
          '[Camera] ArrayBuffer criado, tamanho:',
          arrayBuffer.byteLength
        );

        // Upload para o storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, arrayBuffer, {
            contentType: `image/${fileExt}`,
            upsert: false,
          });

        if (uploadError) {
          console.error('[Camera] Erro no upload:', uploadError);
          throw uploadError;
        }

        console.log('[Camera] Upload realizado com sucesso:', uploadData);

        // Obter URL pública
        const {
          data: { publicUrl: url },
        } = supabase.storage.from('receipts').getPublicUrl(filePath);

        publicUrl = url;
        console.log('[Camera] URL pública gerada:', publicUrl);
      } catch (uploadError) {
        console.error('[Camera] Erro ao fazer upload da imagem:', uploadError);
        Alert.alert(
          'Aviso',
          'Não foi possível fazer upload da imagem. O gasto será salvo sem o comprovante.'
        );
        // Continuar sem a imagem se o upload falhar
        publicUrl = null;
      }

      const categorization = categorizeExpense(editedData.establishmentName);

      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        establishment_name: editedData.establishmentName,
        amount: editedData.amount,
        date: editedData.date,
        image_url: publicUrl,
        items: editedData.items,
        category: categorization.category,
        subcategory: categorization.subcategory,
      });

      if (error) throw error;

      setShowConfirmModal(false);
      setReceiptData(null);
      setCurrentImageUri(null);

      Alert.alert('Sucesso', 'Gasto registrado com sucesso!');

      // Navegar de volta para a home
      router.push('/(tabs)/home');
    } catch (error) {
      console.error('Erro ao salvar despesa:', error);
      Alert.alert('Erro', 'Não foi possível salvar a despesa.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setReceiptData(null);
    setCurrentImageUri(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[styles.header, { backgroundColor: theme.background }]}
      >
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: theme.text }]}>
            Adicionar Gasto
          </Text>
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        {processingImage ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.processingText, { color: theme.text }]}>
              Processando comprovante...
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.instruction, { color: theme.textSecondary }]}>
              Escolha como deseja adicionar seu comprovante:
            </Text>

            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={handleTakePhoto}
            >
              <CapturaDeFotoIcon size={32} color={theme.primary} />
              <Text style={[styles.buttonText, { color: theme.text }]}>
                Tirar Foto
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={handlePickImage}
            >
              <CarregarIcon size={32} color={theme.primary} />
              <Text style={[styles.buttonText, { color: theme.text }]}>
                Escolher da Galeria
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ExpenseConfirmModal
        visible={showConfirmModal}
        receiptData={receiptData}
        onConfirm={handleConfirmExpense}
        onCancel={handleCancelConfirm}
        loading={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  instruction: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginBottom: 40,
  },
  button: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 2,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginTop: 12,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 16,
  },
});
