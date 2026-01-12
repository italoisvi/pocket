import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '@/lib/theme';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import type { MessageAttachment } from '@/lib/chat-attachments';

type ChatMessageProps = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: MessageAttachment[];
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Função para limpar tags internas do agente (DSML, function_calls, etc.)
function cleanAgentTags(text: string): string {
  // Remove blocos de function_calls completos (formato DSML)
  let cleaned = text.replace(
    /<\s*\|?\s*DSML\s*\|?\s*function_calls[\s\S]*?<\/?\s*\|?\s*DSML\s*\|?\s*function_calls\s*>/gi,
    ''
  );

  // Remove tags antml/function_calls
  cleaned = cleaned.replace(
    /<function_calls>[\s\S]*?<\/antml:function_calls>/gi,
    ''
  );

  // Remove qualquer tag XML/DSML restante que pareça ser interna
  cleaned = cleaned.replace(
    /<\s*\|?\s*DSML[^>]*>[\s\S]*?<\/?\s*\|?\s*DSML[^>]*>/gi,
    ''
  );
  cleaned = cleaned.replace(/<\s*\|?\s*DSML[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?\s*\|?\s*DSML[^>]*>/gi, '');

  // Remove linhas que começam com < | e terminam com >
  cleaned = cleaned.replace(/^<\s*\|[^>]*>\s*$/gm, '');

  // Remove linhas vazias extras
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

export function ChatMessage({ role, content, attachments }: ChatMessageProps) {
  const { theme } = useTheme();
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Não renderizar mensagens de sistema
  if (role === 'system') {
    return null;
  }

  // Limpar tags internas do conteúdo
  const cleanedContent = cleanAgentTags(content);

  const isDarkMode = theme.background === '#000';
  const imageAttachments = attachments?.filter((a) => a.type === 'image') || [];
  const audioAttachments = attachments?.filter((a) => a.type === 'audio') || [];
  const hasOnlyAudio =
    audioAttachments.length > 0 &&
    imageAttachments.length === 0 &&
    !cleanedContent.trim();

  if (role === 'user') {
    return (
      <View style={[styles.wrapper, styles.userWrapper]}>
        {/* Imagens */}
        {imageAttachments.length > 0 && (
          <View style={styles.attachmentsContainer}>
            {imageAttachments.map((attachment) => (
              <TouchableOpacity
                key={attachment.id}
                onPress={() => setFullscreenImage(attachment.url)}
              >
                <Image
                  source={{ uri: attachment.url }}
                  style={[
                    styles.attachmentImage,
                    { borderColor: theme.cardBorder },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Áudios */}
        {audioAttachments.length > 0 && (
          <View
            style={[
              styles.audioBubble,
              {
                backgroundColor: isDarkMode ? theme.card : theme.primary,
                borderWidth: isDarkMode ? 2 : 0,
                borderColor: isDarkMode ? theme.cardBorder : 'transparent',
              },
            ]}
          >
            {audioAttachments.map((attachment) => (
              <AudioMessagePlayer
                key={attachment.id}
                audioUrl={attachment.url}
                isUserMessage={true}
              />
            ))}
          </View>
        )}

        {/* Texto (só mostrar se não for apenas áudio) */}
        {cleanedContent.trim() && !hasOnlyAudio && (
          <View
            style={[
              styles.userBubble,
              {
                backgroundColor: isDarkMode ? theme.card : theme.primary,
                borderWidth: isDarkMode ? 2 : 0,
                borderColor: isDarkMode ? theme.cardBorder : 'transparent',
              },
            ]}
          >
            <Text
              selectable={true}
              style={[
                styles.userText,
                {
                  color: isDarkMode ? theme.text : '#FFF',
                },
              ]}
            >
              {cleanedContent}
            </Text>
          </View>
        )}

        <Modal
          visible={!!fullscreenImage}
          transparent
          animationType="fade"
          onRequestClose={() => setFullscreenImage(null)}
        >
          <TouchableOpacity
            style={styles.fullscreenModal}
            activeOpacity={1}
            onPress={() => setFullscreenImage(null)}
          >
            {fullscreenImage && (
              <Image
                source={{ uri: fullscreenImage }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  // Se não houver conteúdo limpo, não renderizar
  if (!cleanedContent.trim()) {
    return null;
  }

  // Estilos do Markdown para o tema atual
  const markdownStyles = {
    body: {
      fontSize: 20,
      fontFamily: 'CormorantGaramond-Regular',
      lineHeight: 28,
      color: theme.text,
    },
    heading1: {
      fontSize: 24,
      fontFamily: 'CormorantGaramond-SemiBold',
      marginBottom: 8,
      marginTop: 12,
      color: theme.text,
    },
    heading2: {
      fontSize: 22,
      fontFamily: 'CormorantGaramond-SemiBold',
      marginBottom: 6,
      marginTop: 10,
      color: theme.text,
    },
    heading3: {
      fontSize: 20,
      fontFamily: 'CormorantGaramond-SemiBold',
      marginBottom: 4,
      marginTop: 8,
      color: theme.text,
    },
    paragraph: {
      marginBottom: 8,
      marginTop: 0,
    },
    strong: {
      fontFamily: 'CormorantGaramond-Bold',
    },
    em: {
      fontFamily: 'CormorantGaramond-Italic',
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    code_inline: {
      backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 16,
    },
    code_block: {
      backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      fontFamily: 'monospace',
      fontSize: 14,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.primary,
      paddingLeft: 12,
      marginVertical: 8,
      opacity: 0.8,
    },
    hr: {
      backgroundColor: theme.cardBorder,
      height: 1,
      marginVertical: 12,
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline',
    },
  };

  return (
    <View style={[styles.wrapper, styles.assistantWrapper]}>
      <View style={styles.assistantBubble}>
        <Markdown style={markdownStyles} selectable={true}>
          {cleanedContent}
        </Markdown>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    maxWidth: '85%',
  },
  userWrapper: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  assistantWrapper: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  userBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  audioBubble: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  userText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 26,
  },
  assistantBubble: {
    paddingVertical: 4,
  },
  assistantText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 26,
  },
  attachmentsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  attachmentImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
    borderWidth: 1,
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: screenWidth,
    height: screenHeight * 0.8,
  },
});
