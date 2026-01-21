import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { useVoice } from '@/lib/voice-context';
import { CloseIcon } from './CloseIcon';

const BAR_COLOR = '#FEE077';
const BAR_COUNT = 4;
const MIN_HEIGHT = 20;
const MAX_HEIGHT = 120;
const SILENCE_THRESHOLD = 0.15;
const IDLE_LEVEL = 0.05;

function AnimatedBar({ level, index }: { level: number; index: number }) {
  const heightAnim = useRef(new Animated.Value(MIN_HEIGHT)).current;

  useEffect(() => {
    const targetHeight = MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT);

    Animated.timing(heightAnim, {
      toValue: targetHeight,
      duration: 50,
      useNativeDriver: false,
    }).start();
  }, [level, heightAnim]);

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          height: heightAnim,
          backgroundColor: BAR_COLOR,
          opacity: 0.6 + level * 0.4,
        },
      ]}
    />
  );
}

function VoiceWaveform({
  levels,
  isActive,
  isProcessing,
  isPlayingResponse,
}: {
  levels: number[];
  isActive: boolean;
  isProcessing: boolean;
  isPlayingResponse: boolean;
}) {
  const [barLevels, setBarLevels] = useState<number[]>(
    Array(BAR_COUNT).fill(0)
  );
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (animationInterval.current) {
      clearInterval(animationInterval.current);
      animationInterval.current = null;
    }

    if (isProcessing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      let phase = 0;
      animationInterval.current = setInterval(() => {
        phase += 0.3;
        const newLevels = Array.from({ length: BAR_COUNT }, (_, i) => {
          return 0.3 + Math.abs(Math.sin(phase + i * 0.8)) * 0.4;
        });
        setBarLevels(newLevels);
      }, 100);

      return () => {
        pulse.stop();
        if (animationInterval.current) {
          clearInterval(animationInterval.current);
          animationInterval.current = null;
        }
      };
    }

    if (isPlayingResponse) {
      animationInterval.current = setInterval(() => {
        const newLevels = Array.from({ length: BAR_COUNT }, () => {
          return 0.3 + Math.random() * 0.7;
        });
        setBarLevels(newLevels);
      }, 80);

      return () => {
        if (animationInterval.current) {
          clearInterval(animationInterval.current);
          animationInterval.current = null;
        }
      };
    }

    pulseAnim.setValue(1);
    if (!isActive) {
      setBarLevels(Array(BAR_COUNT).fill(0));
    }
  }, [isProcessing, isPlayingResponse, isActive, pulseAnim]);

  useEffect(() => {
    if (isProcessing || isPlayingResponse) {
      return;
    }

    if (!isActive) {
      return;
    }

    const lastLevel = levels[levels.length - 1] ?? 0;

    // Apply silence threshold - only animate when there's actual sound
    const isSilent = lastLevel < SILENCE_THRESHOLD;

    if (isSilent) {
      // During silence, show minimal idle animation
      const newLevels = Array.from({ length: BAR_COUNT }, () => {
        return IDLE_LEVEL + Math.random() * 0.03;
      });
      setBarLevels(newLevels);
    } else {
      // Active speech - amplify and show full waveform
      const normalizedLevel =
        (lastLevel - SILENCE_THRESHOLD) / (1 - SILENCE_THRESHOLD);
      const amplified = Math.min(1, normalizedLevel * 1.3);

      const newLevels = Array.from({ length: BAR_COUNT }, () => {
        const variation = 0.7 + Math.random() * 0.3;
        return amplified * variation;
      });
      setBarLevels(newLevels);
    }
  }, [levels, isActive, isProcessing, isPlayingResponse]);

  return (
    <Animated.View
      style={[styles.waveformContainer, { transform: [{ scale: pulseAnim }] }]}
    >
      {barLevels.map((level, index) => (
        <AnimatedBar key={index} level={level} index={index} />
      ))}
    </Animated.View>
  );
}

export function VoiceOverlay() {
  const { theme } = useTheme();
  const {
    state,
    closeOverlay,
    startConversation,
    endConversation,
    cancelInteraction,
  } = useVoice();

  const {
    isOverlayOpen,
    isRecording,
    isProcessing,
    isPlayingResponse,
    isConversationActive,
    error,
    waveformLevels,
  } = state;

  const handleMainButtonPress = () => {
    if (isConversationActive) {
      // End conversation (stop button)
      endConversation();
    } else {
      // Start conversation (mic button)
      startConversation();
    }
  };

  const getStatusText = (): string => {
    if (error) return 'Ocorreu um erro';
    if (isRecording) return 'Ouvindo...';
    if (isProcessing) return 'Pensando...';
    if (isPlayingResponse) return 'Walts';
    if (isConversationActive) return 'Aguardando...';
    return 'Toque para iniciar';
  };

  return (
    <Modal
      visible={isOverlayOpen}
      animationType="fade"
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
        </View>

        <View style={styles.content}>
          <VoiceWaveform
            levels={waveformLevels}
            isActive={isRecording || isPlayingResponse}
            isProcessing={isProcessing}
            isPlayingResponse={isPlayingResponse}
          />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {getStatusText()}
          </Text>
        </View>

        <View style={styles.footer}>
          {!isProcessing && (
            <TouchableOpacity
              style={[
                styles.mainButton,
                {
                  backgroundColor: isConversationActive
                    ? theme.error
                    : theme.fabBackground,
                  borderWidth: isConversationActive ? 0 : 2,
                  borderColor: theme.border,
                },
              ]}
              onPress={handleMainButtonPress}
            >
              {isConversationActive ? (
                <View style={styles.stopIcon} />
              ) : (
                <View
                  style={[styles.micIcon, { backgroundColor: theme.fabIcon }]}
                />
              )}
            </TouchableOpacity>
          )}
        </View>
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
    justifyContent: 'flex-start',
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 150,
    gap: 12,
  },
  bar: {
    width: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 18,
    fontFamily: 'DMSans-Medium',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 60,
    gap: 24,
  },
  cancelButton: {
    width: 80,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'DMSans-Medium',
  },
  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  micIcon: {
    width: 20,
    height: 28,
    borderRadius: 10,
  },
});
