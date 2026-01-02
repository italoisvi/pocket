import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { syncItem } from '@/lib/pluggy';
import { MFAModal } from '@/components/MFAModal';
import { OAuthModal } from '@/components/OAuthModal';

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
  const { theme } = useTheme();
  const params = useLocalSearchParams();

  const connectorId = params.connectorId as string;
  const connectorName = params.connectorName as string;
  const imageUrl = params.imageUrl as string;
  const apiKey = params.apiKey as string;
  const credentialsJson = params.credentials as string;

  const credentials: CredentialField[] = credentialsJson
    ? JSON.parse(credentialsJson)
    : [];

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

  const handleInputChange = (fieldName: string, value: string) => {
    // Se o campo for CPF ou documento, aplicar formatação
    const field = credentials.find((f) => f.name === fieldName);
    const isCPFField =
      field?.label.toLowerCase().includes('cpf') ||
      field?.name.toLowerCase().includes('cpf') ||
      field?.name.toLowerCase().includes('document');

    const formattedValue = isCPFField ? formatCPF(value) : value;
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

      console.log('[credentials] Sending data:', cleanedFormData);

      // 2. Criar o Item via Pluggy API
      const createItemResponse = await fetch('https://api.pluggy.ai/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
          connectorId: parseInt(connectorId),
          parameters: cleanedFormData,
        }),
      });

      if (!createItemResponse.ok) {
        const errorData = await createItemResponse.json();
        console.error('[credentials] Failed to create item:', errorData);
        throw new Error(errorData.message || 'Falha ao conectar banco');
      }

      const itemData = await createItemResponse.json();
      console.log('[credentials] Item created:', itemData.id);
      console.log('[credentials] Item status:', itemData.status);

      // 3. Sincronizar Item e Accounts no Supabase
      console.log('[credentials] Starting sync...');
      const syncResult = await syncItem(itemData.id);
      console.log('[credentials] Sync result:', syncResult);

      // Se o status for WAITING_USER_INPUT, buscar o item completo e abrir modal de MFA
      if (syncResult.item.status === 'WAITING_USER_INPUT') {
        console.log('[credentials] Item requires MFA');

        // Buscar o item completo da Pluggy API para pegar o parameter
        const itemResponse = await fetch(
          `https://api.pluggy.ai/items/${itemData.id}`,
          {
            headers: { 'X-API-KEY': apiKey },
          }
        );

        if (!itemResponse.ok) {
          throw new Error('Falha ao buscar informações de MFA');
        }

        const fullItem = await itemResponse.json();
        console.log('[credentials] Full item:', fullItem);
        console.log('[credentials] MFA parameter:', fullItem.parameter);

        if (fullItem.parameter) {
          // Verificar se é OAuth ou MFA tradicional
          const isOAuth = fullItem.parameter.name === 'oauth_code';

          if (isOAuth) {
            // OAuth: Abrir URL de autenticação do banco
            // A URL está em fullItem.parameter.data.url ou fullItem.parameter.data
            const authUrl =
              fullItem.parameter.data?.url || fullItem.parameter.data;

            if (authUrl && typeof authUrl === 'string') {
              console.log('[credentials] OAuth URL:', authUrl);
              setOauthUrl(authUrl);
              setOauthVisible(true);
            } else {
              console.error(
                '[credentials] OAuth URL not found in parameter:',
                fullItem.parameter
              );
              Alert.alert(
                'Erro',
                'Não foi possível obter o link de autenticação. Por favor, tente novamente.'
              );
            }
          } else {
            // MFA tradicional: Mostrar modal para digitar código
            setMfaItemId(syncResult.item.databaseId);
            setMfaParameter(fullItem.parameter);
            setMfaVisible(true);
          }
        } else {
          Alert.alert(
            'Erro',
            'Banco requer autenticação adicional, mas não foi possível obter os detalhes.'
          );
        }
      } else if (syncResult.item.status === 'UPDATING') {
        // Se o status for UPDATING, informar ao usuário que deve aguardar
        Alert.alert(
          'Aguarde!',
          'Banco conectado com sucesso! Suas contas estão sendo sincronizadas. Isso pode levar alguns minutos. Volte e puxe para atualizar a lista.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else if (syncResult.accountsCount > 0) {
        Alert.alert(
          'Sucesso',
          `Banco conectado! ${syncResult.accountsCount} conta(s) sincronizada(s).`,
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert(
          'Atenção',
          'Banco conectado, mas nenhuma conta foi encontrada ainda. Aguarde alguns instantes e atualize a lista.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error) {
      console.error('[credentials] Error connecting bank:', error);
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
    // Após enviar o MFA, aguardar um pouco e voltar para a tela anterior
    // O usuário poderá sincronizar novamente para verificar o status
    setTimeout(() => {
      router.back();
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
          Digite suas credenciais para conectar sua conta bancária
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
              backgroundColor:
                theme.background === '#000' ? theme.card : theme.primary,
              borderWidth: 2,
              borderColor:
                theme.background === '#000' ? theme.cardBorder : theme.primary,
            },
            loading && styles.connectButtonDisabled,
          ]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator
              color={theme.background === '#000' ? theme.text : '#fff'}
            />
          ) : (
            <Text
              style={[
                styles.connectButtonText,
                {
                  color: theme.background === '#000' ? theme.text : '#fff',
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
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 24,
    textAlign: 'center',
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
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
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  disclaimer: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginBottom: 24,
  },
});
