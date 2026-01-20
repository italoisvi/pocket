import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { useVoice } from '@/lib/voice-context';
import { CloseIcon } from './CloseIcon';
import { VoiceCommandIcon } from './VoiceCommandIcon';

function AnimatedWaveformBar({
  level,
  isActive,
  color,
}: {
  level: number;
  isActive: boolean;
  color: string;
}) {
  const heightAnim = useRef(new Animated.Value(8)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const targetHeight = Math.max(8, level * 60);
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
  }, [level, isActive, heightAnim, opacityAnim]);

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

export function VoiceOverlay() {
  const { theme, isDark } = useTheme();
  const {
    state,
    closeOverlay,
    startRecording,
    stopRecording,
    cancelInteraction,
    stopPlayback,
  } = useVoice();

  const {
    isOverlayOpen,
    isRecording,
    isProcessing,
    isPlayingResponse,
    transcript,
    response,
    error,
    waveformLevels,
  } = state;

  useEffect(() => {
    if (isOverlayOpen && !isRecording && !isProcessing && !response && !error) {
      startRecording();
    }
  }, [
    isOverlayOpen,
    isRecording,
    isProcessing,
    response,
    error,
    startRecording,
  ]);

  const handleMainButtonPress = () => {
    if (isRecording) {
      stopRecording();
    } else if (isPlayingResponse) {
      stopPlayback();
    } else if (response || error) {
      startRecording();
    }
  };

  const renderContent = () => {
    if (error) {
      return (
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: theme.error }]}>
            {error}
          </Text>
          {response && (
            <View style={styles.responseContainer}>
              <Text
                style={[styles.responseLabel, { color: theme.textSecondary }]}
              >
                Resposta:
              </Text>
              <ScrollView style={styles.responseScroll}>
                <Text style={[styles.responseText, { color: theme.text }]}>
                  {response}
                </Text>
              </ScrollView>
            </View>
          )}
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={() => startRecording()}
          >
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (isProcessing) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Processando...
          </Text>
          {transcript && (
            <View style={styles.transcriptContainer}>
              <Text
                style={[styles.transcriptLabel, { color: theme.textSecondary }]}
              >
                Você disse:
              </Text>
              <Text style={[styles.transcriptText, { color: theme.text }]}>
                "{transcript}"
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (response) {
      return (
        <View style={styles.responseContent}>
          {transcript && (
            <View style={styles.transcriptContainer}>
              <Text
                style={[styles.transcriptLabel, { color: theme.textSecondary }]}
              >
                Você disse:
              </Text>
              <Text style={[styles.transcriptText, { color: theme.text }]}>
                "{transcript}"
              </Text>
            </View>
          )}
          <View style={styles.responseContainer}>
            <Text
              style={[styles.responseLabel, { color: theme.textSecondary }]}
            >
              Walts:
            </Text>
            <ScrollView style={styles.responseScroll}>
              <Text style={[styles.responseText, { color: theme.text }]}>
                {response}
              </Text>
            </ScrollView>
          </View>
          {isPlayingResponse && (
            <View style={styles.playingIndicator}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text
                style={[styles.playingText, { color: theme.textSecondary }]}
              >
                Reproduzindo...
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.newQuestionButton, { borderColor: theme.primary }]}
            onPress={() => startRecording()}
          >
            <VoiceCommandIcon size={20} color={theme.primary} />
            <Text style={[styles.newQuestionText, { color: theme.primary }]}>
              Nova pergunta
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (isRecording) {
      return (
        <View style={styles.centerContent}>
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
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Ouvindo...
          </Text>
          <Text style={[styles.hintText, { color: theme.textSecondary }]}>
            Toque no botao para enviar
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>
          Iniciando...
        </Text>
      </View>
    );
  };

  const getMainButtonStyle = () => {
    if (isRecording) {
      return { backgroundColor: theme.primary };
    }
    if (isPlayingResponse) {
      return { backgroundColor: theme.error };
    }
    return {
      backgroundColor: theme.card,
      borderWidth: 2,
      borderColor: theme.primary,
    };
  };

  const getMainButtonContent = () => {
    if (isRecording) {
      return <View style={styles.stopIcon} />;
    }
    if (isPlayingResponse) {
      return <View style={styles.stopIcon} />;
    }
    return <VoiceCommandIcon size={32} color={theme.primary} />;
  };

  return (
    <Modal
      visible={isOverlayOpen}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={closeOverlay}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: theme.card }]}
            onPress={closeOverlay}
          >
            <CloseIcon size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Walts</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>{renderContent()}</View>

        {!isProcessing && (
          <View style={styles.footer}>
            {isRecording && (
              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: theme.card }]}
                onPress={cancelInteraction}
              >
                <Text style={[styles.cancelText, { color: theme.error }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.mainButton, getMainButtonStyle()]}
              onPress={handleMainButtonPress}
              disabled={isProcessing}
            >
              {getMainButtonContent()}
            </TouchableOpacity>
            {isRecording && <View style={styles.cancelButton} />}
          </View>
        )}
      </View>
    </Modal>
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
    paddingTop: 60,
    paddingBottom: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centerContent: {
    alignItems: 'center',
    gap: 24,
  },
  responseContent: {
    flex: 1,
    gap: 16,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    gap: 4,
  },
  waveformBar: {
    width: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 18,
    fontFamily: 'DMSans-Medium',
  },
  hintText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  transcriptContainer: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  transcriptLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    marginBottom: 4,
  },
  transcriptText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    fontStyle: 'italic',
  },
  responseContainer: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  responseLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    marginBottom: 8,
  },
  responseScroll: {
    flex: 1,
  },
  responseText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    lineHeight: 24,
  },
  playingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playingText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  newQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 2,
    alignSelf: 'center',
  },
  newQuestionText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'DMSans-Medium',
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
    color: '#000',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 16,
  },
  cancelButton: {
    width: 80,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },
  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#000',
  },
});
