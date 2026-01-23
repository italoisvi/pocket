import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View, StyleSheet, ActivityIndicator } from 'react-native';
import { syncItem, syncTransactions } from '@/lib/pluggy';
import { supabase } from '@/lib/supabase';
import * as Sentry from '@sentry/react-native';

export default function OAuthCallback() {
  const params = useLocalSearchParams();

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    try {
      console.log('[OAuth Callback] Params recebidos:', params);

      // 📊 Sentry: Deep link callback recebido
      Sentry.addBreadcrumb({
        category: 'open-finance',
        message: 'OAuth callback received',
        data: {
          itemId: params.itemId as string,
          success: params.success as string,
          error: params.error as string,
        },
        level: 'info',
      });

      // Pluggy redireciona com esses parâmetros após OAuth bem-sucedido
      const { itemId, success, error } = params;

      if (error) {
        // 📊 Sentry: Erro no OAuth
        Sentry.captureMessage(`OAuth error: ${error}`, 'error');

        Alert.alert('Erro na Autenticação', error as string);
        router.replace('/(tabs)/open-finance');
        return;
      }

      // Se tem itemId, considerar como sucesso (mesmo sem flag success)
      if (itemId) {
        // Item foi criado com sucesso via OAuth
        console.log('[OAuth Callback] Item criado via OAuth:', itemId);
        console.log('[OAuth Callback] Success flag:', success);

        // 📊 Sentry: OAuth bem-sucedido
        Sentry.addBreadcrumb({
          category: 'open-finance',
          message: 'OAuth completed successfully',
          data: {
            itemId: itemId as string,
          },
          level: 'info',
        });

        // ✅ NÃO chamar syncItem() aqui!
        // O webhook item/updated vai sincronizar automaticamente quando status = UPDATED
        console.log('[OAuth Callback] Autenticação OAuth concluída');
        console.log(
          '[OAuth Callback] Aguardando webhook sincronizar contas...'
        );

        // Salvar o item no banco e sincronizar transações automaticamente
        try {
          const syncResult = await syncItem(itemId as string);
          console.log('[OAuth Callback] Item salvo no banco');

          // 🔄 SINCRONIZAÇÃO AUTOMÁTICA DE TRANSAÇÕES
          let transactionsSaved = 0;
          if (syncResult.accountsCount > 0) {
            console.log(
              '[OAuth Callback] Iniciando sincronização automática de transações...'
            );

            try {
              const { data: accountsData } = await supabase
                .from('pluggy_accounts')
                .select('id, name')
                .eq('item_id', syncResult.item.databaseId);

              if (accountsData && accountsData.length > 0) {
                // Sincronizar apenas o mês corrente (do dia 1 até hoje)
                const now = new Date();
                const to = now.toISOString().split('T')[0];
                const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

                for (const account of accountsData) {
                  try {
                    console.log(
                      `[OAuth Callback] Syncing transactions for: ${account.name}`
                    );
                    const txResult = await syncTransactions(account.id, {
                      from,
                      to,
                    });
                    transactionsSaved += txResult.saved;
                    console.log(
                      `[OAuth Callback] ${account.name}: ${txResult.saved} transactions`
                    );
                  } catch (txError) {
                    console.error(
                      `[OAuth Callback] Error syncing transactions:`,
                      txError
                    );
                  }
                }
              }
            } catch (txSyncError) {
              console.error(
                '[OAuth Callback] Error in automatic transaction sync:',
                txSyncError
              );
            }
          }

          // Montar mensagem com resultado
          let message = '';
          if (syncResult.accountsCount > 0) {
            message = `Banco conectado! ${syncResult.accountsCount} conta(s) sincronizada(s).`;
            if (transactionsSaved > 0) {
              message += `\n\n${transactionsSaved} transação(ões) categorizada(s) automaticamente!`;
            }
          } else {
            message =
              'Banco conectado com sucesso! Suas contas estão sendo sincronizadas.';
          }

          // 🎯 Verificar se houve PARTIAL_SUCCESS
          if (syncResult.item.executionStatus === 'PARTIAL_SUCCESS') {
            console.log('[OAuth Callback] ⚠️ Sincronização parcial detectada');
            message +=
              '\n\nAlguns dados podem não ter sido sincronizados completamente. Puxe para atualizar a lista.';
            Alert.alert('Autenticação Concluída!', message, [
              {
                text: 'OK',
                onPress: () => router.replace('/(tabs)/open-finance'),
              },
            ]);
            return;
          }

          Alert.alert('Autenticação Concluída!', message, [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)/open-finance'),
            },
          ]);
          return;
        } catch (error) {
          console.error('[OAuth Callback] Erro ao salvar item:', error);
        }

        // Fallback se syncItem falhou
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
      <ActivityIndicator size="large" />
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
