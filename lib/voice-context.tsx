import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';
import { Alert } from 'react-native';
import {
  startRecording as startAudioRecording,
  stopRecording as stopAudioRecording,
  cancelRecording,
  transcribeAudio,
} from './speech';
import { sendMessageToWaltsAgent } from './walts-agent';
import type { Message } from './walts-agent';
import { synthesizeSpeech, playTTSAudio, stopTTSAudio } from './tts';
import { checkNetworkConnection } from './network';

// Adaptive silence detection settings
const CALIBRATION_DURATION_MS = 500; // Time to calibrate background noise
const SPEECH_THRESHOLD_MULTIPLIER = 1.8; // How much louder than baseline = speech
const SILENCE_DURATION_MS = 1800; // Time after speech stops to process
const MIN_SPEECH_DURATION_MS = 300; // Minimum speech duration to be valid

type VoiceState = {
  isOverlayOpen: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  isPlayingResponse: boolean;
  isConversationActive: boolean; // Track if conversation mode is active
  transcript: string | null;
  response: string | null;
  error: string | null;
  waveformLevels: number[];
};

type VoiceContextValue = {
  state: VoiceState;
  openOverlay: () => Promise<void>;
  closeOverlay: () => Promise<void>;
  startConversation: () => Promise<void>;
  endConversation: () => Promise<void>;
  cancelInteraction: () => Promise<void>;
};

