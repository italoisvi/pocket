import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { usePathname, useSegments } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { VoiceCommandIcon } from './VoiceCommandIcon';

type FloatingVoiceButtonProps = {
  onPress: () => void;
};

const HIDDEN_ROUTES = [
  '/(tabs)/chat',
  '/chat',
  '/(auth)/login',
  '/(auth)/signup',
  '/(auth)/forgot-password',
  '/(auth)/reset-password',
  '/login',
  '/signup',
  '/(tabs)/settings',
  '/settings',
  '/profile',
  '/perfil',
  '/editar-perfil',
];

// Routes within (tabs) that show the tab bar (excluding settings which hides it)
const ROUTES_WITH_TAB_BAR = [
  'home',
  'camera',
  'chat',
  'open-finance',
  'dividir-conta',
];

// Bottom position when tab bar is visible vs hidden
const BOTTOM_WITH_TAB_BAR = Platform.OS === 'ios' ? 100 : 90;
const BOTTOM_WITHOUT_TAB_BAR = Platform.OS === 'ios' ? 40 : 30;

export function FloatingVoiceButton({ onPress }: FloatingVoiceButtonProps) {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const { theme } = useTheme();

  const shouldHide = HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  if (shouldHide) {
    return null;
  }

  // Determine if tab bar is visible
  // Tab bar is visible only when inside (tabs) group and on a main tab screen
  const isInTabsGroup = segments[0] === '(tabs)';
  const currentTabScreen = segments[1];
  const hasTabBar =
    isInTabsGroup && ROUTES_WITH_TAB_BAR.includes(currentTabScreen ?? '');

  const bottomPosition = hasTabBar
    ? BOTTOM_WITH_TAB_BAR
    : BOTTOM_WITHOUT_TAB_BAR;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: theme.fabBackground, bottom: bottomPosition },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <VoiceCommandIcon size={24} color={theme.fabIcon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
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
