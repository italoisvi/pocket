import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';
import { LixoIcon } from './LixoIcon';
import type { ChatAttachment } from '@/lib/chat-attachments';

type ChatImagePreviewProps = {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
};

export function ChatImagePreview({
  attachments,
  onRemove,
}: ChatImagePreviewProps) {
  const { theme } = useTheme();

  if (attachments.length === 0) return null;

  return (
    <View style={styles.container}>
      {attachments.map((attachment) => (
        <View
          key={attachment.id}
          style={[
            styles.previewItem,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          {attachment.type === 'image' && (
            <Image source={{ uri: attachment.uri }} style={styles.image} />
          )}
          <TouchableOpacity
            style={[styles.removeButton, { backgroundColor: theme.background }]}
            onPress={() => onRemove(attachment.id)}
          >
            <LixoIcon size={14} color={theme.text} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  previewItem: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
