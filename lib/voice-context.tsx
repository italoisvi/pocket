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
import { streamMessageToWaltsAgent } from './walts-agent';
import type { Message } from './walts-agent';
import { synthesizeSpeech, playTTSAudio, stopTTSAudio } from './tts';
import { checkNetworkConnection } from './network';

// Speech detection settings
const SILENCE_DURATION_MS = 1000; // Time after speech stops to process (1 second)
const MIN_SPEECH_DURATION_MS = 300; // Minimum speech duration to be valid
// Thresholds based on real device levels (your mic shows ~0.5 baseline)
const SPEECH_THRESHOLD = 0.55; // Level above this = speaking
const SILENCE_THRESHOLD = 0.48; // Level below this = not speaking (your baseline is ~0.48-0.53)

type VoiceState = {
  isOverlayOpen: boolean;
  isMinimized: boolean; // Conversa ativa mas overlay fechado
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
  minimizeOverlay: () => void;
  startConversation: () => Promise<void>;
  endConversation: () => Promise<void>;
  cancelInteraction: () => Promise<void>;
};

const initialState: VoiceState = {
  isOverlayOpen: false,
  isMinimized: false,
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

  // Speech detection refs
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
    // Reset speech detection
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
    // Se estiver minimizado, apenas reabrir o overlay
    if (state.isMinimized) {
      updateState({ isOverlayOpen: true, isMinimized: false });
      return;
    }

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
  }, [isPremium, onShowPaywall, updateState, state.isMinimized]);

  // Minimizar overlay sem encerrar conversa
  const minimizeOverlay = useCallback(() => {
    updateState({ isOverlayOpen: false, isMinimized: true });
  }, [updateState]);

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
    const totalStart = Date.now();

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

      // Step 1: Transcription
      const transcribeStart = Date.now();
      const transcript = await transcribeAudio(result.uri);
      console.log(
        `[voice-context] TIMING - Transcription: ${Date.now() - transcribeStart}ms`
      );

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

      // Step 2: Walts Agent with STREAMING
      const agentStart = Date.now();

      // Use streaming for faster response
      const streamResult = await new Promise<{
        response: string;
        sessionId: string;
      }>((resolve, reject) => {
        let accumulatedText = '';

        streamMessageToWaltsAgent(conversationHistoryRef.current, {
          onChunk: (chunk) => {
            accumulatedText += chunk;
            // Update UI with partial response
            updateState({ response: accumulatedText });
          },
          onComplete: (fullResponse, sessionId) => {
            resolve({ response: fullResponse, sessionId });
          },
          onError: (error) => {
            reject(error);
          },
        });
      });

      console.log(
        `[voice-context] TIMING - Walts Agent (streaming): ${Date.now() - agentStart}ms`
      );

      if (signal?.aborted) {
        console.log('[voice-context] Cancelled after agent response');
        return false;
      }

      const response = streamResult.response;

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
        // Step 3: TTS (already has timing logs in tts.ts)
        const audioUri = await synthesizeSpeech(response);

        if (signal?.aborted) {
          console.log('[voice-context] Cancelled after TTS synthesis');
          return false;
        }

        console.log(
          `[voice-context] TIMING - Total processing: ${Date.now() - totalStart}ms`
        );

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

      // Use fixed thresholds for reliable detection
      const isSpeaking = smoothedLevel > SPEECH_THRESHOLD;
      const isSilent = smoothedLevel < SILENCE_THRESHOLD;

      if (isSpeaking) {
        if (!speechDetectedRef.current) {
          speechDetectedRef.current = true;
          speechStartTimeRef.current = now;
          console.log(
            '[voice-context] Speech started, level:',
            smoothedLevel.toFixed(3)
          );
        }
        lastSpeechTimeRef.current = now;
      }

      // Log periodically for debugging
      if (Math.random() < 0.1) {
        console.log(
          '[voice-context] Level:',
          smoothedLevel.toFixed(3),
          'Speaking:',
          isSpeaking,
          'Silent:',
          isSilent,
          'Detected:',
          speechDetectedRef.current
        );
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

      // Only check for end of speech if speech was detected
      if (!speechDetectedRef.current) {
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
      isMinimized: false,
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
    minimizeOverlay,
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
