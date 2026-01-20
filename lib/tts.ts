import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const TTS_MODEL = 'gpt-4o-mini-tts';
const TTS_INSTRUCTIONS =
  'Fale em português brasileiro de forma natural e amigável. Use tom conversacional.';

export type TTSVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'nova'
  | 'onyx'
  | 'sage'
  | 'shimmer';

let currentSound: Audio.Sound | null = null;

export async function synthesizeSpeech(
  text: string,
  voice: TTSVoice = 'nova'
): Promise<string> {
  const openaiApiKey = Constants.expoConfig?.extra?.openaiApiKey;

  if (!openaiApiKey) {
    console.error('[tts] OpenAI API key not found');
    throw new Error('API key not configured');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  const response = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text,
      voice,
      response_format: 'mp3',
      instructions: TTS_INSTRUCTIONS,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[tts] TTS API error:', errorText);
    throw new Error(`TTS failed: ${response.status}`);
  }

  const audioData = await response.arrayBuffer();
  const base64Audio = arrayBufferToBase64(audioData);

  const fileUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(fileUri, base64Audio, {
    encoding: FileSystem.EncodingType.Base64,
  });

  console.log('[tts] Audio saved to:', fileUri);
  return fileUri;
}

export async function playTTSAudio(uri: string): Promise<void> {
  try {
    await stopTTSAudio();

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true }
    );

    currentSound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        cleanupSound();
      }
    });

    console.log('[tts] Playing audio');
  } catch (error) {
    console.error('[tts] Playback error:', error);
    cleanupSound();
    throw error;
  }
}

export async function stopTTSAudio(): Promise<void> {
  await cleanupSound();
}

async function cleanupSound(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {
      // Ignore cleanup errors
    }
    currentSound = null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
