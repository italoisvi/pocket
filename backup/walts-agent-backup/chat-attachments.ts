import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

export type AttachmentType = 'image' | 'file' | 'audio';

export type ChatAttachment = {
  id: string;
  type: AttachmentType;
  uri: string;
  url?: string;
  mimeType: string;
  name?: string;
  size?: number;
};

export type MessageAttachment = {
  id: string;
  type: AttachmentType;
  url: string;
  mimeType: string;
  name?: string;
  size?: number;
  ocrData?: {
    establishment_name?: string;
    amount?: number;
    date?: string;
    items?: Array<{ name: string; quantity: number; price: number }>;
  };
};

function getMimeType(type: AttachmentType, ext: string): string {
  if (type === 'image') {
    const imageTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      heic: 'image/heic',
    };
    return imageTypes[ext.toLowerCase()] || 'image/jpeg';
  }
  if (type === 'audio') {
    const audioTypes: Record<string, string> = {
      m4a: 'audio/m4a',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
    };
    return audioTypes[ext.toLowerCase()] || 'audio/m4a';
  }
  return 'application/octet-stream';
}

export async function processImageForUpload(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    console.error('[chat-attachments] Error processing image:', error);
    return uri;
  }
}

export async function uploadChatAttachment(
  uri: string,
  userId: string,
  type: AttachmentType
): Promise<{ url: string; path: string }> {
  try {
    let processedUri = uri;

    if (type === 'image') {
      processedUri = await processImageForUpload(uri);
    }

    const fileExt = processedUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const fileInfo = await FileSystem.getInfoAsync(processedUri);
    if (!fileInfo.exists) {
      throw new Error('File not found');
    }

    const base64 = await FileSystem.readAsStringAsync(processedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const mimeType = getMimeType(type, fileExt);

    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, decode(base64), {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error('[chat-attachments] Upload error:', error);
      throw error;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

    console.log('[chat-attachments] Uploaded:', publicUrl);

    return { url: publicUrl, path: filePath };
  } catch (error) {
    console.error('[chat-attachments] uploadChatAttachment error:', error);
    throw error;
  }
}

export async function deleteChatAttachment(path: string): Promise<void> {
  try {
    await supabase.storage.from('chat-attachments').remove([path]);
    console.log('[chat-attachments] Deleted:', path);
  } catch (error) {
    console.error('[chat-attachments] Delete error:', error);
  }
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
