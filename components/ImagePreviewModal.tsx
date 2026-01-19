import { useState, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Text,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { XIcon } from './XIcon';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const IMAGE_PADDING = 32;
const MAX_IMAGE_WIDTH = SCREEN_WIDTH - IMAGE_PADDING * 2;
const MAX_IMAGE_HEIGHT = SCREEN_HEIGHT * 0.6;

type ImagePreviewModalProps = {
  visible: boolean;
  imageUri: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmText?: string;
  cancelText?: string;
};

export function ImagePreviewModal({
  visible,
  imageUri,
  onConfirm,
  onCancel,
  loading = false,
  confirmText = 'Processar',
  cancelText = 'Cancelar',
}: ImagePreviewModalProps) {
  const { theme } = useTheme();
  const [imageSize, setImageSize] = useState({
    width: MAX_IMAGE_WIDTH,
    height: MAX_IMAGE_WIDTH,
  });

  useEffect(() => {
    if (imageUri) {
      Image.getSize(
        imageUri,
        (width, height) => {
          const aspectRatio = width / height;
          let newWidth = MAX_IMAGE_WIDTH;
          let newHeight = newWidth / aspectRatio;

          if (newHeight > MAX_IMAGE_HEIGHT) {
            newHeight = MAX_IMAGE_HEIGHT;
            newWidth = newHeight * aspectRatio;
          }

          setImageSize({ width: newWidth, height: newHeight });
        },
        () => {
          setImageSize({ width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_WIDTH });
        }
      );
    }
  }, [imageUri]);

  if (!imageUri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
        <View style={styles.content}>
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: theme.card }]}
            onPress={onCancel}
            disabled={loading}
          >
            <XIcon size={24} color={theme.text} />
          </TouchableOpacity>

          <View
            style={[
              styles.imageContainer,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Image
              source={{ uri: imageUri }}
              style={[
                styles.image,
                { width: imageSize.width, height: imageSize.height },
              ]}
              resizeMode="contain"
            />
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={[styles.loadingText, { color: '#fff' }]}>
                Processando comprovante...
              </Text>
            </View>
          ) : (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.cancelButton,
                  { backgroundColor: '#000', borderColor: '#fff' },
                ]}
                onPress={onCancel}
              >
                <Text style={[styles.buttonText, { color: '#fff' }]}>
                  {cancelText}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.confirmButton,
                  { backgroundColor: '#fff' },
                ]}
                onPress={onConfirm}
              >
                <Text style={[styles.buttonText, { color: '#000' }]}>
                  {confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: IMAGE_PADDING,
  },
  closeButton: {
    position: 'absolute',
    top: -60,
    right: IMAGE_PADDING,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imageContainer: {
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  image: {
    borderRadius: 10,
  },
  loadingContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 16,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 130,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 2,
  },
  confirmButton: {},
  buttonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
});
