import { useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import RevenueCatUI from 'react-native-purchases-ui';

export default function CustomerCenterScreen() {
  const { theme } = useTheme();

  useEffect(() => {
    presentCustomerCenter();
  }, []);

  const presentCustomerCenter = async () => {
    try {
      await RevenueCatUI.presentCustomerCenter();
      router.back();
    } catch (error) {
      console.error(
        '[CustomerCenter] Error presenting customer center:',
        error
      );
      Alert.alert(
        'Erro',
        'Não foi possível abrir o centro de atendimento ao cliente. Tente novamente.'
      );
      router.back();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
