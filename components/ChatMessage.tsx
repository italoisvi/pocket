import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
  LayoutChangeEvent,
} from 'react-native';
import { Audio } from 'expo-av';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '@/lib/theme';
import type { MessageAttachment } from '@/lib/chat-attachments';
import { PlayIcon } from './PlayIcon';
import { PauseIcon } from './PauseIcon';
import { AgentFeedbackButtons } from './AgentFeedbackButtons';

const MAX_IMAGE_WIDTH = 150;
const MAX_IMAGE_HEIGHT = 200;

function MessageAudio({
  uri,
  waveform,
  isDarkMode,
  theme,
}: {
  uri: string;
  waveform?: number[];
  isDarkMode: boolean;
  theme: any;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformWidth, setWaveformWidth] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const isPlayingRef = useRef(false);
  const durationRef = useRef(0);

  const bars = waveform && waveform.length > 0 ? waveform : Array(30).fill(0.3);

  useEffect(() => {
    loadSound();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [uri]);

  const startProgressAnimation = useCallback(
    (currentPos: number, totalDuration: number) => {
      if (animationRef.current) {
        animationRef.current.stop();
      }

      const currentProgress =
        totalDuration > 0 ? currentPos / totalDuration : 0;
      const remainingDuration = totalDuration - currentPos;

      progressAnim.setValue(currentProgress);

      if (remainingDuration > 0) {
        animationRef.current = Animated.timing(progressAnim, {
          toValue: 1,
          duration: remainingDuration,
          easing: Easing.linear,
          useNativeDriver: false,
        });

        animationRef.current.start();
      }
    },
    [progressAnim]
  );

  const stopProgressAnimation = useCallback(
    (currentPos: number, totalDuration: number) => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      const currentProgress =
        totalDuration > 0 ? currentPos / totalDuration : 0;
      progressAnim.setValue(currentProgress);
    },
    [progressAnim]
  );

  const loadSound = async () => {
    try {
      // Se já tem um som, verificar se está carregado
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          return; // Som já carregado, não precisa recarregar
        }
        // Som não carregado, limpar referência e recarregar
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Configurar modo de áudio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
    } catch (error) {
      console.error('[MessageAudio] Error loading sound:', error);
      soundRef.current = null;
    }
  };

  const onPlaybackStatusUpdate = useCallback(
    (status: any) => {
      if (status.isLoaded) {
        const newDuration = status.durationMillis || 0;
        const newPosition = status.positionMillis || 0;
        const nowPlaying = status.isPlaying;

        // Update duration ref and state only when changed
        if (durationRef.current !== newDuration) {
          durationRef.current = newDuration;
          setDuration(newDuration);
        }

        // Update display time
        setDisplayTime(newPosition);

        // Handle play state transitions using ref to avoid stale closure
        if (nowPlaying && !isPlayingRef.current) {
          isPlayingRef.current = true;
          setIsPlaying(true);
          startProgressAnimation(newPosition, newDuration);
        } else if (!nowPlaying && isPlayingRef.current) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          stopProgressAnimation(newPosition, newDuration);
        }

        if (status.didJustFinish) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          setDisplayTime(0);
          progressAnim.setValue(0);
          soundRef.current?.setPositionAsync(0);
        }
      }
    },
    [startProgressAnimation, stopProgressAnimation, progressAnim]
  );

  const togglePlayback = async () => {
    try {
      await loadSound();
      if (!soundRef.current) return;

      // Verificar se o som está carregado antes de tocar
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) {
        // Tentar recarregar
        soundRef.current = null;
        await loadSound();
        if (!soundRef.current) return;
      }

      if (isPlayingRef.current) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch (error) {
      console.error('[MessageAudio] Error toggling playback:', error);
      // Tentar recarregar em caso de erro
      soundRef.current = null;
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onWaveformLayout = (e: LayoutChangeEvent) => {
    setWaveformWidth(e.nativeEvent.layout.width);
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, waveformWidth],
  });

  return (
    <View
      style={[
        styles.audioContainer,
        {
          backgroundColor: isDarkMode ? theme.card : theme.primary,
          borderWidth: isDarkMode ? 2 : 0,
          borderColor: isDarkMode ? theme.cardBorder : 'transparent',
        },
      ]}
    >
      <TouchableOpacity
        onPress={togglePlayback}
        style={[
          styles.playButton,
          {
            backgroundColor: isDarkMode
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(255,255,255,0.2)',
          },
        ]}
        activeOpacity={0.7}
      >
        {isPlaying ? (
          <PauseIcon size={18} color={isDarkMode ? theme.text : '#FFF'} />
        ) : (
          <PlayIcon size={18} color={isDarkMode ? theme.text : '#FFF'} />
        )}
      </TouchableOpacity>
      <View style={styles.audioWaveformWrapper}>
        <View style={styles.audioWaveformBars} onLayout={onWaveformLayout}>
          {/* Background bars (unplayed) */}
          {bars.map((level, i) => {
            const height = Math.max(4, level * 20);
            return (
              <View
                key={i}
                style={[
                  styles.audioBar,
                  {
                    height,
                    backgroundColor: isDarkMode
                      ? theme.border
                      : 'rgba(255,255,255,0.4)',
                  },
                ]}
              />
            );
          })}
          {/* Animated overlay for played portion */}
          <Animated.View
            style={[styles.audioProgressOverlay, { width: progressWidth }]}
          >
            <View style={styles.audioWaveformBars}>
              {bars.map((level, i) => {
                const height = Math.max(4, level * 20);
                return (
                  <View
                    key={i}
                    style={[
                      styles.audioBar,
                      {
                        height,
                        backgroundColor: isDarkMode ? theme.text : '#FFF',
                      },
                    ]}
                  />
                );
              })}
            </View>
          </Animated.View>
        </View>
        <Text
          style={[
            styles.audioTime,
            { color: isDarkMode ? theme.text : '#FFF' },
          ]}
        >
          {formatTime(isPlaying || displayTime > 0 ? displayTime : duration)}
        </Text>
      </View>
    </View>
  );
}

