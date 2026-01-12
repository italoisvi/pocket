import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

let recording: Audio.Recording | null = null;

export async function requestAudioPermission(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[speech] Permission error:', error);
    return false;
  }
}

export async function startRecording(): Promise<boolean> {
  try {
    const hasPermission = await requestAudioPermission();
    if (!hasPermission) {
      console.log('[speech] No audio permission');
      return false;
    }

    // Configurar modo de áudio com todas as opções necessárias
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // Criar nova instância de gravação
    const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    recording = newRecording;
    console.log('[speech] Recording started');
    return true;
  } catch (error) {
    console.error('[speech] Start recording error:', error);
    return false;
  }
}

export async function stopRecording(): Promise<string | null> {
  try {
    if (!recording) {
      console.log('[speech] No recording to stop');
      return null;
    }

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recording = null;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    console.log('[speech] Recording stopped:', uri);
    return uri;
  } catch (error) {
    console.error('[speech] Stop recording error:', error);
    recording = null;
    return null;
  }
}

export async function cancelRecording(): Promise<void> {
  try {
    if (recording) {
      await recording.stopAndUnloadAsync();
      recording = null;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
  } catch (error) {
    console.error('[speech] Cancel recording error:', error);
    recording = null;
  }
}

export function isRecording(): boolean {
  return recording !== null;
}

export async function transcribeAudio(audioUri: string): Promise<string> {
  try {
    const openaiApiKey = Constants.expoConfig?.extra?.openaiApiKey;

    if (!openaiApiKey) {
      console.error('[speech] OpenAI API key not found');
      throw new Error('API key not configured');
    }

    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      throw new Error('Audio file not found');
    }

    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'audio.m4a',
    } as any);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[speech] Transcription API error:', errorText);
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[speech] Transcription result:', data.text);

    return data.text || '';
  } catch (error) {
    console.error('[speech] Transcribe error:', error);
    throw error;
  }
}
