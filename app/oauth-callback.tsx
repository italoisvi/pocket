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

      // Se tem itemId, considerar como sucesso (mesmo sem flag success)
      if (itemId) {
        // Item foi criado com sucesso via OAuth
        console.log('[OAuth Callback] Item criado via OAuth:', itemId);
        console.log('[OAuth Callback] Success flag:', success);

        // ✅ NÃO chamar syncItem() aqui!
        // O webhook item/updated vai sincronizar automaticamente quando status = UPDATED
        console.log('[OAuth Callback] Autenticação OAuth concluída');
        console.log(
          '[OAuth Callback] Aguardando webhook sincronizar contas...'
        );

        // Salvar o item no banco para garantir que existe
        // (caso o webhook item/created ainda não tenha sido processado)
        try {
          await syncItem(itemId as string);
          console.log('[OAuth Callback] Item salvo no banco');
        } catch (error) {
          console.error('[OAuth Callback] Erro ao salvar item:', error);
        }

        // Mostrar mensagem e voltar para Open Finance
        Alert.alert(
          'Autenticação Concluída!',
          'Banco conectado com sucesso! Suas contas estão sendo sincronizadas. Isso pode levar alguns minutos. Puxe para atualizar a lista.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)/open-finance'),
            },
          ]
        );
      } else {
        // Sem itemId
        console.error('[OAuth Callback] Missing itemId');
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