function MessageImage({ uri }: { uri: string }) {
  const [size, setSize] = useState({
    width: MAX_IMAGE_WIDTH,
    height: MAX_IMAGE_WIDTH,
  });

  useEffect(() => {
    Image.getSize(
      uri,
      (width, height) => {
        const aspectRatio = width / height;
        let newWidth = MAX_IMAGE_WIDTH;
        let newHeight = newWidth / aspectRatio;

        if (newHeight > MAX_IMAGE_HEIGHT) {
          newHeight = MAX_IMAGE_HEIGHT;
          newWidth = newHeight * aspectRatio;
        }

        setSize({ width: newWidth, height: newHeight });
      },
      () => setSize({ width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_WIDTH })
    );
  }, [uri]);

  return (
    <Image
      source={{ uri }}
      style={[styles.messageImage, { width: size.width, height: size.height }]}
      resizeMode="cover"
    />
  );
}

type ChatMessageProps = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: MessageAttachment[];
  sessionId?: string;
  showFeedback?: boolean;
};

export function ChatMessage({
  role,
  content,
  attachments,
  sessionId,
  showFeedback,
}: ChatMessageProps) {
  const { theme, isDark } = useTheme();

  const imageAttachments = attachments?.filter((a) => a.type === 'image') || [];
  const audioAttachments = attachments?.filter((a) => a.type === 'audio') || [];
  const hasImages = imageAttachments.length > 0;
  const hasAudio = audioAttachments.length > 0;
  const hasContent = content.trim().length > 0;

  if (role === 'system' || (!hasContent && !hasImages && !hasAudio)) {
    return null;
  }

  const isDarkMode = isDark;

  if (role === 'user') {
    return (
      <View style={[styles.wrapper, styles.userWrapper]}>
        {hasImages && (
          <View style={styles.imageContainer}>
            {imageAttachments.map((img) => (
              <MessageImage key={img.id} uri={img.url} />
            ))}
          </View>
        )}
        {hasAudio && (
          <View style={styles.audioWrapper}>
            {audioAttachments.map((audio) => (
              <MessageAudio
                key={audio.id}
                uri={audio.url}
                waveform={audio.waveform}
                isDarkMode={isDarkMode}
                theme={theme}
              />
            ))}
          </View>
        )}
        {hasContent && (
          <View
            style={[
              styles.userBubble,
              {
                backgroundColor: isDarkMode ? theme.card : theme.primary,
                borderWidth: isDarkMode ? 2 : 0,
                borderColor: isDarkMode ? theme.cardBorder : 'transparent',
              },
            ]}
          >
            <Text
              selectable={true}
              style={[
                styles.userText,
                { color: isDarkMode ? theme.text : '#FFF' },
              ]}
            >
              {content}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const markdownStyles = {
    body: {
      fontSize: 20,
      fontFamily: 'DMSans-Regular',
      lineHeight: 28,
      color: theme.text,
    },
    heading1: {
      fontSize: 20,
      fontFamily: 'DMSans-SemiBold',
      marginBottom: 8,
      marginTop: 12,
      color: theme.text,
    },
    heading2: {
      fontSize: 20,
      fontFamily: 'DMSans-SemiBold',
      marginBottom: 6,
      marginTop: 10,
      color: theme.text,
    },
    paragraph: {
      marginBottom: 8,
      marginTop: 0,
    },
    strong: {
      fontFamily: 'DMSans-Bold',
    },
    bullet_list: {
      marginBottom: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    code_inline: {
      backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 16,
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline' as const,
    },
  };

  return (
    <View style={[styles.wrapper, styles.assistantWrapper]}>
      <View style={styles.assistantBubble}>
        <Markdown style={markdownStyles}>{content}</Markdown>
        {showFeedback && sessionId && (
          <AgentFeedbackButtons sessionId={sessionId} messageIndex={0} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    maxWidth: '85%',
  },
  userWrapper: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  assistantWrapper: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  userBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  userText: {
    fontSize: 20,
    fontFamily: 'DMSans-Regular',
    lineHeight: 26,
  },
  assistantBubble: {
    paddingVertical: 4,
  },
  imageContainer: {
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  messageImage: {
    borderRadius: 10,
  },
  audioWrapper: {
    alignItems: 'flex-end',
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 8,
    borderRadius: 22,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  audioWaveformWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioWaveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 1.5,
  },
  audioProgressOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  audioBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  audioTime: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    minWidth: 32,
  },
});
