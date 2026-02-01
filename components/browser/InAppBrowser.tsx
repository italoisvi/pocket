import React, { useRef, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useBrowser } from './BrowserContext';

export default function InAppBrowser() {
  const {
    browserUrl,
    browserVisible,
    browserTranslateY,
    expandBrowser,
    collapseBrowser,
  } = useBrowser();

  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const lastScrollY = useRef(0);

  // JavaScript para detectar scroll
  const scrollDetectionScript = useMemo(
    () => `
    (function() {
      let ticking = false;
      window.addEventListener('scroll', function() {
        if (!ticking) {
          window.requestAnimationFrame(function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'scroll',
              scrollY: window.scrollY
            }));
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    })();
    true;
  `,
    []
  );

  // Handler de scroll do WebView
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'scroll') {
          const currentY = data.scrollY;
          const deltaY = currentY - lastScrollY.current;

          if (Math.abs(deltaY) > 25) {
            if (deltaY > 0) {
              // Scrollando pra baixo = expande (menos app)
              expandBrowser();
            } else if (deltaY < 0) {
              // Scrollando pra cima = colapsa (mais app)
              collapseBrowser();
            }
            lastScrollY.current = currentY;
          }
        }
      } catch {
        // Ignora
      }
    },
    [expandBrowser, collapseBrowser]
  );

  // Reset scroll quando URL muda
  useMemo(() => {
    lastScrollY.current = 0;
  }, [browserUrl]);

  if (!browserVisible || !browserUrl) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: browserTranslateY }] },
      ]}
    >
      <WebView
        ref={webViewRef}
        source={{ uri: browserUrl }}
        style={styles.webView}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onMessage={handleMessage}
        injectedJavaScript={scrollDetectionScript}
        allowsBackForwardNavigationGestures
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        showsVerticalScrollIndicator
        decelerationRate="normal"
        contentMode="mobile"
      />

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f7c359" />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1, // ATRÁS do app
    backgroundColor: '#fff',
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
