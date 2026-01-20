import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { VoiceCommandIcon } from './VoiceCommandIcon';

type FloatingVoiceButtonProps = {
  onPress: () => void;
};

const HIDDEN_ROUTES = ['/(tabs)/chat', '/chat'];

export function FloatingVoiceButton({ onPress }: FloatingVoiceButtonProps) {
  const pathname = usePathname();
  const { theme } = useTheme();

  const shouldHide = HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  if (shouldHide) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.primary }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <VoiceCommandIcon size={24} color="#000" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 90,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
});
