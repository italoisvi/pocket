import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';
import type { PanResponderInstance } from 'react-native';
import { trackNewsReadComplete } from '@/lib/news-tracking';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Quanto do app fica visível quando o browser está collapsed
// Toolbar (~60) + preview do app (~180) = 240
const APP_VISIBLE_HEIGHT = 240;

// Quanto do app fica visível quando o browser está expanded (minimizado)
// Só toolbar (~60) + um pouquinho (~30) = 90
const APP_MINIMIZED_HEIGHT = 90;

interface BrowserContextValue {
  browserUrl: string | null;
  browserVisible: boolean;
  showToolbar: boolean;
  openBrowser: (url: string) => void;
  closeBrowser: () => void;
  appTranslateY: Animated.Value;
  browserTranslateY: Animated.Value;
  panResponder: PanResponderInstance;
  isExpanded: boolean;
  expandBrowser: () => void;
  collapseBrowser: () => void;
}

const BrowserContext = createContext<BrowserContextValue | null>(null);

export const BrowserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [browserVisible, setBrowserVisible] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Tracking de tempo de leitura
  const openTimeRef = useRef<number>(0);
  const currentUrlRef = useRef<string | null>(null);

  // App move para BAIXO (valor positivo = desce)
  const appTranslateY = useRef(new Animated.Value(0)).current;
  // Browser começa escondido abaixo da tela
  const browserTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // Track do valor atual
  const currentTranslateY = useRef(0);
  const isBrowserOpen = useRef(false);

  // Posições calculadas
  const collapsedPosition = SCREEN_HEIGHT - APP_VISIBLE_HEIGHT;
  const expandedPosition = SCREEN_HEIGHT - APP_MINIMIZED_HEIGHT;

  // Listener para trackear translateY
  React.useEffect(() => {
    const listener = appTranslateY.addListener(({ value }) => {
      currentTranslateY.current = value;
    });
    return () => appTranslateY.removeListener(listener);
  }, [appTranslateY]);

  const closeBrowser = useCallback(() => {
    isBrowserOpen.current = false;
    setShowToolbar(false);

    // Track reading time when closing browser
    if (currentUrlRef.current && openTimeRef.current > 0) {
      const timeSpentSeconds = Math.round(
        (Date.now() - openTimeRef.current) / 1000
      );
      // Only track if user spent more than 5 seconds (actually reading)
      if (timeSpentSeconds > 5) {
        trackNewsReadComplete(
          currentUrlRef.current,
          undefined, // title not available here
          undefined, // source not available here
          timeSpentSeconds,
          100 // Assume full scroll
        );
      }
      openTimeRef.current = 0;
      currentUrlRef.current = null;
    }

    Animated.parallel([
      Animated.spring(appTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 90,
      }),
      Animated.spring(browserTranslateY, {
        toValue: SCREEN_HEIGHT,
        useNativeDriver: true,
        damping: 20,
        stiffness: 90,
      }),
    ]).start(() => {
      setBrowserVisible(false);
      setBrowserUrl(null);
      setIsExpanded(false);
    });
  }, [appTranslateY, browserTranslateY]);

  const openBrowser = useCallback(
    (url: string) => {
      setBrowserUrl(url);
      setBrowserVisible(true);
      setShowToolbar(true);
      isBrowserOpen.current = true;
      setIsExpanded(false);

      // Track start time for reading duration
      openTimeRef.current = Date.now();
      currentUrlRef.current = url;

      Animated.parallel([
        Animated.spring(appTranslateY, {
          toValue: collapsedPosition,
          useNativeDriver: true,
          damping: 20,
          stiffness: 90,
        }),
        Animated.spring(browserTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 90,
        }),
      ]).start();
    },
    [appTranslateY, browserTranslateY, collapsedPosition]
  );

  const expandBrowser = useCallback(() => {
    if (!isBrowserOpen.current || isExpanded) return;

    setIsExpanded(true);
    Animated.spring(appTranslateY, {
      toValue: expandedPosition,
      useNativeDriver: true,
      damping: 20,
      stiffness: 90,
    }).start();
  }, [appTranslateY, expandedPosition, isExpanded]);

  const collapseBrowser = useCallback(() => {
    if (!isBrowserOpen.current || !isExpanded) return;

    setIsExpanded(false);
    Animated.spring(appTranslateY, {
      toValue: collapsedPosition,
      useNativeDriver: true,
      damping: 20,
      stiffness: 90,
    }).start();
  }, [appTranslateY, collapsedPosition, isExpanded]);

  // PanResponder para arrastar
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 5 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onPanResponderMove: (_, gestureState) => {
          if (!isBrowserOpen.current) return;

          const startPosition = isExpanded
            ? expandedPosition
            : collapsedPosition;
          const newPosition = startPosition + gestureState.dy;

          // Limita o movimento
          const clampedPosition = Math.max(
            collapsedPosition - 30, // permite puxar um pouco pra cima
            Math.min(expandedPosition + 80, newPosition) // permite puxar pra baixo pra fechar
          );

          appTranslateY.setValue(clampedPosition);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!isBrowserOpen.current) return;

          const velocity = gestureState.vy;
          const currentPos = currentTranslateY.current;

          // Se puxou muito pra baixo ou com velocidade, fecha
          if (currentPos > expandedPosition + 40 || velocity > 0.5) {
            closeBrowser();
            return;
          }

          // Decide entre collapsed e expanded
          const midPoint = (collapsedPosition + expandedPosition) / 2;

          if (currentPos < midPoint || velocity < -0.3) {
            // Snap para collapsed (mais app visível)
            setIsExpanded(false);
            Animated.spring(appTranslateY, {
              toValue: collapsedPosition,
              useNativeDriver: true,
              damping: 20,
              stiffness: 90,
            }).start();
          } else {
            // Snap para expanded (menos app visível)
            setIsExpanded(true);
            Animated.spring(appTranslateY, {
              toValue: expandedPosition,
              useNativeDriver: true,
              damping: 20,
              stiffness: 90,
            }).start();
          }
        },
      }),
    [
      appTranslateY,
      collapsedPosition,
      expandedPosition,
      isExpanded,
      closeBrowser,
    ]
  );

  return (
    <BrowserContext.Provider
      value={{
        browserUrl,
        browserVisible,
        showToolbar,
        openBrowser,
        closeBrowser,
        appTranslateY,
        browserTranslateY,
        panResponder,
        isExpanded,
        expandBrowser,
        collapseBrowser,
      }}
    >
      {children}
    </BrowserContext.Provider>
  );
};

export function useBrowser() {
  const ctx = useContext(BrowserContext);
  if (!ctx) {
    throw new Error('useBrowser must be used within a BrowserProvider');
  }
  return ctx;
}
