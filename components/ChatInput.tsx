import { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
  Animated,
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

type ChatInputProps = {
  onSendMessage: (text: string, attachments?: MessageAttachment[]) => void;
  loading: boolean;
  isPremium: boolean;
  onShowPaywall: () => void;
};

// Animated waveform bar for smooth transitions
function AnimatedWaveformBar({
  level,
  isActive,
  color,
}: {
  level: number;
  isActive: boolean;
  color: string;
}) {
  const heightAnim = useRef(new Animated.Value(4)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const targetHeight = Math.max(4, level * 24);
    Animated.parallel([
      Animated.spring(heightAnim, {
        toValue: targetHeight,
        useNativeDriver: false,
        tension: 300,
        friction: 10,
      }),
      Animated.timing(opacityAnim, {
        toValue: isActive ? 1 : 0.3,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start();
  }, [level, isActive]);

  return (
    <Animated.View
      style={[
        styles.waveformBar,
        {
          height: heightAnim,
          backgroundColor: color,
          opacity: opacityAnim,
        },
      ]}
    />
  );
}

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
  const [waveformLevels, setWaveformLevels] = useState<number[]>([]);

  const hasText = inputText.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const hasContent = hasText || hasAttachments;
  const showSendButton = hasContent || isRecordingAudio;
  const isDisabled =
    (!hasContent && !isRecordingAudio) || loading || isProcessing;

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

    setWaveformLevels([]);
    const started = await startRecording((level) => {
      setWaveformLevels((prev) => [...prev.slice(-29), level]);
    });
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
    setWaveformLevels([]);
  };

  const handleSendAudio = async () => {
    if (!isRecordingAudio) return;

    setIsProcessing(true);
    try {
      const result = await stopRecording();
      setIsRecordingAudio(false);
      setRecordingDuration(0);
      setWaveformLevels([]);

      if (result) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          Alert.alert('Erro', 'Usuário não autenticado');
          return;
        }

        const { url } = await uploadChatAttachment(
          result.uri,
          user.id,
          'audio'
        );

        const audioAttachment: MessageAttachment = {
          id: Date.now().toString(),
          type: 'audio',
          url,
          mimeType: 'audio/m4a',
          waveform: result.waveform,
        };

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

  if (isRecordingAudio) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.background, borderTopColor: theme.border },
        ]}
      >
        <View style={styles.inputRow}>
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
            <View style={styles.waveformContainer}>
              {Array.from({ length: 30 }).map((_, i) => (
                <AnimatedWaveformBar
                  key={i}
                  level={waveformLevels[i] ?? 0}
                  isActive={waveformLevels[i] !== undefined}
                  color={theme.primary}
                />
              ))}
            </View>
            <Text style={[styles.recordingTime, { color: theme.text }]}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor:
                  theme.background === '#000' ? 'transparent' : theme.primary,
                borderColor:
                  theme.background === '#000' ? 'transparent' : theme.primary,
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
        <TouchableOpacity
          style={[
            styles.mediaButton,
            {
              backgroundColor:
                theme.background === '#000' ? 'transparent' : theme.card,
            },
          ]}
          onPress={handleGallery}
          disabled={loading || isProcessing}
        >
          <CarregarIcon size={20} color={theme.text} />
        </TouchableOpacity>

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
            autoCorrect={true}
            autoCapitalize="sentences"
            spellCheck={true}
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

        {showSendButton ? (
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor: isDisabled
                  ? theme.border
                  : theme.background === '#000'
                    ? 'transparent'
                    : theme.primary,
                borderColor: isDisabled
                  ? theme.border
                  : theme.background === '#000'
                    ? 'transparent'
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
          <View style={styles.rightButtons}>
            <TouchableOpacity
              style={[
                styles.mediaButton,
                {
                  backgroundColor:
                    theme.background === '#000' ? 'transparent' : theme.card,
                },
              ]}
              onPress={handleCamera}
              disabled={loading || isProcessing}
            >
              <CameraIcon size={20} color={theme.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.mediaButton,
                {
                  backgroundColor:
                    theme.background === '#000' ? 'transparent' : theme.card,
                },
              ]}
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginLeft: 8,
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    gap: 2,
    marginHorizontal: 8,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
  },
  recordingTime: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginRight: 8,
    minWidth: 35,
  },
});