const initialState: VoiceState = {
  isOverlayOpen: false,
  isRecording: false,
  isProcessing: false,
  isPlayingResponse: false,
  isConversationActive: false,
  transcript: null,
  response: null,
  error: null,
  waveformLevels: [],
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

type VoiceProviderProps = {
  children: React.ReactNode;
  isPremium: boolean;
  onShowPaywall: () => void;
};

export function VoiceProvider({
  children,
  isPremium,
  onShowPaywall,
}: VoiceProviderProps) {
  const [state, setState] = useState<VoiceState>(initialState);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const conversationActiveRef = useRef<boolean>(false);
  const conversationHistoryRef = useRef<Message[]>([]);

  // Adaptive silence detection refs
  const calibrationSamplesRef = useRef<number[]>([]);
  const baselineNoiseRef = useRef<number>(0);
  const isCalibrationDoneRef = useRef<boolean>(false);
  const calibrationStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef<boolean>(false);
  const speechStartTimeRef = useRef<number | null>(null);
  const lastSpeechTimeRef = useRef<number | null>(null);
  const recentLevelsRef = useRef<number[]>([]);

  const updateState = useCallback((updates: Partial<VoiceState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetState = useCallback(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    conversationActiveRef.current = false;
    conversationHistoryRef.current = [];
    // Reset adaptive detection
    calibrationSamplesRef.current = [];
    baselineNoiseRef.current = 0;
    isCalibrationDoneRef.current = false;
    calibrationStartRef.current = null;
    speechDetectedRef.current = false;
    speechStartTimeRef.current = null;
    lastSpeechTimeRef.current = null;
    recentLevelsRef.current = [];
    setState(initialState);
  }, []);

  const startPlaybackAnimation = useCallback(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }
    playbackIntervalRef.current = setInterval(() => {
      setState((prev) => ({
        ...prev,
        waveformLevels: [
          ...prev.waveformLevels.slice(-29),
          0.3 + Math.random() * 0.7,
        ],
      }));
    }, 100);
  }, []);

  const stopPlaybackAnimation = useCallback(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
  }, []);

  const openOverlay = useCallback(async () => {
    if (!isPremium) {
      onShowPaywall();
      return;
    }

    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
      Alert.alert(
        'Sem conexão',
        'Você está sem conexão com a internet. Conecte-se para usar o assistente de voz.'
      );
      return;
    }

    // Just open overlay, don't start recording yet
    updateState({ isOverlayOpen: true, error: null });
  }, [isPremium, onShowPaywall, updateState]);

  const closeOverlay = useCallback(async () => {
    // Abort any ongoing operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    await cancelRecording();
    await stopTTSAudio();
    resetState();
  }, [resetState]);

  // Process a single voice turn (record -> transcribe -> agent -> TTS)
  const processSingleTurn = useCallback(async (): Promise<boolean> => {
    const signal = abortControllerRef.current?.signal;

    try {
      const result = await stopAudioRecording();
      if (!result) {
        console.log('[voice-context] No recording result');
        return false;
      }

      if (signal?.aborted) {
        console.log('[voice-context] Cancelled after recording');
        return false;
      }

      updateState({ isRecording: false, isProcessing: true });

      const transcript = await transcribeAudio(result.uri);
      if (!transcript || transcript.trim().length === 0) {
        console.log('[voice-context] Empty transcript');
        updateState({ isProcessing: false });
        return true; // Continue conversation even if empty
      }

      if (signal?.aborted) {
        console.log('[voice-context] Cancelled after transcription');
        return false;
      }

      updateState({ transcript });

      // Add user message to history
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: transcript,
        timestamp: Date.now(),
      };
      conversationHistoryRef.current.push(userMessage);

      const { response } = await sendMessageToWaltsAgent(
        conversationHistoryRef.current,
        { isVoiceMode: true }
      );

      if (signal?.aborted) {
        console.log('[voice-context] Cancelled after agent response');
        return false;
      }

      // Add assistant response to history
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      conversationHistoryRef.current.push(assistantMessage);

      updateState({ response });

      try {
        const audioUri = await synthesizeSpeech(response);

        if (signal?.aborted) {
          console.log('[voice-context] Cancelled after TTS synthesis');
          return false;
        }

        updateState({ isProcessing: false, isPlayingResponse: true });
        startPlaybackAnimation();
        await playTTSAudio(audioUri);
        stopPlaybackAnimation();
        updateState({ isPlayingResponse: false });

        return true; // Success, continue conversation
      } catch (ttsError) {
        if (signal?.aborted) return false;
        console.error('[voice-context] TTS error:', ttsError);
        stopPlaybackAnimation();
        updateState({
          isProcessing: false,
          isPlayingResponse: false,
          error: 'Não foi possível reproduzir o áudio.',
        });
        return false;
      }
    } catch (error) {
      if (signal?.aborted) return false;
      console.error('[voice-context] Voice interaction error:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'O assistente está temporariamente indisponível.';
      updateState({
        isRecording: false,
        isProcessing: false,
        isPlayingResponse: false,
        error: errorMessage,
      });
      return false;
    }
  }, [updateState, startPlaybackAnimation, stopPlaybackAnimation]);

  // Reset listening state for new turn
  const resetListeningState = useCallback(() => {
    calibrationSamplesRef.current = [];
    baselineNoiseRef.current = 0;
    isCalibrationDoneRef.current = false;
    calibrationStartRef.current = null;
    speechDetectedRef.current = false;
    speechStartTimeRef.current = null;
    lastSpeechTimeRef.current = null;
    recentLevelsRef.current = [];
  }, []);

  // Start listening for next turn
  const startListening = useCallback(async () => {
    if (!conversationActiveRef.current) return;

    resetListeningState();

    updateState({
      isRecording: true,
      waveformLevels: [],
      transcript: null,
      response: null,
      error: null,
    });

    const started = await startAudioRecording((level) => {
      if (!conversationActiveRef.current) return;

      const now = Date.now();

      setState((prev) => ({
        ...prev,
        waveformLevels: [...prev.waveformLevels.slice(-29), level],
      }));

      // Keep track of recent levels for smoothing
      recentLevelsRef.current.push(level);
      if (recentLevelsRef.current.length > 5) {
        recentLevelsRef.current.shift();
      }
      const smoothedLevel =
        recentLevelsRef.current.reduce((a, b) => a + b, 0) /
        recentLevelsRef.current.length;

      // Phase 1: Calibration - learn background noise level
      if (!isCalibrationDoneRef.current) {
        if (calibrationStartRef.current === null) {
          calibrationStartRef.current = now;
          console.log('[voice-context] Starting calibration...');
        }

        calibrationSamplesRef.current.push(level);

        if (now - calibrationStartRef.current >= CALIBRATION_DURATION_MS) {
          // Calculate baseline as the average of samples
          const samples = calibrationSamplesRef.current;
          baselineNoiseRef.current =
            samples.reduce((a, b) => a + b, 0) / samples.length;
          isCalibrationDoneRef.current = true;
          console.log(
            '[voice-context] Calibration done, baseline:',
            baselineNoiseRef.current.toFixed(3)
          );
        }
        return;
      }

      // Phase 2: Detect speech vs silence relative to baseline
      const speechThreshold =
        baselineNoiseRef.current * SPEECH_THRESHOLD_MULTIPLIER;
      const isSpeaking = smoothedLevel > Math.max(speechThreshold, 0.15);

      if (isSpeaking) {
        if (!speechDetectedRef.current) {
          speechDetectedRef.current = true;
          speechStartTimeRef.current = now;
          console.log(
            '[voice-context] Speech started, level:',
            smoothedLevel.toFixed(3),
            'threshold:',
            speechThreshold.toFixed(3)
          );
        }
        lastSpeechTimeRef.current = now;
      }
    });

    if (!started) {
      updateState({ isRecording: false, isConversationActive: false });
      conversationActiveRef.current = false;
      Alert.alert(
        'Permissão necessária',
        'Permita o acesso ao microfone para usar esta função'
      );
      return;
    }

    // Start silence detection interval
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
    }
    silenceCheckIntervalRef.current = setInterval(async () => {
      if (!conversationActiveRef.current) {
        if (silenceCheckIntervalRef.current) {
          clearInterval(silenceCheckIntervalRef.current);
          silenceCheckIntervalRef.current = null;
        }
        return;
      }

      // Only check for end of speech if calibration is done and speech was detected
      if (!isCalibrationDoneRef.current || !speechDetectedRef.current) {
        return;
      }

      const now = Date.now();
      const timeSinceLastSpeech = lastSpeechTimeRef.current
        ? now - lastSpeechTimeRef.current
        : 0;
      const speechDuration = speechStartTimeRef.current
        ? (lastSpeechTimeRef.current || now) - speechStartTimeRef.current
        : 0;

      // Check if silence duration exceeded after valid speech
      if (
        timeSinceLastSpeech >= SILENCE_DURATION_MS &&
        speechDuration >= MIN_SPEECH_DURATION_MS
      ) {
        // Stop checking
        if (silenceCheckIntervalRef.current) {
          clearInterval(silenceCheckIntervalRef.current);
          silenceCheckIntervalRef.current = null;
        }

        console.log(
          '[voice-context] End of speech detected, processing...',
          'speech duration:',
          speechDuration,
          'ms'
        );

        // Process this turn
        const shouldContinue = await processSingleTurn();

        // If conversation still active and no error, start listening again
        if (shouldContinue && conversationActiveRef.current) {
          startListening();
        }
      }
    }, 100);
  }, [updateState, processSingleTurn, resetListeningState]);

  // Start continuous conversation mode
  const startConversation = useCallback(async () => {
    abortControllerRef.current = new AbortController();
    conversationActiveRef.current = true;
    conversationHistoryRef.current = [];

    updateState({ isConversationActive: true });
    await startListening();
  }, [updateState, startListening]);

  // End conversation mode
  const endConversation = useCallback(async () => {
    conversationActiveRef.current = false;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }

    await cancelRecording();
    await stopTTSAudio();
    stopPlaybackAnimation();

    updateState({
      isRecording: false,
      isProcessing: false,
      isPlayingResponse: false,
      isConversationActive: false,
      transcript: null,
      response: null,
      error: null,
      waveformLevels: [],
    });
  }, [updateState, stopPlaybackAnimation]);

  const cancelInteraction = useCallback(async () => {
    await endConversation();
  }, [endConversation]);

  const value: VoiceContextValue = {
    state,
    openOverlay,
    closeOverlay,
    startConversation,
    endConversation,
    cancelInteraction,
  };

  return (
    <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}
