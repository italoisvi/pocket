import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { syncItem } from '@/lib/pluggy';

export default function OAuthCallback() {
  const params = useLocalSearchParams();

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    try {
      console.log('[OAuth Callback] Params recebidos:', params);

      // Pluggy redireciona com esses parâmetros após OAuth bem-sucedido
      const { itemId, success, error } = params;

      if (error) {
        Alert.alert('Erro na Autenticação', error as string);
        router.replace('/(tabs)/open-finance');
        return;
      }

      if (success && itemId) {
        // Item foi criado com sucesso via OAuth
        console.log('[OAuth Callback] Item criado via OAuth:', itemId);

        // Sincronizar item para buscar dados
        console.log('[OAuth Callback] Sincronizando item...');
        const syncResponse = await syncItem(itemId as string);

        console.log('[OAuth Callback] Sync response:', syncResponse);

        if (syncResponse.accountsCount > 0) {
          Alert.alert(
            'Conexão Concluída!',
            `Banco conectado com sucesso! ${syncResponse.accountsCount} conta(s) sincronizada(s).`,
            [
              {
                text: 'OK',
                onPress: () => router.replace('/(tabs)/open-finance'),
              },
            ]
          );
        } else if (syncResponse.item.status === 'UPDATING') {
          Alert.alert(
            'Aguarde',
            'Banco conectado! Suas contas estão sendo sincronizadas. Isso pode levar alguns minutos.',
            [
              {
                text: 'OK',
                onPress: () => router.replace('/(tabs)/open-finance'),
              },
            ]
          );
        } else {
          // Voltar para tela de Open Finance
          router.replace('/(tabs)/open-finance');
        }
      } else {
        // Sem itemId ou success
        console.error('[OAuth Callback] Missing itemId or success flag');
        Alert.alert(
          'Erro',
          'Não foi possível completar a conexão. Por favor, tente novamente.'
        );
        router.replace('/(tabs)/open-finance');
      }
    } catch (error) {
      console.error('[OAuth Callback] Erro:', error);
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Ocorreu um erro ao processar a autenticação.'
      );
      router.replace('/(tabs)/open-finance');
    }
  };

  // Tela de loading durante processamento
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4ade80" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
