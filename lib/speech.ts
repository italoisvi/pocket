import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

let recording: Audio.Recording | null = null;
let meteringLevels: number[] = [];
let meteringCallback: ((level: number) => void) | null = null;

export async function requestAudioPermission(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[speech] Permission error:', error);
    return false;
  }
}

export async function startRecording(
  onMeteringUpdate?: (level: number) => void
): Promise<boolean> {
  try {
    const hasPermission = await requestAudioPermission();
    if (!hasPermission) {
      console.log('[speech] No audio permission');
      return false;
    }

    // Reset metering data
    meteringLevels = [];
    meteringCallback = onMeteringUpdate || null;

    // Configurar modo de áudio com todas as opções necessárias
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // Criar nova instância de gravação com metering habilitado
    const { recording: newRecording } = await Audio.Recording.createAsync(
      {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          numberOfChannels: 1,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          numberOfChannels: 1,
        },
      },
      (status) => {
        if (status.isRecording && status.metering !== undefined) {
          // Normalize metering value from dB (-160 to 0) to 0-1
          const normalizedLevel = Math.max(0, (status.metering + 60) / 60);
          meteringLevels.push(normalizedLevel);
          if (meteringCallback) {
            meteringCallback(normalizedLevel);
          }
        }
      },
      100 // Update every 100ms
    );

    recording = newRecording;
    console.log('[speech] Recording started with metering');
    return true;
  } catch (error) {
    console.error('[speech] Start recording error:', error);
    return false;
  }
}

export type RecordingResult = {
  uri: string;
  waveform: number[];
};

export async function stopRecording(): Promise<RecordingResult | null> {
  try {
    if (!recording) {
      console.log('[speech] No recording to stop');
      return null;
    }

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recording = null;
    meteringCallback = null;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    // Sample the waveform to ~30 bars for display
    const waveform = sampleWaveform(meteringLevels, 30);

    console.log(
      '[speech] Recording stopped:',
      uri,
      'waveform bars:',
      waveform.length
    );
    return uri ? { uri, waveform } : null;
  } catch (error) {
    console.error('[speech] Stop recording error:', error);
    recording = null;
    meteringCallback = null;
    return null;
  }
}

function sampleWaveform(levels: number[], targetBars: number): number[] {
  if (levels.length === 0) return Array(targetBars).fill(0.3);
  if (levels.length <= targetBars) return levels;

  const result: number[] = [];
  const step = levels.length / targetBars;

  for (let i = 0; i < targetBars; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    const slice = levels.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(avg);
  }

  return result;
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
