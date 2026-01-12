import { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DocumentScanner from 'react-native-document-scanner-plugin';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme } from '@/lib/theme';
import { CameraIcon } from './CameraIcon';
import { CarregarIcon } from './CarregarIcon';
import { MicrophoneIcon } from './MicrophoneIcon';
import { AviaDePapelIcon } from './AviaDePapelIcon';
import { TrashIcon } from './TrashIcon';
import { ChatImagePreview } from './ChatImagePreview';
import {
  startRecording,
  stopRecording,
  cancelRecording,
  isRecording as checkIsRecording,
} from '@/lib/speech';
import type { ChatAttachment, MessageAttachment } from '@/lib/chat-attachments';
import { uploadChatAttachment } from '@/lib/chat-attachments';
import { supabase } from '@/lib/supabase';
import { extractReceiptData } from '@/lib/ocr';

type ChatInputProps = {
  onSendMessage: (text: string, attachments?: MessageAttachment[]) => void;
  loading: boolean;
  isPremium: boolean;
  onShowPaywall: () => void;
};

export function ChatInput({
  onSendMessage,
  loading,
  isPremium,
  onShowPaywall,
}: ChatInputProps) {
  const { theme } = useTheme();
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<
    ChatAttachment[]
  >([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const hasText = inputText.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const hasContent = hasText || hasAttachments;
  const showSendButton = hasContent || isRecordingAudio;
  const isDisabled =
    (!hasContent && !isRecordingAudio) || loading || isProcessing;

  // Timer para mostrar duração da gravação
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecordingAudio) {
      setRecordingDuration(0);
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecordingAudio]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const processImageToScan = async (uri: string): Promise<string> => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1920 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    } catch (error) {
      console.error('[ChatInput] Error processing image:', error);
      return uri;
    }
  };

  const handleCamera = async () => {
    if (!isPremium) {
      onShowPaywall();
      return;
    }

    try {
      const { scannedImages } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
      });

      if (scannedImages && scannedImages.length > 0) {
        const processedUri = await processImageToScan(scannedImages[0]);
        addAttachment(processedUri, 'image');
      }
    } catch (error: any) {
      if (error.message !== 'User canceled') {
        console.error('[ChatInput] Camera error:', error);
        Alert.alert('Erro', 'Não foi possível capturar a imagem');
      }
    }
  };

  const handleGallery = async () => {
    if (!isPremium) {
      onShowPaywall();
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        const processedUri = await processImageToScan(result.assets[0].uri);
        addAttachment(processedUri, 'image');
      }
    } catch (error) {
      console.error('[ChatInput] Gallery error:', error);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem');
    }
  };

  const handleStartRecording = async () => {
    if (!isPremium) {
      onShowPaywall();
      return;
    }

    const started = await startRecording();
    if (started) {
      setIsRecordingAudio(true);
    } else {
      Alert.alert(
        'Permissão necessária',
        'Permita o acesso ao microfone para usar esta função'
      );
    }
  };

  const handleCancelRecording = async () => {
    await cancelRecording();
    setIsRecordingAudio(false);
    setRecordingDuration(0);
  };

  const handleSendAudio = async () => {
    if (!isRecordingAudio) return;

    setIsProcessing(true);
    try {
      const audioUri = await stopRecording();
      setIsRecordingAudio(false);
      setRecordingDuration(0);

      if (audioUri) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          Alert.alert('Erro', 'Usuário não autenticado');
          return;
        }

        // Upload do áudio para o Storage
        const { url } = await uploadChatAttachment(audioUri, user.id, 'audio');

        const audioAttachment: MessageAttachment = {
          id: Date.now().toString(),
          type: 'audio',
          url,
          mimeType: 'audio/m4a',
        };

        // Enviar mensagem com áudio (Walts vai transcrever)
        onSendMessage('', [audioAttachment]);
      }
    } catch (error) {
      console.error('[ChatInput] Audio send error:', error);
      Alert.alert('Erro', 'Não foi possível enviar o áudio');
    } finally {
      setIsProcessing(false);
    }
  };

  const addAttachment = (uri: string, type: 'image' | 'audio') => {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType =
      type === 'image' ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'audio/m4a';

    const attachment: ChatAttachment = {
      id: Date.now().toString(),
      type,
      uri,
      mimeType,
    };

    setPendingAttachments((prev) => [...prev, attachment]);
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = async () => {
    // Se estiver gravando, envia o áudio
    if (isRecordingAudio) {
      await handleSendAudio();
      return;
    }

    if (isDisabled) return;

    if (!isPremium) {
      onShowPaywall();
      return;
    }

    setIsProcessing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Erro', 'Usuário não autenticado');
        return;
      }

      let uploadedAttachments: MessageAttachment[] = [];

      if (pendingAttachments.length > 0) {
        for (const attachment of pendingAttachments) {
          const { url } = await uploadChatAttachment(
            attachment.uri,
            user.id,
            attachment.type
          );

          const messageAttachment: MessageAttachment = {
            id: attachment.id,
            type: attachment.type,
            url,
            mimeType: attachment.mimeType,
          };

          // Se for imagem, processar via OCR
          if (attachment.type === 'image') {
            try {
              console.log('[ChatInput] Processing image with OCR...');
              const ocrData = await extractReceiptData(attachment.uri);
              messageAttachment.ocrData = {
                establishment_name: ocrData.establishmentName,
                amount: ocrData.amount,
                date: ocrData.date,
                items: ocrData.items,
              };
              console.log('[ChatInput] OCR result:', ocrData);
            } catch (ocrError) {
              console.log(
                '[ChatInput] OCR failed, sending without data:',
                ocrError
              );
            }
          }

          uploadedAttachments.push(messageAttachment);
        }
      }

      onSendMessage(inputText.trim(), uploadedAttachments);
      setInputText('');
      setPendingAttachments([]);
    } catch (error) {
      console.error('[ChatInput] Send error:', error);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (checkIsRecording()) {
        cancelRecording();
      }
    };
  }, []);

  // Renderizar modo de gravação
  if (isRecordingAudio) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.background, borderTopColor: theme.border },
        ]}
      >
        <View style={styles.inputRow}>
          {/* Botão Cancelar */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
            ]}
            onPress={handleCancelRecording}
            disabled={isProcessing}
          >
            <TrashIcon size={20} color="#FFF" />
          </TouchableOpacity>

          {/* Indicador de gravação */}
          <View
            style={[
              styles.recordingIndicator,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <View style={styles.recordingDot} />
            <Text style={[styles.recordingText, { color: theme.text }]}>
              Gravando... {formatDuration(recordingDuration)}
            </Text>
          </View>

          {/* Botão Enviar */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor:
                  theme.background === '#000' ? theme.card : theme.primary,
                borderColor:
                  theme.background === '#000'
                    ? theme.cardBorder
                    : theme.primary,
              },
            ]}
            onPress={handleSend}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator
                size="small"
                color={theme.background === '#000' ? theme.text : '#FFF'}
              />
            ) : (
              <AviaDePapelIcon
                size={20}
                color={theme.background === '#000' ? theme.text : '#FFF'}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, borderTopColor: theme.border },
      ]}
    >
      <ChatImagePreview
        attachments={pendingAttachments}
        onRemove={removeAttachment}
      />

      <View style={styles.inputRow}>
        {/* Esquerda: Galeria */}
        <TouchableOpacity
          style={[styles.mediaButton, { backgroundColor: theme.card }]}
          onPress={handleGallery}
          disabled={loading || isProcessing}
        >
          <CarregarIcon size={20} color={theme.text} />
        </TouchableOpacity>

        {/* Centro: Input */}
        {isPremium ? (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                color: theme.text,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Digite sua mensagem..."
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={1000}
            editable={!loading && !isProcessing}
          />
        ) : (
          <TouchableOpacity
            style={[
              styles.input,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                justifyContent: 'center',
              },
            ]}
            onPress={onShowPaywall}
          >
            <Text style={[styles.placeholder, { color: theme.textSecondary }]}>
              Assine para conversar com Walts
            </Text>
          </TouchableOpacity>
        )}

        {/* Direita: Botões dinâmicos */}
        {showSendButton ? (
          // Mostrar botão de enviar quando tem texto ou attachments
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor: isDisabled
                  ? theme.border
                  : theme.background === '#000'
                    ? theme.card
                    : theme.primary,
                borderColor: isDisabled
                  ? theme.border
                  : theme.background === '#000'
                    ? theme.cardBorder
                    : theme.primary,
              },
            ]}
            onPress={handleSend}
            disabled={isDisabled}
          >
            {loading || isProcessing ? (
              <ActivityIndicator
                size="small"
                color={theme.background === '#000' ? theme.text : '#FFF'}
              />
            ) : (
              <AviaDePapelIcon
                size={20}
                color={
                  isDisabled
                    ? theme.textSecondary
                    : theme.background === '#000'
                      ? theme.text
                      : '#FFF'
                }
              />
            )}
          </TouchableOpacity>
        ) : (
          // Mostrar câmera + áudio quando não está digitando
          <View style={styles.rightButtons}>
            <TouchableOpacity
              style={[styles.mediaButton, { backgroundColor: theme.card }]}
              onPress={handleCamera}
              disabled={loading || isProcessing}
            >
              <CameraIcon size={20} color={theme.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mediaButton, { backgroundColor: theme.card }]}
              onPress={handleStartRecording}
              disabled={loading || isProcessing}
            >
              <MicrophoneIcon size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  mediaButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  placeholder: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingIndicator: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 2,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  recordingText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
