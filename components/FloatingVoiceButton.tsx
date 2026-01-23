import { useEffect, useRef, useState } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Platform,
  View,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { usePathname, useSegments } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { WaltsIcon } from './WaltsIcon';

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

// Button size
const BUTTON_SIZE = 56;
const WALTS_ICON_COLOR = '#FEE077';

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
  const { theme, isDark } = useTheme();

  // Get screen dimensions
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Determine if tab bar is visible
  const isInTabsGroup = segments[0] === '(tabs)';
  const currentTabScreen = segments[1];
  const hasTabBar =
    isInTabsGroup && ROUTES_WITH_TAB_BAR.includes(currentTabScreen ?? '');

  // Calculate safe boundaries
  const topBoundary = Platform.OS === 'ios' ? 100 : 80;
  const bottomBoundary = hasTabBar
    ? Platform.OS === 'ios'
      ? 180
      : 160
    : Platform.OS === 'ios'
      ? 100
      : 80;
  const sidePadding = 16;

  // Initial position (bottom right)
  const initialX = screenWidth - BUTTON_SIZE - sidePadding;
  const initialY = screenHeight - bottomBoundary;

  // Animated position values
  const posX = useRef(new Animated.Value(initialX)).current;
  const posY = useRef(new Animated.Value(initialY)).current;

  // Current position tracking
  const currentPos = useRef({ x: initialX, y: initialY });

  // Track if we're dragging
  const isDragging = useRef(false);
  const lastTap = useRef<number>(0);

  // Update position when tab bar visibility changes
  useEffect(() => {
    const maxY = screenHeight - bottomBoundary;
    if (currentPos.current.y > maxY) {
      currentPos.current.y = maxY;
      posY.setValue(maxY);
    }
  }, [hasTabBar, bottomBoundary, screenHeight, posY]);

  // PanResponder for drag handling
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
      },
      onPanResponderGrant: () => {
        isDragging.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3) {
          isDragging.current = true;
        }

        // Calculate new position directly from gesture
        const newX = Math.min(
          Math.max(currentPos.current.x + gestureState.dx, sidePadding),
          screenWidth - BUTTON_SIZE - sidePadding
        );
        const newY = Math.min(
          Math.max(currentPos.current.y + gestureState.dy, topBoundary),
          screenHeight - bottomBoundary
        );

        posX.setValue(newX);
        posY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isDragging.current) {
          // Calculate final position
          const newX = Math.min(
            Math.max(currentPos.current.x + gestureState.dx, sidePadding),
            screenWidth - BUTTON_SIZE - sidePadding
          );
          const newY = Math.min(
            Math.max(currentPos.current.y + gestureState.dy, topBoundary),
            screenHeight - bottomBoundary
          );

          // Snap to nearest horizontal edge
          const snapToLeft = newX < screenWidth / 2;
          const snapX = snapToLeft
            ? sidePadding
            : screenWidth - BUTTON_SIZE - sidePadding;

          // Animate to snapped position
          Animated.spring(posX, {
            toValue: snapX,
            useNativeDriver: false,
            friction: 7,
            tension: 40,
          }).start();

          // Update current position
          currentPos.current = { x: snapX, y: newY };
        }

        isDragging.current = false;
      },
    })
  ).current;

  const shouldHide = HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  if (shouldHide) {
    return null;
  }

  const handlePress = () => {
    // Prevent press during drag
    if (isDragging.current) return;

    const now = Date.now();
    // Debounce rapid taps
    if (now - lastTap.current < 300) return;
    lastTap.current = now;

    if (isMinimized && onEndConversation) {
      onEndConversation();
    } else {
      onPress();
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          left: posX,
          top: posY,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: theme.fabBackground,
            shadowColor: isDark ? '#fff' : '#000',
            shadowOpacity: isDark ? 0.3 : 0.25,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        {isMinimized ? (
          <MiniWaveform />
        ) : (
          <WaltsIcon size={24} color={WALTS_ICON_COLOR} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 100,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
