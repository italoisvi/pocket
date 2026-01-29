import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getFileUrl, downloadFile } from '../utils/telegram-api.ts';
import type {
  TelegramPhotoSize,
  TelegramVoice,
  TelegramAudio,
} from '../types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function processPhoto(
  photos: TelegramPhotoSize[],
  userId: string
): Promise<string | null> {
  const largestPhoto = photos.reduce((prev, curr) =>
    (curr.file_size || 0) > (prev.file_size || 0) ? curr : prev
  );

  try {
    const fileUrl = await getFileUrl(largestPhoto.file_id);
    console.log('[media] Photo URL:', fileUrl);

    const imageBlob = await downloadFile(largestPhoto.file_id);
    const uploadedUrl = await uploadToStorage(imageBlob, userId, 'image/jpeg');

    return uploadedUrl;
  } catch (error) {
    console.error('[media] Error processing photo:', error);
    return null;
  }
}

export async function processVoice(
  voice: TelegramVoice,
  userId: string
): Promise<string | null> {
  try {
    const fileUrl = await getFileUrl(voice.file_id);
    console.log('[media] Voice URL:', fileUrl);

    const audioBlob = await downloadFile(voice.file_id);
    const uploadedUrl = await uploadToStorage(
      audioBlob,
      userId,
      voice.mime_type || 'audio/ogg'
    );

    return uploadedUrl;
  } catch (error) {
    console.error('[media] Error processing voice:', error);
    return null;
  }
}

export async function processAudio(
  audio: TelegramAudio,
  userId: string
): Promise<string | null> {
  try {
    const fileUrl = await getFileUrl(audio.file_id);
    console.log('[media] Audio URL:', fileUrl);

    const audioBlob = await downloadFile(audio.file_id);
    const uploadedUrl = await uploadToStorage(
      audioBlob,
      userId,
      audio.mime_type || 'audio/mpeg'
    );

    return uploadedUrl;
  } catch (error) {
    console.error('[media] Error processing audio:', error);
    return null;
  }
}

async function uploadToStorage(
  blob: Blob,
  userId: string,
  mimeType: string
): Promise<string> {
  const supabase = getServiceClient();

  const extension = getExtensionFromMimeType(mimeType);
  const fileName = `${userId}/${Date.now()}.${extension}`;

  const { data, error } = await supabase.storage
    .from('expense-receipts')
    .upload(fileName, blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    console.error('[media] Upload error:', error);
    throw error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('expense-receipts').getPublicUrl(data.path);

  return publicUrl;
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExtension: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
  };

  return mimeToExtension[mimeType] || 'bin';
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    console.log('[media] Transcribing audio from:', audioUrl);

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[media] Whisper API error:', errorText);
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[media] Transcription result:', data.text);

    return data.text || '';
  } catch (error) {
    console.error('[media] Transcription error:', error);
    return '';
  }
}
