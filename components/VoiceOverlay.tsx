import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { useVoice } from '@/lib/voice-context';
import { CloseIcon } from './CloseIcon';
import { MicrophoneIcon } from './MicrophoneIcon';
import { StopIcon } from './StopIcon';
import { PauseIcon } from './PauseIcon';
import { PlayIcon } from './PlayIcon';

const BAR_COLOR = '#FEE077';
const BAR_COUNT = 4;
const MIN_HEIGHT = 20;
const MAX_HEIGHT = 120;
const SILENCE_THRESHOLD = 0.15;
const IDLE_LEVEL = 0.05;
const LONG_PRESS_DURATION = 500;

function AnimatedBar({ level }: { level: number }) {
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
        <AnimatedBar key={index} level={level} />
      ))}
    </Animated.View>
  );
}

export function VoiceOverlay() {
  const { theme } = useTheme();
  const {
    state,
    closeOverlay,
    minimizeOverlay,
    startConversation,
    endConversation,
    pauseConversation,
    resumeConversation,
  } = useVoice();

  const {
    isOverlayOpen,
    isRecording,
    isProcessing,
    isPlayingResponse,
    isConversationActive,
    isPaused,
    error,
    waveformLevels,
  } = state;

  // State for split button animation
  const [showSplitButtons, setShowSplitButtons] = useState(false);
  const splitAnimValue = useRef(new Animated.Value(0)).current;
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Reset split buttons when conversation state changes
  useEffect(() => {
    if (!isConversationActive || isPaused) {
      setShowSplitButtons(false);
      splitAnimValue.setValue(0);
    }
  }, [isConversationActive, isPaused, splitAnimValue]);

  // Quando clicar no X: minimizar se conversa ativa, senão fechar
  const handleClose = () => {
    if (isConversationActive) {
      minimizeOverlay();
    } else {
      closeOverlay();
    }
  };

  const handleMainButtonPress = () => {
    console.log('[VoiceOverlay] Button pressed:', {
      showSplitButtons,
      isPaused,
      isConversationActive,
      isProcessing,
      isRecording,
    });

    if (showSplitButtons) {
      // If split buttons are showing, close them
      closeSplitButtons();
      return;
    }

    if (isPaused) {
      // Resume conversation
      console.log('[VoiceOverlay] Resuming conversation...');
      resumeConversation();
    } else if (isConversationActive) {
      // End conversation (stop button)
      console.log('[VoiceOverlay] Ending conversation...');
      endConversation();
    } else {
      // Start conversation (mic button)
      console.log('[VoiceOverlay] Starting conversation...');
      startConversation();
    }
  };

  const handleLongPressIn = () => {
    // Only allow long press when conversation is active and not paused
    if (!isConversationActive || isPaused || isProcessing) return;

    longPressTimer.current = setTimeout(() => {
      // Show split buttons
      setShowSplitButtons(true);
      Animated.spring(splitAnimValue, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }).start();
    }, LONG_PRESS_DURATION);
  };

  const handleLongPressOut = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const closeSplitButtons = () => {
    Animated.timing(splitAnimValue, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowSplitButtons(false);
    });
  };

  const handlePausePress = () => {
    closeSplitButtons();
    pauseConversation();
  };

  const handleStopPress = () => {
    closeSplitButtons();
    endConversation();
  };

  const getStatusText = (): string => {
    if (error) return 'Ocorreu um erro';
    if (isRecording) return 'Ouvindo...';
    if (isProcessing) return 'Pensando...';
    if (isPlayingResponse) return 'Walts';
    if (isPaused) return 'Pausado';
    if (isConversationActive) return 'Aguardando...';
    return 'Toque para iniciar';
  };

  // Animation interpolations for split buttons
  const leftButtonTranslate = splitAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -50],
  });

  const rightButtonTranslate = splitAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 50],
  });

  const mainButtonOpacity = splitAnimValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });

  const splitButtonOpacity = splitAnimValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
  });

  const splitButtonScale = splitAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  const renderMainButton = () => {
    console.log('[VoiceOverlay] Rendering button:', {
      isPaused,
      isConversationActive,
      icon: isPaused
        ? 'PlayIcon'
        : isConversationActive
          ? 'StopIcon'
          : 'MicrophoneIcon',
    });

    if (isPaused) {
      // Play icon in primary/yellow color
      return <PlayIcon size={28} color={theme.primary} />;
    }
    if (isConversationActive) {
      // Stop icon in red color
      return <StopIcon size={24} color={theme.error || '#FF3B30'} />;
    }
    // Microphone icon in text color
    return <MicrophoneIcon size={28} color={theme.text} />;
  };

  const getMainButtonStyle = () => {
    // All states use same background, only icon changes color
    return {
      backgroundColor: theme.fabBackground,
      borderWidth: 2,
      borderColor: theme.border,
    };
  };

  return (
    <Modal
      visible={isOverlayOpen}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: theme.card }]}
            onPress={handleClose}
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
        </View>

        <View style={styles.footer}>
          {/* Status text above button */}
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {getStatusText()}
          </Text>

          {/* Button container */}
          {!isProcessing && (
            <View style={styles.buttonContainer}>
              {/* Split buttons (pause and stop) */}
              {showSplitButtons && (
                <>
                  <Animated.View
                    style={[
                      styles.splitButtonWrapper,
                      {
                        opacity: splitButtonOpacity,
                        transform: [
                          { translateX: leftButtonTranslate },
                          { scale: splitButtonScale },
                        ],
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.splitButton,
                        {
                          backgroundColor: theme.fabBackground,
                          borderWidth: 2,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={handlePausePress}
                    >
                      <PauseIcon size={24} color={theme.primary} />
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.splitButtonWrapper,
                      {
                        opacity: splitButtonOpacity,
                        transform: [
                          { translateX: rightButtonTranslate },
                          { scale: splitButtonScale },
                        ],
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.splitButton,
                        {
                          backgroundColor: theme.fabBackground,
                          borderWidth: 2,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={handleStopPress}
                    >
                      <StopIcon size={20} color={theme.error || '#FF3B30'} />
                    </TouchableOpacity>
                  </Animated.View>
                </>
              )}

              {/* Main button */}
              <Animated.View
                style={[
                  styles.mainButtonWrapper,
                  { opacity: showSplitButtons ? mainButtonOpacity : 1 },
                ]}
              >
                <Pressable
                  style={[styles.mainButton, getMainButtonStyle()]}
                  onPress={handleMainButtonPress}
                  onPressIn={handleLongPressIn}
                  onPressOut={handleLongPressOut}
                  disabled={showSplitButtons}
                >
                  {renderMainButton()}
                </Pressable>
              </Animated.View>
            </View>
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
    marginBottom: 24,
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    width: 200,
  },
  mainButtonWrapper: {
    position: 'absolute',
  },
  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitButtonWrapper: {
    position: 'absolute',
  },
  splitButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
