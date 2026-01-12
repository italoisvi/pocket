import LottieView from 'lottie-react-native';
import { View, StyleSheet } from 'react-native';

type LoadingKangarooProps = {
  size?: number;
};

export function LoadingKangaroo({ size = 40 }: LoadingKangarooProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <LottieView
        source={require('@/assets/images/pocket.json')}
        autoPlay
        loop
        style={{ width: size, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
