import React, { createContext, useContext, useState, useCallback } from 'react';
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

type VoiceState = {
  isOverlayOpen: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  isPlayingResponse: boolean;
  transcript: string | null;
  response: string | null;
  error: string | null;
  waveformLevels: number[];
};

type VoiceContextValue = {
  state: VoiceState;
  openOverlay: () => void;
  closeOverlay: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelInteraction: () => void;
  stopPlayback: () => void;
};

const initialState: VoiceState = {
  isOverlayOpen: false,
  isRecording: false,
  isProcessing: false,
  isPlayingResponse: false,
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

  const updateState = useCallback((updates: Partial<VoiceState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialState);
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

    updateState({ isOverlayOpen: true, error: null });
  }, [isPremium, onShowPaywall, updateState]);

  const closeOverlay = useCallback(() => {
    cancelRecording();
    stopTTSAudio();
    resetState();
  }, [resetState]);

  const startRecording = useCallback(async () => {
    updateState({
      isRecording: true,
      waveformLevels: [],
      transcript: null,
      response: null,
      error: null,
    });

    const started = await startAudioRecording((level) => {
      setState((prev) => ({
        ...prev,
        waveformLevels: [...prev.waveformLevels.slice(-29), level],
      }));
    });

    if (!started) {
      updateState({ isRecording: false });
      Alert.alert(
        'Permissão necessária',
        'Permita o acesso ao microfone para usar esta função'
      );
    }
  }, [updateState]);

  const stopRecording = useCallback(async () => {
    updateState({ isRecording: false, isProcessing: true });

    try {
      const result = await stopAudioRecording();
      if (!result) {
        throw new Error('Gravação falhou');
      }

      const transcript = await transcribeAudio(result.uri);
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Não foi possível entender o áudio. Tente novamente.');
      }

      updateState({ transcript });

      const message: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: transcript,
        timestamp: Date.now(),
      };

      const { response } = await sendMessageToWaltsAgent([message]);
      updateState({ response, isProcessing: false });

      try {
        const audioUri = await synthesizeSpeech(response);
        updateState({ isPlayingResponse: true });
        await playTTSAudio(audioUri);
        updateState({ isPlayingResponse: false });
      } catch (ttsError) {
        console.error('[voice-context] TTS error:', ttsError);
        updateState({
          isPlayingResponse: false,
          error: 'Não foi possível reproduzir o áudio.',
        });
      }
    } catch (error) {
      console.error('[voice-context] Voice interaction error:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'O assistente está temporariamente indisponível.';
      updateState({
        isProcessing: false,
        isPlayingResponse: false,
        error: errorMessage,
      });
    }
  }, [updateState]);

  const cancelInteraction = useCallback(() => {
    cancelRecording();
    stopTTSAudio();
    updateState({
      isRecording: false,
      isProcessing: false,
      isPlayingResponse: false,
      error: null,
    });
  }, [updateState]);

  const stopPlayback = useCallback(() => {
    stopTTSAudio();
    updateState({ isPlayingResponse: false });
  }, [updateState]);

  const value: VoiceContextValue = {
    state,
    openOverlay,
    closeOverlay,
    startRecording,
    stopRecording,
    cancelInteraction,
    stopPlayback,
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
