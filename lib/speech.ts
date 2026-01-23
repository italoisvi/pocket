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

    // Cancel any existing recording first
    if (recording) {
      console.log('[speech] Cleaning up previous recording...');
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        // Ignore - recording might already be stopped
      }
      recording = null;
    }

    // Reset metering data
    meteringLevels = [];
    meteringCallback = onMeteringUpdate || null;

    // First, reset audio mode to playback (deactivate recording mode)
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.log('[speech] Reset audio mode warning:', error);
    }

    // Small delay to ensure audio session is fully released
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Now configure for recording
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
  const currentRecording = recording;
  const currentLevels = [...meteringLevels];

  // Reset state immediately
  recording = null;
  meteringCallback = null;
  meteringLevels = [];

  if (!currentRecording) {
    console.log('[speech] No recording to stop');
    return null;
  }

  try {
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();

    // Reset audio mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // Sample the waveform to ~30 bars for display
    const waveform = sampleWaveform(currentLevels, 30);

    console.log(
      '[speech] Recording stopped:',
      uri,
      'waveform bars:',
      waveform.length
    );
    return uri ? { uri, waveform } : null;
  } catch (error) {
    console.error('[speech] Stop recording error:', error);
    // Try to reset audio mode even on error
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      // Ignore
    }
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
  // Always reset state first
  const currentRecording = recording;
  recording = null;
  meteringCallback = null;
  meteringLevels = [];

  // Try to stop the recording if it exists
  if (currentRecording) {
    try {
      const status = await currentRecording.getStatusAsync();
      if (status.isRecording || status.canRecord) {
        await currentRecording.stopAndUnloadAsync();
      }
    } catch (error) {
      console.log('[speech] Recording already stopped or invalid');
    }
  }

  // Always reset audio mode to allow new recordings
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error('[speech] Failed to reset audio mode:', error);
  }
}

export function isRecording(): boolean {
  return recording !== null;
}

export async function transcribeAudio(audioUri: string): Promise<string> {
  try {
    const startTime = Date.now();
    const openaiApiKey = Constants.expoConfig?.extra?.openaiApiKey;

    if (!openaiApiKey) {
      console.error('[speech] OpenAI API key not found');
      throw new Error('API key not configured');
    }

    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      throw new Error('Audio file not found');
    }

    console.log('[speech] Starting transcription...');

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'audio.m4a',
    } as any);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    // Use text format for faster response (no JSON parsing overhead)
    formData.append('response_format', 'text');

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

    // With response_format: "text", response is plain text
    const text = await response.text();
    const elapsed = Date.now() - startTime;
    console.log(`[speech] Transcription completed in ${elapsed}ms:`, text);

    return text || '';
  } catch (error) {
    console.error('[speech] Transcribe error:', error);
    throw error;
  }
}
