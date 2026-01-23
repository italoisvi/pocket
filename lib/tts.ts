import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// ElevenLabs Configuration
const ELEVENLABS_VOICE_ID = '0YziWIrqiRTHCxeg1lyc';
// Using eleven_turbo_v2_5 for faster generation (optimized for low latency)
const ELEVENLABS_MODEL = 'eleven_turbo_v2_5';

// Voice settings optimized for speed while maintaining quality
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0, // Disable style for faster processing
  use_speaker_boost: false, // Disable for faster processing
};

let currentSound: Audio.Sound | null = null;

export async function synthesizeSpeech(text: string): Promise<string> {
  const apiKey = Constants.expoConfig?.extra?.elevenLabsApiKey;

  if (!apiKey) {
    console.error('[tts] ElevenLabs API key not found');
    throw new Error('API key not configured');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  const startTime = Date.now();

  // Use streaming endpoint with latency optimization
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;

  console.log('[tts] Starting TTS request...');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: VOICE_SETTINGS,
      // Maximum latency optimization (4 = fastest)
      optimize_streaming_latency: 4,
      // Output format optimized for mobile
      output_format: 'mp3_22050_32',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[tts] ElevenLabs API error:', errorText);
    throw new Error(`TTS failed: ${response.status}`);
  }

  // React Native doesn't support ReadableStream, use arrayBuffer instead
  const audioData = await response.arrayBuffer();

  const requestTime = Date.now() - startTime;
  console.log(
    `[tts] Received ${audioData.byteLength} bytes in ${requestTime}ms`
  );

  // Convert to base64 and save
  const base64Audio = arrayBufferToBase64(audioData);

  const fileUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(fileUri, base64Audio, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const totalTime = Date.now() - startTime;
  console.log(`[tts] Audio saved in ${totalTime}ms total`);

  return fileUri;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function playTTSAudio(uri: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
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
          resolve();
        }
      });

      console.log('[tts] Playing audio');
    } catch (error) {
      console.error('[tts] Playback error:', error);
      cleanupSound();
      reject(error);
    }
  });
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

  // Reset audio mode to allow recording to take over
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Ignore - might already be reset
  }
}
