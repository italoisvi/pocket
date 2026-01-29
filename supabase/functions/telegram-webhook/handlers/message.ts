import type { TelegramMessage, TelegramAccountRow, UserId } from '../types.ts';
import { sendMessage, sendTypingAction } from '../utils/telegram-api.ts';
import { markdownToTelegramHtml } from '../utils/format.ts';
import { findTelegramAccount, createTelegramUser } from '../services/auth.ts';
import {
  handleOnboardingMessage,
  startOnboarding,
} from '../services/onboarding.ts';
import { callWaltsAgentWithHistory } from '../services/agent.ts';
import { processPhoto, processVoice, processAudio } from '../services/media.ts';

export async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const telegramUser = message.from;

  if (!telegramUser) {
    console.error('[message] No user in message');
    return;
  }

  const telegramUserId = telegramUser.id;

  let telegramAccount = await findTelegramAccount(telegramUserId as any);

  if (!telegramAccount) {
    const { telegramAccount: newAccount } =
      await createTelegramUser(telegramUser);
    telegramAccount = newAccount;
    await startOnboarding(chatId, telegramAccount);
    return;
  }

  if (!telegramAccount.onboarding_completed) {
    const text = message.text || message.caption || '';

    if (text) {
      const handled = await handleOnboardingMessage(
        chatId,
        telegramAccount,
        text
      );
      if (handled) return;
    }

    await sendMessage({
      chat_id: chatId,
      text: 'Por favor, complete o cadastro primeiro. Use /start para continuar.',
    });
    return;
  }

  await sendTypingAction(chatId);

  try {
    const { text, imageUrls, audioUrls } = await extractMessageContent(
      message,
      telegramAccount.user_id
    );

    if (!text && (!imageUrls || imageUrls.length === 0)) {
      await sendMessage({
        chat_id: chatId,
        text: 'Desculpe, não consegui processar sua mensagem. Tente enviar texto, foto ou áudio.',
      });
      return;
    }

    const response = await callWaltsAgentWithHistory(
      telegramAccount.user_id as UserId,
      telegramAccount.id,
      text || 'Analise esta imagem e registre o gasto.',
      imageUrls,
      audioUrls
    );

    const formattedResponse = markdownToTelegramHtml(response);

    await sendMessage({
      chat_id: chatId,
      text: formattedResponse,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('[message] Error processing message:', error);
    await sendMessage({
      chat_id: chatId,
      text: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
    });
  }
}

async function extractMessageContent(
  message: TelegramMessage,
  userId: string
): Promise<{
  text: string;
  imageUrls?: string[];
  audioUrls?: string[];
}> {
  let text = message.text || message.caption || '';
  const imageUrls: string[] = [];
  const audioUrls: string[] = [];

  if (message.photo && message.photo.length > 0) {
    const photoUrl = await processPhoto(message.photo, userId);
    if (photoUrl) {
      imageUrls.push(photoUrl);
    }
  }

  if (message.voice) {
    const voiceUrl = await processVoice(message.voice, userId);
    if (voiceUrl) {
      audioUrls.push(voiceUrl);
    }
  }

  if (message.audio) {
    const audioUrl = await processAudio(message.audio, userId);
    if (audioUrl) {
      audioUrls.push(audioUrl);
    }
  }

  return {
    text,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    audioUrls: audioUrls.length > 0 ? audioUrls : undefined,
  };
}
