import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Linking,
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

  const handleLinkPress = (url: string) => {
    Linking.openURL(url);
    return false;
  };

  const markdownStyles = {
    body: {
      color: theme.text,
      fontSize: 20,
      fontFamily: 'CormorantGaramond-Regular',
      lineHeight: 26,
    },
    text: {
      color: theme.text,
      fontSize: 20,
      fontFamily: 'CormorantGaramond-Regular',
      lineHeight: 26,
    },
    strong: {
      fontFamily: 'CormorantGaramond-SemiBold',
      fontWeight: '600' as const,
      color: theme.text,
    },
    em: {
      fontFamily: 'CormorantGaramond-Italic',
      fontStyle: 'italic' as const,
      color: theme.text,
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      marginVertical: 2,
      color: theme.text,
    },
    paragraph: {
      marginVertical: 4,
      color: theme.text,
      fontSize: 20,
      fontFamily: 'CormorantGaramond-Regular',
      lineHeight: 26,
    },
    heading1: {
      color: theme.text,
      fontSize: 28,
      fontFamily: 'CormorantGaramond-SemiBold',
    },
    heading2: {
      color: theme.text,
      fontSize: 24,
      fontFamily: 'CormorantGaramond-SemiBold',
    },
    code_inline: {
      color: theme.text,
      fontFamily: 'CormorantGaramond-Regular',
      backgroundColor: theme.card,
    },
    fence: {
      color: theme.text,
      fontFamily: 'CormorantGaramond-Regular',
      backgroundColor: theme.card,
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline' as const,
    },
  };

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

  return (
    <View style={[styles.wrapper, styles.assistantWrapper]}>
      <View style={styles.assistantBubble}>
        <Markdown
          style={markdownStyles}
          onLinkPress={handleLinkPress}
          rules={{
            text: (node, children, parent, styles) => (
              <Text key={node.key} style={styles.text} selectable={true}>
                {node.content}
              </Text>
            ),
          }}
        >
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
