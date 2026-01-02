import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { getApiKey, getConnectToken } from '@/lib/pluggy';

type BankLogoProps = {
  imageUrl: string;
  bankName: string;
  primaryColor: string;
  theme: any;
};

function BankLogo({ imageUrl, bankName, primaryColor, theme }: BankLogoProps) {
  const [imageError, setImageError] = useState(false);

  if (!imageUrl || imageError) {
    return (
      <View
        style={[
          styles.bankLogoPlaceholder,
          { backgroundColor: primaryColor || theme.primary },
        ]}
      >
        <Text style={styles.bankLogoText}>{bankName.charAt(0)}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={styles.bankLogo}
      resizeMode="contain"
      onError={() => setImageError(true)}
    />
  );
}

type Connector = {
  id: number;
  name: string;
  institutionUrl: string;
  imageUrl: string;
  primaryColor: string;
  type: string;
  country: string;
  credentials: Array<{
    label: string;
    name: string;
    type: string;
    placeholder?: string;
    validation?: string;
  }>;
};

export default function ConnectBankScreen() {
  const { theme } = useTheme();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [filteredConnectors, setFilteredConnectors] = useState<Connector[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState<string | null>(null);

  useEffect(() => {
    loadConnectors();
  }, []);

  useEffect(() => {
    if (search.trim() === '') {
      setFilteredConnectors(connectors);
    } else {
      const filtered = connectors.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      );
      setFilteredConnectors(filtered);
    }
  }, [search, connectors]);

  const loadConnectors = async () => {
    try {
      // Gerar API Key para buscar conectores (Connect Token não tem permissão)
      const apiKeyValue = await getApiKey();
      setApiKey(apiKeyValue);

      // Gerar Connect Token para criar items (tem oauthRedirectUrl configurado)
      const connectTokenValue = await getConnectToken();
      setConnectToken(connectTokenValue);

      // Buscar lista de connectors (bancos disponíveis) - APENAS Open Finance
      const response = await fetch(
        'https://api.pluggy.ai/connectors?countries=BR&isOpenFinance=true',
        {
          headers: {
            'X-API-KEY': apiKeyValue, // ← Usa API Key aqui!
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch connectors');
      }

      const data = await response.json();
      const results = data.results || data;

      // Filtrar apenas bancos (PERSONAL_BANK e BUSINESS_BANK)
      const bankConnectors = results.filter(
        (c: Connector) =>
          c.type === 'PERSONAL_BANK' || c.type === 'BUSINESS_BANK'
      );

      setConnectors(bankConnectors);
      setFilteredConnectors(bankConnectors);
    } catch (error) {
      console.error('Error loading connectors:', error);
      Alert.alert('Erro', 'Não foi possível carregar lista de bancos');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBank = (connector: Connector) => {
    router.push({
      pathname: '/open-finance/credentials',
      params: {
        connectorId: connector.id,
        connectorName: connector.name,
        imageUrl: connector.imageUrl,
        apiKey: connectToken || '', // ← Passa Connect Token (não API Key)!
        credentials: JSON.stringify(connector.credentials),
      },
    });
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeftIcon size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          Conectar Banco
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              color: theme.text,
            },
          ]}
          placeholder="Buscar banco..."
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Lista de bancos */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={theme.primary}
          style={styles.loader}
        />
      ) : (
        <ScrollView style={styles.content}>
          {filteredConnectors.length > 0 ? (
            filteredConnectors.map((connector) => (
              <TouchableOpacity
                key={connector.id}
                style={[
                  styles.bankCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={() => handleSelectBank(connector)}
              >
                <View style={styles.bankCardContent}>
                  <BankLogo
                    imageUrl={connector.imageUrl}
                    bankName={connector.name}
                    primaryColor={connector.primaryColor}
                    theme={theme}
                  />
                  <View style={styles.bankInfo}>
                    <Text style={[styles.bankName, { color: theme.text }]}>
                      {connector.name}
                    </Text>
                    <Text
                      style={[styles.bankType, { color: theme.textSecondary }]}
                    >
                      {connector.type === 'PERSONAL_BANK'
                        ? 'Conta Pessoal'
                        : 'Conta Empresarial'}
                    </Text>
                  </View>
                  <View style={{ transform: [{ rotate: '180deg' }] }}>
                    <ChevronLeftIcon size={20} color={theme.textSecondary} />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Nenhum banco encontrado
              </Text>
            </View>
          )}
        </ScrollView>
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
  placeholder: {
    width: 40,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInput: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 40,
  },
  bankCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  bankCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bankLogo: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  bankLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankLogoText: {
    fontSize: 24,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#fff',
  },
  bankInfo: {
    flex: 1,
    marginLeft: 16,
  },
  bankName: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 2,
  },
  bankType: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
});
