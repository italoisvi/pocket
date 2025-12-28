import { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Image, Dimensions, Animated } from 'react-native';

const { width, height } = Dimensions.get('window');

type AnimatedSplashScreenProps = {
  onComplete: () => void;
};

export function AnimatedSplashScreen({
  onComplete,
}: AnimatedSplashScreenProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for GIF to play (adjust timing based on GIF duration)
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 2500); // 2.5 seconds to show the GIF animation

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isReady) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        onComplete();
      });
    }
  }, [isReady, opacity, onComplete]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.imageContainer}>
        <Image
          source={require('@/assets/videos/Pocket.gif')}
          style={styles.gif}
          resizeMode="contain"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  imageContainer: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gif: {
    width: width * 0.8,
    height: height * 0.8,
  },
});
