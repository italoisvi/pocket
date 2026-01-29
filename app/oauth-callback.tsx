import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncItem, syncTransactions } from '@/lib/pluggy';
import { supabase } from '@/lib/supabase';
import { syncEvents } from '@/lib/syncEvents';
import * as Sentry from '@sentry/react-native';

// Chave para ler o destino do redirect salvo pelo credentials.tsx
const OAUTH_REDIRECT_KEY = '@pocket/oauth_redirect_to';

export default function OAuthCallback() {
  const params = useLocalSearchParams();
  const [statusText, setStatusText] = useState('Processando...');

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
        // Voltar para a tela anterior (pode ser /cartoes ou /(tabs)/open-finance)
        router.back();
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

        console.log('[OAuth Callback] Autenticação OAuth concluída');
        console.log('[OAuth Callback] Aguardando Pluggy processar...');
        setStatusText('Conectando com o banco...');

        // Ler destino do redirect salvo pelo credentials.tsx
        let redirectTo = '/(tabs)/open-finance'; // default
        try {
          const savedRedirect = await AsyncStorage.getItem(OAUTH_REDIRECT_KEY);
          if (savedRedirect) {
            redirectTo = savedRedirect;
            // Limpar após usar
            await AsyncStorage.removeItem(OAUTH_REDIRECT_KEY);
          }
          console.log('[OAuth Callback] Destino do redirect:', redirectTo);
        } catch (storageError) {
          console.error('[OAuth Callback] Erro ao ler redirect do storage:', storageError);
        }

        // 🔄 POLLING: Aguardar até que o item esteja UPDATED e tenha contas
        // A Pluggy demora alguns segundos após o OAuth para sincronizar as contas
        const maxAttempts = 30; // 30 tentativas x 2 segundos = 60 segundos máximo
        let syncResult = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          console.log(`[OAuth Callback] Polling tentativa ${attempt}/${maxAttempts}...`);
          setStatusText(`Sincronizando dados... (${attempt}/${maxAttempts})`);

          try {
            syncResult = await syncItem(itemId as string);
            console.log(`[OAuth Callback] Status: ${syncResult.item.status}`);
            console.log(`[OAuth Callback] Contas encontradas: ${syncResult.accountsCount}`);

            // Se já tem contas e status é UPDATED, podemos prosseguir
            if (syncResult.accountsCount > 0 && syncResult.item.status === 'UPDATED') {
              console.log('[OAuth Callback] ✅ Contas sincronizadas!');
              setStatusText('Contas sincronizadas!');
              break;
            }

            // Se houve erro de login, parar imediatamente
            if (syncResult.item.status === 'LOGIN_ERROR') {
              console.error('[OAuth Callback] ❌ Erro de login');
              break;
            }

            // Se já está UPDATED mas sem contas, pode ser um problema
            if (syncResult.item.status === 'UPDATED' && syncResult.accountsCount === 0) {
              console.warn('[OAuth Callback] ⚠️ UPDATED mas sem contas, aguardando...');
            }
          } catch (pollError) {
            console.error(`[OAuth Callback] Erro no polling:`, pollError);
          }

          // Aguardar antes da próxima tentativa
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        // Salvar o item no banco e sincronizar transações automaticamente
        try {
          // Se polling não conseguiu resultado, tentar uma última vez
          if (!syncResult) {
            syncResult = await syncItem(itemId as string);
          }
          console.log('[OAuth Callback] Item salvo no banco');

          // 🔄 SINCRONIZAÇÃO AUTOMÁTICA DE TRANSAÇÕES
          let transactionsSaved = 0;

          if (syncResult.accountsCount > 0) {
            console.log(
              '[OAuth Callback] Iniciando sincronização automática de transações...'
            );
            setStatusText('Buscando transações...');

            try {
              const { data: accountsData } = await supabase
                .from('pluggy_accounts')
                .select('id, name, type')
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

          const isCreditCard = redirectTo === '/cartoes';
          console.log('[OAuth Callback] Redirecionando para:', redirectTo);

          // Emitir evento de sincronização para atualizar outras telas
          syncEvents.emit();

          // Montar mensagem com resultado
          let message = '';
          if (syncResult.accountsCount > 0) {
            message = isCreditCard
              ? `Cartão conectado! ${syncResult.accountsCount} cartão(ões) sincronizado(s).`
              : `Banco conectado! ${syncResult.accountsCount} conta(s) sincronizada(s).`;
            if (transactionsSaved > 0) {
              message += `\n\n${transactionsSaved} transação(ões) categorizada(s) automaticamente!`;
            }
          } else {
            message = isCreditCard
              ? 'Cartão conectado com sucesso! Seus dados estão sendo sincronizados.'
              : 'Banco conectado com sucesso! Suas contas estão sendo sincronizadas.';
          }

          // 🎯 Verificar se houve PARTIAL_SUCCESS
          if (syncResult.item.executionStatus === 'PARTIAL_SUCCESS') {
            console.log('[OAuth Callback] ⚠️ Sincronização parcial detectada');
            message +=
              '\n\nAlguns dados podem não ter sido sincronizados completamente. Puxe para atualizar a lista.';
            Alert.alert('Autenticação Concluída!', message, [
              {
                text: 'OK',
                onPress: () => router.dismissTo(redirectTo),
              },
            ]);
            return;
          }

          Alert.alert('Autenticação Concluída!', message, [
            {
              text: 'OK',
              onPress: () => router.dismissTo(redirectTo),
            },
          ]);
          return;
        } catch (error) {
          console.error('[OAuth Callback] Erro ao salvar item:', error);
        }

        // Fallback se syncItem falhou - usar o redirectTo salvo
        const isCreditCard = redirectTo === '/cartoes';
        Alert.alert(
          'Autenticação Concluída!',
          isCreditCard
            ? 'Cartão conectado! Seus dados estão sendo sincronizados.'
            : 'Banco conectado! Suas contas estão sendo sincronizadas.',
          [
            {
              text: 'OK',
              onPress: () => router.dismissTo(redirectTo),
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
        router.back();
      }
    } catch (error) {
      console.error('[OAuth Callback] Erro:', error);
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Ocorreu um erro ao processar a autenticação.'
      );
      router.back();
    }
  };

  // Tela de loading durante processamento
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#fff" />
      <Text style={styles.statusText}>{statusText}</Text>
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
  statusText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontFamily: 'DMSans-Regular',
  },
});
