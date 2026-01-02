import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { OpenFinanceIcon } from '@/components/OpenFinanceIcon';
import {
  getConnectedItems,
  syncItem,
  disconnectItem,
  getApiKey,
} from '@/lib/pluggy';
import { useCallback } from 'react';
import { MFAModal } from '@/components/MFAModal';
import { OAuthModal } from '@/components/OAuthModal';

type PluggyItem = {
  id: string;
  pluggy_item_id: string;
  connector_name: string;
  status: string;
  last_updated_at: string | null;
  created_at: string;
};

export default function OpenFinanceScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<PluggyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mfaVisible, setMfaVisible] = useState(false);
  const [mfaItemId, setMfaItemId] = useState<string | null>(null);
  const [mfaConnectorName, setMfaConnectorName] = useState<string>('');
  const [mfaParameter, setMfaParameter] = useState<any>(null);
  const [oauthVisible, setOauthVisible] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string>('');
  const [oauthConnectorName, setOauthConnectorName] = useState<string>('');

  const loadConnectedBanks = async () => {
    try {
      const data = await getConnectedItems();
      setItems(data);
    } catch (error) {
      console.error('Error loading banks:', error);
      Alert.alert('Erro', 'Não foi possível carregar bancos conectados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadConnectedBanks();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConnectedBanks();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadConnectedBanks();
  };

  const handleConnectBank = () => {
    router.push('/open-finance/connect');
  };

  const handleViewAccounts = (itemId: string, connectorName: string) => {
    router.push({
      pathname: '/open-finance/accounts/[id]',
      params: { id: itemId, name: connectorName },
    });
  };

  const handleSyncItem = async (
    itemId: string,
    pluggyItemId: string,
    connectorName: string
  ) => {
    try {
      console.log('[open-finance] Starting sync...');
      console.log('[open-finance] Database UUID:', itemId);
      console.log('[open-finance] Pluggy Item ID:', pluggyItemId);

      const result = await syncItem(pluggyItemId);
      console.log('[open-finance] Sync result:', result);

      if (result.accountsCount > 0) {
        Alert.alert(
          'Sucesso',
          `${connectorName}: ${result.accountsCount} conta(s) sincronizada(s)!`
        );
      } else if (result.item.status === 'UPDATING') {
        Alert.alert(
          'Aguarde',
          `${connectorName} ainda está processando. Tente novamente em alguns instantes.`
        );
      } else if (result.item.status === 'WAITING_USER_INPUT') {
        console.log('[open-finance] Item requires MFA');
        console.log('[open-finance] Item ID from result:', result.item.id);

        // O result.item.id é o pluggy_item_id, não o UUID do banco
        // Vamos usar ele diretamente com API Key (não Connect Token!)
        const apiKey = await getApiKey();
        console.log('[open-finance] API Key generated');
        console.log(
          '[open-finance] Fetching item from Pluggy:',
          result.item.id
        );

        const itemResponse = await fetch(
          `https://api.pluggy.ai/items/${result.item.id}`,
          {
            headers: { 'X-API-KEY': apiKey },
          }
        );

        console.log(
          '[open-finance] Item response status:',
          itemResponse.status
        );

        if (!itemResponse.ok) {
          const errorText = await itemResponse.text();
          console.error('[open-finance] Pluggy API error:', errorText);
          throw new Error(`Falha ao buscar informações de MFA: ${errorText}`);
        }

        const fullItem = await itemResponse.json();
        console.log('[open-finance] Full item:', fullItem);
        console.log('[open-finance] MFA parameter:', fullItem.parameter);

        if (fullItem.parameter) {
          // Verificar se é OAuth ou MFA tradicional
          const isOAuth = fullItem.parameter.name === 'oauth_code';

          if (isOAuth) {
            // OAuth: Abrir URL de autenticação do banco
            const authUrl =
              fullItem.parameter.data?.url || fullItem.parameter.data;

            if (authUrl && typeof authUrl === 'string') {
              console.log('[open-finance] OAuth URL:', authUrl);
              setOauthUrl(authUrl);
              setOauthConnectorName(connectorName);
              setOauthVisible(true);
            } else {
              console.error(
                '[open-finance] OAuth URL not found in parameter:',
                fullItem.parameter
              );
              Alert.alert(
                'Erro',
                'Não foi possível obter o link de autenticação. Por favor, tente novamente.'
              );
            }
          } else {
            // MFA tradicional: Mostrar modal para digitar código
            setMfaItemId(result.item.databaseId);
            setMfaConnectorName(connectorName);
            setMfaParameter(fullItem.parameter);
            setMfaVisible(true);
          }
        } else {
          Alert.alert(
            'Erro',
            'Banco requer autenticação adicional, mas não foi possível obter os detalhes.'
          );
        }
      } else if (
        result.item.status === 'OUTDATED' ||
        result.item.status === 'LOGIN_ERROR'
      ) {
        const errorMsg =
          result.item.error?.message || 'Credenciais inválidas ou expiradas';
        Alert.alert(
          'Erro de Conexão',
          `${connectorName}: ${errorMsg}\n\nReconecte o banco com suas credenciais atualizadas.`
        );
      } else {
        Alert.alert(
          'Atenção',
          `${connectorName}: Nenhuma conta encontrada ainda. Status: ${result.item.status}`
        );
      }

      // Recarregar lista
      loadConnectedBanks();
    } catch (error) {
      console.error('[open-finance] Error syncing item:', error);

      // Se o erro for 404 (item não encontrado), significa que o item foi deletado ou expirou na Pluggy
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        Alert.alert(
          'Banco Desconectado',
          `${connectorName} não está mais conectado na Pluggy. Por favor, reconecte o banco.`,
          [
            {
              text: 'Reconectar',
              onPress: () => handleConnectBank(),
            },
            { text: 'Cancelar', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Erro', 'Não foi possível atualizar o banco');
      }
    }
  };

  const handleDeleteItem = (itemId: string, connectorName: string) => {
    Alert.alert(
      'Desconectar Banco',
      `Tem certeza que deseja desconectar ${connectorName}?\n\nTodas as contas e transações serão removidas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectItem(itemId);
              Alert.alert('Sucesso', `${connectorName} foi desconectado`);
              loadConnectedBanks();
            } catch (error) {
              console.error('[open-finance] Error deleting item:', error);
              Alert.alert('Erro', 'Não foi possível desconectar o banco');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UPDATED':
        return '#4ade80';
      case 'UPDATING':
        return '#fbbf24';
      case 'LOGIN_ERROR':
      case 'OUTDATED':
        return '#f87171';
      default:
        return theme.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'UPDATED':
        return 'Atualizado';
      case 'UPDATING':
        return 'Atualizando...';
      case 'LOGIN_ERROR':
        return 'Erro de login';
      case 'OUTDATED':
        return 'Desatualizado';
      case 'WAITING_USER_INPUT':
        return 'Aguardando';
      default:
        return status;
    }
  };

  const handleMFASuccess = async () => {
    // Após enviar o MFA, recarregar a lista de bancos
    // O usuário poderá sincronizar novamente se necessário
    await loadConnectedBanks();
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Open Finance</Text>
        <TouchableOpacity
          style={[
            styles.addButton,
            {
              backgroundColor:
                theme.background === '#000' ? theme.card : theme.primary,
              borderWidth: 2,
              borderColor:
                theme.background === '#000' ? theme.cardBorder : theme.primary,
            },
          ]}
          onPress={handleConnectBank}
        >
          <Text
            style={[
              styles.addButtonText,
              {
                color: theme.background === '#000' ? theme.text : '#fff',
              },
            ]}
          >
            + Conectar
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista de bancos */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={theme.primary}
            style={styles.loader}
          />
        ) : items.length > 0 ? (
          items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteItem(item.id, item.connector_name)}
              >
                <Text style={[styles.deleteButtonText, { color: '#f87171' }]}>
                  🗑️
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cardContent}
                onPress={() => handleViewAccounts(item.id, item.connector_name)}
              >
                <View style={styles.cardLeft}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {item.connector_name}
                  </Text>
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: getStatusColor(item.status) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.cardSubtitle,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {getStatusText(item.status)}
                    </Text>
                  </View>
                  {item.last_updated_at && (
                    <Text
                      style={[styles.cardDate, { color: theme.textSecondary }]}
                    >
                      Atualizado:{' '}
                      {new Date(item.last_updated_at).toLocaleDateString(
                        'pt-BR'
                      )}
                    </Text>
                  )}
                </View>
                <View style={styles.cardRight}>
                  <Text style={[styles.viewText, { color: theme.primary }]}>
                    Ver contas →
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <OpenFinanceIcon size={80} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhum banco conectado
            </Text>
            <Text
              style={[styles.emptyDescription, { color: theme.textSecondary }]}
            >
              Conecte sua conta bancária para sincronizar transações
              automaticamente
            </Text>
            <TouchableOpacity
              style={[
                styles.emptyButton,
                {
                  backgroundColor:
                    theme.background === '#000' ? theme.card : theme.primary,
                  borderWidth: 2,
                  borderColor:
                    theme.background === '#000'
                      ? theme.cardBorder
                      : theme.primary,
                },
              ]}
              onPress={handleConnectBank}
            >
              <Text
                style={[
                  styles.emptyButtonText,
                  {
                    color: theme.background === '#000' ? theme.text : '#fff',
                  },
                ]}
              >
                Conectar Banco
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* MFA Modal */}
      {mfaVisible && mfaItemId && mfaParameter && (
        <MFAModal
          visible={mfaVisible}
          onClose={() => setMfaVisible(false)}
          itemId={mfaItemId}
          connectorName={mfaConnectorName}
          parameter={mfaParameter}
          onSuccess={handleMFASuccess}
        />
      )}

      {/* OAuth Modal */}
      {oauthVisible && oauthUrl && (
        <OAuthModal
          visible={oauthVisible}
          onClose={() => setOauthVisible(false)}
          connectorName={oauthConnectorName}
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
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 40,
  },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  deleteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 20,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  syncButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  syncButtonText: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  cardDate: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
  },
  cardRight: {
    marginLeft: 12,
  },
  viewText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginTop: 24,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
