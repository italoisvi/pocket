import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { syncItem, syncTransactions } from '@/lib/pluggy';
import { supabase } from '@/lib/supabase';
import { syncEvents } from '@/lib/syncEvents';
import { MFAModal } from '@/components/MFAModal';
import { OAuthModal } from '@/components/OAuthModal';
import * as Sentry from '@sentry/react-native';

// Chave para armazenar o destino do redirect após OAuth
const OAUTH_REDIRECT_KEY = '@pocket/oauth_redirect_to';

type CredentialField = {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  validation?: string;
  validationMessage?: string;
  optional?: boolean;
};

export default function CredentialsScreen() {
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams();

  const connectorId = params.connectorId as string;
  const connectorName = params.connectorName as string;
  const imageUrl = params.imageUrl as string;
  // 🔑 IMPORTANTE: Este é um Connect Token (não API Key)
  // Connect Tokens têm oauthRedirectUrl configurado, necessário para OAuth funcionar
  const connectToken = params.apiKey as string;
  const credentialsJson = params.credentials as string;
  // Produtos a sincronizar (ACCOUNTS, CREDIT_CARDS, TRANSACTIONS, etc.)
  const productsJson = params.products as string | undefined;

  const credentials: CredentialField[] = credentialsJson
    ? JSON.parse(credentialsJson)
    : [];
  const products: string[] | undefined = productsJson
    ? JSON.parse(productsJson)
    : undefined;

  // Determinar destino do redirect baseado no tipo de produto
  const isCreditCard = products?.includes('CREDIT_CARDS') ?? false;
  const redirectTo = isCreditCard ? '/cartoes' : '/(tabs)/open-finance';

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [mfaVisible, setMfaVisible] = useState(false);
  const [mfaItemId, setMfaItemId] = useState<string | null>(null);
  const [mfaParameter, setMfaParameter] = useState<any>(null);
  const [oauthVisible, setOauthVisible] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string>('');

  const formatCPF = (value: string): string => {
    // Remove tudo que não é dígito
    const numbers = value.replace(/\D/g, '');

    // Limita a 11 dígitos
    const limited = numbers.slice(0, 11);

    // Aplica a máscara: 000.000.000-00
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `${limited.slice(0, 3)}.${limited.slice(3)}`;
    } else if (limited.length <= 9) {
      return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6)}`;
    } else {
      return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6, 9)}-${limited.slice(9)}`;
    }
  };

  const formatCNPJ = (value: string): string => {
    // Remove tudo que não é dígito
    const numbers = value.replace(/\D/g, '');

    // Limita a 14 dígitos
    const limited = numbers.slice(0, 14);

    // Aplica a máscara: 00.000.000/0000-00
    if (limited.length <= 2) {
      return limited;
    } else if (limited.length <= 5) {
      return `${limited.slice(0, 2)}.${limited.slice(2)}`;
    } else if (limited.length <= 8) {
      return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5)}`;
    } else if (limited.length <= 12) {
      return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5, 8)}/${limited.slice(8)}`;
    } else {
      return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5, 8)}/${limited.slice(8, 12)}-${limited.slice(12)}`;
    }
  };

  const handleInputChange = (fieldName: string, value: string) => {
    // Se o campo for CPF ou CNPJ, aplicar formatação
    const field = credentials.find((f) => f.name === fieldName);
    const fieldLower = (
      field?.label +
      ' ' +
      field?.name +
      ' ' +
      (field?.placeholder || '')
    ).toLowerCase();

    const isCNPJField = fieldLower.includes('cnpj');
    const isCPFField =
      !isCNPJField &&
      (fieldLower.includes('cpf') ||
        field?.name.toLowerCase().includes('document'));

    let formattedValue = value;
    if (isCNPJField) {
      formattedValue = formatCNPJ(value);
    } else if (isCPFField) {
      formattedValue = formatCPF(value);
    }

    setFormData((prev) => ({ ...prev, [fieldName]: formattedValue }));
  };

  const validateForm = (): boolean => {
    for (const field of credentials) {
      if (!field.optional && !formData[field.name]) {
        Alert.alert('Erro', `O campo ${field.label} é obrigatório`);
        return false;
      }

      if (field.validation && formData[field.name]) {
        const regex = new RegExp(field.validation);
        if (!regex.test(formData[field.name])) {
          Alert.alert(
            'Erro',
            field.validationMessage || `O campo ${field.label} está inválido`
          );
          return false;
        }
      }
    }
    return true;
  };

  const handleConnect = async () => {
    if (!validateForm()) return;

    setLoading(true);

    // 📊 Sentry: Iniciar rastreamento do fluxo Open Finance
    Sentry.addBreadcrumb({
      category: 'open-finance',
      message: 'Starting connection flow',
      data: {
        connectorId,
        connectorName,
      },
      level: 'info',
    });

    try {
      // 1. Remover formatação do CPF antes de enviar
      const cleanedFormData: Record<string, string> = {};
      for (const [key, value] of Object.entries(formData)) {
        const field = credentials.find((f) => f.name === key);
        const isCPFField =
          field?.label.toLowerCase().includes('cpf') ||
          field?.name.toLowerCase().includes('cpf') ||
          field?.name.toLowerCase().includes('document');

        // Se for CPF, remover formatação (deixar só números)
        cleanedFormData[key] = isCPFField ? value.replace(/\D/g, '') : value;
      }

      console.log('[credentials] Sending credentials to Pluggy API...');
      console.log('[credentials] Connector ID:', connectorId);
      console.log('[credentials] Parameters:', cleanedFormData);

      const requestBody: Record<string, unknown> = {
        connectorId: parseInt(connectorId),
        parameters: cleanedFormData,
        // Testando AMBOS! Documentação é inconsistente sobre qual usar
        oauthRedirectUri: 'pocket://oauth-callback', // OAuth Support Guide
        oauthRedirectUrl: 'pocket://oauth-callback', // Authentication Guide
      };

      // Adicionar filtro de produtos se especificado
      // ACCOUNTS + TRANSACTIONS = Conta Corrente
      // CREDIT_CARDS = Cartões de Crédito
      if (products && products.length > 0) {
        requestBody.products = products;
      }

      console.log(
        '[credentials] Request body:',
        JSON.stringify(requestBody, null, 2)
      );

      // 2. Criar o Item via Pluggy API usando Connect Token
      // IMPORTANTE: Mesmo usando Connect Token, precisamos passar oauthRedirectUri/Url no body!
      const createItemResponse = await fetch('https://api.pluggy.ai/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': connectToken,
        },
        body: JSON.stringify(requestBody),
      });

      if (!createItemResponse.ok) {
        const errorData = await createItemResponse.json();
        console.error('[credentials] Failed to create item:', errorData);
        throw new Error(errorData.message || 'Falha ao conectar banco');
      }

      const itemData = await createItemResponse.json();
      console.log('[credentials] ✅ Item created successfully!');
      console.log('[credentials] Item ID:', itemData.id);
      console.log('[credentials] Item status:', itemData.status);
      console.log(
        '[credentials] Item executionStatus:',
        itemData.executionStatus
      );

      // 📊 Sentry: Item criado com sucesso
      Sentry.addBreadcrumb({
        category: 'open-finance',
        message: 'Item created successfully',
        data: {
          itemId: itemData.id,
          status: itemData.status,
          executionStatus: itemData.executionStatus,
        },
        level: 'info',
      });

      // 🔍 LOG CRÍTICO: Verificar se já vem com parameter
      if (itemData.parameter) {
        console.log('[credentials] ⚠️ Item JÁ RETORNOU com parameter!');
        console.log('[credentials] Parameter name:', itemData.parameter.name);
        console.log('[credentials] Parameter data:', itemData.parameter.data);
      } else {
        console.log('[credentials] Item não retornou parameter ainda');
      }

      // 3. 🚨 NOVA LÓGICA: Verificar OAuth ANTES de sincronizar
      // Conectores Open Finance OAuth retornam imediatamente com parameter
      let shouldCheckForOAuth = false;
      let fullItem = itemData;

      // Se status é UPDATING ou WAITING_USER_INPUT, buscar item completo
      if (
        itemData.status === 'UPDATING' ||
        itemData.status === 'WAITING_USER_INPUT'
      ) {
        console.log(
          '[credentials] Status requer verificação de OAuth/MFA, buscando item completo...'
        );
        shouldCheckForOAuth = true;

        // 🔄 POLLING: Aguardar até parameter aparecer (máximo 60 segundos)
        const maxAttempts = 30; // 30 tentativas x 2 segundos = 60 segundos
        let attempts = 0;

        while (attempts < maxAttempts) {
          console.log(
            `[credentials] Polling tentativa ${attempts + 1}/${maxAttempts}...`
          );

          const itemResponse = await fetch(
            `https://api.pluggy.ai/items/${itemData.id}`,
            {
              headers: { 'X-API-KEY': connectToken },
            }
          );

          if (itemResponse.ok) {
            fullItem = await itemResponse.json();
            console.log('[credentials] Item status:', fullItem.status);
            console.log(
              '[credentials] Item executionStatus:',
              fullItem.executionStatus
            );
            console.log('[credentials] Item parameter:', fullItem.parameter);

            // Se encontrou parameter OU status mudou para algo definitivo, parar polling
            if (
              fullItem.parameter ||
              fullItem.status === 'UPDATED' ||
              fullItem.status === 'LOGIN_ERROR' ||
              fullItem.status === 'OUTDATED'
            ) {
              console.log(
                '[credentials] ✅ Parameter encontrado ou status definitivo!'
              );
              break;
            }
          }

          // Aguardar 2 segundos antes da próxima tentativa
          attempts++;
          if (attempts < maxAttempts) {
            console.log('[credentials] Aguardando 2 segundos...');
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        if (attempts >= maxAttempts && !fullItem.parameter) {
          console.warn(
            '[credentials] ⚠️ Timeout: Parameter não apareceu após 60 segundos'
          );

          // Se ainda está UPDATING sem parameter, pode ser um problema com OAuth
          if (fullItem.status === 'UPDATING') {
            console.warn(
              '[credentials] ⚠️ Status ainda UPDATING sem parameter - possível problema com OAuth'
            );

            // Sincronizar para salvar no banco
            await syncItem(itemData.id);

            Alert.alert(
              'Processando...',
              'O banco está processando sua conexão. Isso pode levar alguns minutos.\n\nSe o banco solicitar autenticação adicional (como abrir o app do banco), aguarde a notificação ou tente sincronizar novamente mais tarde.',
              [
                {
                  text: 'OK',
                  onPress: () => router.dismissTo(redirectTo),
                },
              ]
            );
            setLoading(false);
            return;
          }
        }
      }

      // 4. 🔍 VERIFICAR SE É OAUTH (independente do status!)
      if (shouldCheckForOAuth && fullItem.parameter) {
        // ✅ Verificar TANTO o name quanto o type
        // Nubank usa: name: "oauthCode", type: "oauth"
        // Outros bancos podem usar: name: "oauth_code"
        const isOAuth =
          fullItem.parameter.type === 'oauth' ||
          fullItem.parameter.name === 'oauth_code' ||
          fullItem.parameter.name === 'oauthCode';

        console.log('[credentials] 🔍 Parameter detectado!');
        console.log('[credentials] Parameter name:', fullItem.parameter.name);
        console.log('[credentials] Parameter type:', fullItem.parameter.type);
        console.log('[credentials] É OAuth?', isOAuth);

        if (isOAuth) {
          // 🚀 OAUTH FLOW
          console.log('[credentials] 🚀 Iniciando fluxo OAuth...');

          // 📊 Sentry: OAuth detectado
          Sentry.addBreadcrumb({
            category: 'open-finance',
            message: 'OAuth flow detected',
            data: {
              itemId: itemData.id,
              parameterName: fullItem.parameter.name,
              parameterType: fullItem.parameter.type,
            },
            level: 'info',
          });

          // Extrair URL do OAuth
          const authUrl =
            fullItem.parameter.data?.url || fullItem.parameter.data;

          if (authUrl && typeof authUrl === 'string') {
            console.log('[credentials] ✅ OAuth URL encontrada:', authUrl);

            // 🌐 ABRIR NAVEGADOR IMEDIATAMENTE
            console.log(
              '[credentials] 🌐 Abrindo navegador para autenticação OAuth...'
            );

            // Salvar destino do redirect para o oauth-callback usar
            await AsyncStorage.setItem(OAUTH_REDIRECT_KEY, redirectTo);
            console.log('[credentials] Destino do redirect salvo:', redirectTo);

            // Verificar se pode abrir a URL
            const canOpen = await Linking.canOpenURL(authUrl);

            if (!canOpen) {
              console.error(
                '[credentials] ❌ Não é possível abrir a URL:',
                authUrl
              );
              Alert.alert(
                'Erro',
                'Não foi possível abrir o link de autenticação. Por favor, tente novamente.'
              );
              setLoading(false);
              return;
            }

            // Abrir navegador/app do banco
            console.log('[credentials] Abrindo URL:', authUrl);
            await Linking.openURL(authUrl);

            // 📊 Sentry: Navegador OAuth aberto
            Sentry.addBreadcrumb({
              category: 'open-finance',
              message: 'OAuth browser opened',
              data: {
                itemId: itemData.id,
                connectorName,
              },
              level: 'info',
            });

            // ✅ NÃO SINCRONIZA AGORA! A sincronização acontece automaticamente
            // quando o usuário volta do OAuth via deep link (oauth-callback.tsx)

            console.log('[credentials] ✅ Navegador aberto com sucesso!');
            console.log('[credentials] Aguardando callback do OAuth...');

            setLoading(false);

            // Volta para a lista (cartões ou bancos, dependendo do produto)
            router.dismissTo(redirectTo);
            return; // ← IMPORTANTE: Não continuar o fluxo normal
          } else {
            console.error(
              '[credentials] ❌ OAuth URL não encontrada em parameter.data'
            );
            console.error(
              '[credentials] Parameter completo:',
              JSON.stringify(fullItem.parameter)
            );
            Alert.alert(
              'Erro',
              'Não foi possível obter o link de autenticação OAuth. Por favor, tente novamente.'
            );
            setLoading(false);
            return;
          }
        } else {
          // 🔐 MFA TRADICIONAL
          console.log('[credentials] 🔐 Fluxo MFA tradicional detectado');

          // Sincronizar item no banco
          const syncResult = await syncItem(itemData.id);

          // Abrir modal MFA
          setMfaItemId(syncResult.item.databaseId);
          setMfaParameter(fullItem.parameter);
          setMfaVisible(true);
          setLoading(false);
          return; // ← IMPORTANTE: Não continuar o fluxo normal
        }
      }

      // 5. ✅ FLUXO NORMAL (sem OAuth/MFA ou já finalizado)
      console.log('[credentials] Fluxo normal, sincronizando item...');
      const syncResult = await syncItem(itemData.id);
      console.log('[credentials] Sync result:', syncResult);

      // Verificar resultado da sincronização
      if (syncResult.item.status === 'UPDATING') {
        console.log('[credentials] Item em sincronização, aguardando...');
        Alert.alert(
          'Aguarde!',
          'Banco conectado com sucesso! Suas contas estão sendo sincronizadas. Isso pode levar alguns minutos. Volte e puxe para atualizar a lista.',
          [
            {
              text: 'OK',
              onPress: () => router.dismissTo(redirectTo),
            },
          ]
        );
      } else if (syncResult.item.status === 'UPDATED') {
        // 🎯 Verificar executionStatus para PARTIAL_SUCCESS
        if (syncResult.item.executionStatus === 'PARTIAL_SUCCESS') {
          console.log(
            '[credentials] ⚠️ Sincronização parcial (alguns produtos falharam)'
          );

          // 🔄 SINCRONIZAÇÃO AUTOMÁTICA DE TRANSAÇÕES (mesmo em partial)
          let transactionsSaved = 0;
          if (syncResult.accountsCount > 0) {
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
                    const txResult = await syncTransactions(account.id, {
                      from,
                      to,
                    });
                    transactionsSaved += txResult.saved;
                  } catch (txError) {
                    console.error(
                      `[credentials] Error syncing transactions:`,
                      txError
                    );
                  }
                }
              }
            } catch (txSyncError) {
              console.error(
                '[credentials] Error in automatic transaction sync:',
                txSyncError
              );
            }
          }

          let message = `Banco conectado! ${syncResult.accountsCount} conta(s) sincronizada(s).`;
          if (transactionsSaved > 0) {
            message += `\n\n${transactionsSaved} transação(ões) categorizada(s) automaticamente!`;
          }
          message +=
            '\n\nAlguns dados podem não ter sido sincronizados completamente. Você pode tentar sincronizar novamente mais tarde.';

          Alert.alert('Parcialmente Sincronizado', message, [
            {
              text: 'OK',
              onPress: () => router.dismissTo(redirectTo),
            },
          ]);
        } else if (syncResult.accountsCount > 0) {
          console.log('[credentials] ✅ Sincronização concluída com sucesso!');
          console.log(
            '[credentials] Iniciando sincronização automática de transações...'
          );

          // 🔄 SINCRONIZAÇÃO AUTOMÁTICA DE TRANSAÇÕES
          // Buscar contas e sincronizar transações do mês atual
          let transactionsSaved = 0;
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
                    `[credentials] Syncing transactions for account: ${account.name}`
                  );
                  const txResult = await syncTransactions(account.id, {
                    from,
                    to,
                  });
                  transactionsSaved += txResult.saved;
                  console.log(
                    `[credentials] Account ${account.name}: ${txResult.saved} transactions saved, ${txResult.skipped} skipped`
                  );
                } catch (txError) {
                  console.error(
                    `[credentials] Error syncing transactions for ${account.name}:`,
                    txError
                  );
                }
              }
            }
          } catch (txSyncError) {
            console.error(
              '[credentials] Error in automatic transaction sync:',
              txSyncError
            );
          }

          // Emitir evento de sincronização para atualizar outras telas
          syncEvents.emit();

          // Mostrar resultado com info de transações
          let message = `Banco conectado! ${syncResult.accountsCount} conta(s) sincronizada(s).`;
          if (transactionsSaved > 0) {
            message += `\n\n${transactionsSaved} transação(ões) categorizada(s) automaticamente!`;
          }

          Alert.alert('Sucesso', message, [
            {
              text: 'OK',
              onPress: () => router.dismissTo(redirectTo),
            },
          ]);
        } else {
          // UPDATED mas sem contas
          console.log('[credentials] ⚠️ UPDATED mas sem contas');
          Alert.alert(
            'Atenção',
            'Banco conectado, mas nenhuma conta foi encontrada ainda. Aguarde alguns instantes e atualize a lista.',
            [
              {
                text: 'OK',
                onPress: () => router.dismissTo(redirectTo),
              },
            ]
          );
        }
      } else if (
        syncResult.item.status === 'LOGIN_ERROR' ||
        syncResult.item.status === 'OUTDATED'
      ) {
        console.error('[credentials] ❌ Erro de login/credenciais');
        Alert.alert(
          'Erro',
          syncResult.item.error?.message ||
            'Credenciais inválidas. Verifique e tente novamente.'
        );
      } else {
        console.log(
          '[credentials] ⚠️ Status não esperado:',
          syncResult.item.status
        );
        Alert.alert(
          'Atenção',
          'Banco conectado, mas nenhuma conta foi encontrada ainda. Aguarde alguns instantes e atualize a lista.',
          [
            {
              text: 'OK',
              onPress: () => router.dismissTo(redirectTo),
            },
          ]
        );
      }
    } catch (error) {
      console.error('[credentials] ❌ Error connecting bank:', error);
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Não foi possível conectar o banco'
      );
    } finally {
      setLoading(false);
    }
  };

  const getInputType = (fieldType: string) => {
    switch (fieldType) {
      case 'password':
      case 'text':
        return 'default';
      case 'number':
        return 'numeric';
      default:
        return 'default';
    }
  };

  const handleMFASuccess = async () => {
    // Após enviar o MFA, aguardar um pouco e redirecionar
    // O usuário poderá sincronizar novamente para verificar o status
    setTimeout(() => {
      router.dismissTo(redirectTo);
    }, 1000);
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          {connectorName}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {isCreditCard
            ? 'Digite suas credenciais para conectar seu cartão de crédito'
            : 'Digite suas credenciais para conectar sua conta bancária'}
        </Text>

        {credentials.map((field) => (
          <View key={field.name} style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.text }]}>
              {field.label}
              {!field.optional && <Text style={{ color: '#f87171' }}> *</Text>}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                  color: theme.text,
                },
              ]}
              placeholder={field.placeholder || field.label}
              placeholderTextColor={theme.textSecondary}
              value={formData[field.name] || ''}
              onChangeText={(value) => handleInputChange(field.name, value)}
              secureTextEntry={field.type === 'password'}
              keyboardType={getInputType(field.type)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ))}

        <TouchableOpacity
          style={[
            styles.connectButton,
            {
              backgroundColor: isDark ? '#000' : theme.primary,
              borderWidth: 2,
              borderColor: isDark ? '#2c2c2e' : theme.primary,
            },
            loading && styles.connectButtonDisabled,
          ]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color={isDark ? theme.text : '#fff'}
            />
          ) : (
            <Text
              style={[
                styles.connectButtonText,
                {
                  color: isDark ? theme.text : '#fff',
                },
              ]}
            >
              Conectar
            </Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
          Suas credenciais são criptografadas e seguras. Não armazenamos suas
          senhas.
        </Text>
      </ScrollView>

      {/* MFA Modal */}
      {mfaVisible && mfaItemId && mfaParameter && (
        <MFAModal
          visible={mfaVisible}
          onClose={() => setMfaVisible(false)}
          itemId={mfaItemId}
          connectorName={connectorName}
          parameter={mfaParameter}
          onSuccess={handleMFASuccess}
        />
      )}

      {/* OAuth Modal */}
      {oauthVisible && oauthUrl && (
        <OAuthModal
          visible={oauthVisible}
          onClose={() => setOauthVisible(false)}
          connectorName={connectorName}
          oauthUrl={oauthUrl}
          onSuccess={handleMFASuccess}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    marginBottom: 24,
    textAlign: 'center',
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  connectButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  disclaimer: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    marginBottom: 24,
  },
});
