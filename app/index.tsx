import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // Aguardar o router estar pronto antes de navegar
    const timer = setTimeout(() => {
      router.replace('/(auth)/login');
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}
