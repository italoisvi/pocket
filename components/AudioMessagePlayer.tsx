import { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Audio } from 'expo-av';
import { useTheme } from '@/lib/theme';
import { PlayIcon } from './PlayIcon';
import { PauseIcon } from './PauseIcon';

type AudioMessagePlayerProps = {
  audioUrl: string;
  isUserMessage?: boolean;
};

// Gerar barras de waveform estáticas (simuladas)
const generateWaveformBars = (count: number): number[] => {
  const bars = [];
  for (let i = 0; i < count; i++) {
    // Criar padrão natural de áudio
    const position = i / count;
    const wave = Math.sin(position * Math.PI * 3) * 0.3;
    const random = Math.random() * 0.4 + 0.3;
    bars.push(Math.min(1, Math.max(0.15, random + wave)));
  }
  return bars;
};

export function AudioMessagePlayer({
  audioUrl,
  isUserMessage = false,
}: AudioMessagePlayerProps) {
  const { theme } = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [waveformBars] = useState(() => generateWaveformBars(30));
  const soundRef = useRef<Audio.Sound | null>(null);

  const isDarkMode = theme.background === '#000';
  const primaryColor = isUserMessage
    ? isDarkMode
      ? theme.text
      : '#FFF'
    : theme.primary;
  const secondaryColor = isUserMessage
    ? isDarkMode
      ? theme.textSecondary
      : 'rgba(255,255,255,0.6)'
    : theme.textSecondary;

  useEffect(() => {
    return () => {
      // Limpar o som ao desmontar
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const loadAndPlayAudio = async () => {
    try {
      setIsLoading(true);

      // Se já tem um som carregado, apenas tocar/pausar
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
          } else {
            await soundRef.current.playAsync();
            setIsPlaying(true);
          }
          setIsLoading(false);
          return;
        }
      }

      // Configurar modo de áudio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Carregar o áudio
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setIsPlaying(true);
    } catch (error) {
      console.error('[AudioMessagePlayer] Error loading audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setDuration(status.durationMillis || 0);
      setPosition(status.positionMillis || 0);

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        // Voltar ao início
        soundRef.current?.setPositionAsync(0);
      }
    }
  };

  const progress = duration > 0 ? position / duration : 0;
  const activeBarCount = Math.floor(progress * waveformBars.length);

  return (
    <View style={styles.container}>
      {/* Botão Play/Pause */}
      <TouchableOpacity
        style={[
          styles.playButton,
          {
            backgroundColor: primaryColor,
          },
        ]}
        onPress={loadAndPlayAudio}
        disabled={isLoading}
      >
        {isPlaying ? (
          <PauseIcon
            size={16}
            color={
              isUserMessage ? (isDarkMode ? theme.card : theme.primary) : '#FFF'
            }
          />
        ) : (
          <PlayIcon
            size={16}
            color={
              isUserMessage ? (isDarkMode ? theme.card : theme.primary) : '#FFF'
            }
          />
        )}
      </TouchableOpacity>

      {/* Waveform */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveform}>
          {waveformBars.map((height, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                {
                  height: height * 24,
                  backgroundColor:
                    index < activeBarCount ? primaryColor : secondaryColor,
                  opacity: index < activeBarCount ? 1 : 0.4,
                },
              ]}
            />
          ))}
        </View>

        {/* Duração */}
        <Text style={[styles.duration, { color: secondaryColor }]}>
          {isPlaying || position > 0
            ? formatTime(position)
            : formatTime(duration) || '0:00'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 200,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  waveformContainer: {
    flex: 1,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    minHeight: 4,
  },
  duration: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
});
