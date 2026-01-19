import { useState, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { LixoIcon } from './LixoIcon';
import type { ChatAttachment } from '@/lib/chat-attachments';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHAT_IMAGE_MAX_WIDTH = SCREEN_WIDTH - 100;
const CHAT_IMAGE_MAX_HEIGHT = 300;

type ChatImagePreviewProps = {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
};

export function ChatImagePreview({
  attachments,
  onRemove,
}: ChatImagePreviewProps) {
  const { theme } = useTheme();
  const [imageSizes, setImageSizes] = useState<{
    [key: string]: { width: number; height: number };
  }>({});

  useEffect(() => {
    attachments.forEach((attachment) => {
      if (attachment.type === 'image' && !imageSizes[attachment.id]) {
        Image.getSize(
          attachment.uri,
          (width, height) => {
            const aspectRatio = width / height;
            let newWidth = CHAT_IMAGE_MAX_WIDTH;
            let newHeight = newWidth / aspectRatio;

            if (newHeight > CHAT_IMAGE_MAX_HEIGHT) {
              newHeight = CHAT_IMAGE_MAX_HEIGHT;
              newWidth = newHeight * aspectRatio;
            }

            setImageSizes((prev) => ({
              ...prev,
              [attachment.id]: { width: newWidth, height: newHeight },
            }));
          },
          () => {
            setImageSizes((prev) => ({
              ...prev,
              [attachment.id]: {
                width: CHAT_IMAGE_MAX_WIDTH,
                height: CHAT_IMAGE_MAX_WIDTH,
              },
            }));
          }
        );
      }
    });
  }, [attachments]);

  if (attachments.length === 0) return null;

  return (
    <View style={styles.container}>
      {attachments.map((attachment) => {
        const size = imageSizes[attachment.id] || {
          width: CHAT_IMAGE_MAX_WIDTH,
          height: 150,
        };

        return (
          <View
            key={attachment.id}
            style={[
              styles.previewItem,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                width: size.width,
                height: size.height,
              },
            ]}
          >
            {attachment.type === 'image' && (
              <Image
                source={{ uri: attachment.uri }}
                style={[styles.image, { width: size.width, height: size.height }]}
              />
            )}
            <TouchableOpacity
              style={[
                styles.removeButton,
                { backgroundColor: theme.background },
              ]}
              onPress={() => onRemove(attachment.id)}
            >
              <LixoIcon size={16} color={theme.text} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    alignItems: 'flex-end',
  },
  previewItem: {
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
});
