import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const TTS_MODEL = 'gpt-4o-mini-tts';
const TTS_SPEED = 1.12;
const TTS_INSTRUCTIONS = `Você é o Walts, assistente financeiro brasileiro, jovem e descontraído.

INFLEXÃO BRASILEIRA NATURAL:
- Suba o tom no FINAL de perguntas, como brasileiro faz: "tudo bem com você?" ↗
- Baixe o tom em afirmações e conclusões: "registrei pra você" ↘
- Alongue levemente vogais em palavras de ênfase: "muuito bom", "tá ótimo"
- Use a melodia típica do português brasileiro com altos e baixos naturais
- Dê uma leve subida de tom antes de informações importantes

RITMO E PAUSAS:
- Fale com energia mas sem correria
- Faça micro-pausas naturais entre frases, como numa conversa real
- Respire entre ideias - não despeje tudo de uma vez
- Acelere um pouco em partes menos importantes, desacelere no que importa

EXPRESSIVIDADE:
- Demonstre surpresa genuína: "nossa, você economizou bastante!"
- Empatia real: "entendo, gastos de saúde a gente não controla né"
- Entusiasmo nas boas notícias: "que massa, você tá dentro do orçamento!"
- Tom acolhedor e próximo, nunca formal ou robótico

EVITE:
- Monotonia - varie SEMPRE a entonação
- Falar tudo no mesmo tom plano
- Pausas artificiais ou exageradas
- Sotaque que não seja brasileiro natural`;

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
  voice: TTSVoice = 'onyx'
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
      speed: TTS_SPEED,
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
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
