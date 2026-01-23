import { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Platform,
  View,
  Animated,
} from 'react-native';
import { usePathname, useSegments } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { VoiceCommandIcon } from './VoiceCommandIcon';

type FloatingVoiceButtonProps = {
  onPress: () => void;
  isMinimized?: boolean;
  waveformLevels?: number[];
  onEndConversation?: () => void;
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

// Mini waveform constants
const MINI_BAR_COUNT = 3;
const MINI_BAR_COLOR = '#FEE077';

function MiniWaveform() {
  const animatedValues = useRef(
    Array(MINI_BAR_COUNT)
      .fill(0)
      .map(() => new Animated.Value(8))
  ).current;

  useEffect(() => {
    const animate = () => {
      const animations = animatedValues.map((anim, index) => {
        const toValue = 8 + Math.random() * 12;
        return Animated.timing(anim, {
          toValue,
          duration: 150 + index * 50,
          useNativeDriver: false,
        });
      });

      Animated.parallel(animations).start(() => {
        animate();
      });
    };

    animate();

    return () => {
      animatedValues.forEach((anim) => anim.stopAnimation());
    };
  }, [animatedValues]);

  return (
    <View style={styles.miniWaveform}>
      {animatedValues.map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.miniBar,
            {
              height: anim,
              backgroundColor: MINI_BAR_COLOR,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function FloatingVoiceButton({
  onPress,
  isMinimized = false,
  onEndConversation,
}: FloatingVoiceButtonProps) {
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

  const handlePress = () => {
    if (isMinimized && onEndConversation) {
      // Se minimizado, encerrar conversa
      onEndConversation();
    } else {
      // Caso normal, abrir overlay
      onPress();
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: theme.fabBackground,
          bottom: bottomPosition,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {isMinimized ? (
        <MiniWaveform />
      ) : (
        <VoiceCommandIcon size={24} color={theme.fabIcon} />
      )}
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
  miniWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  miniBar: {
    width: 4,
    borderRadius: 2,
  },
});
