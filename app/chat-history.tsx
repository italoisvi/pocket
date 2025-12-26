import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LixoIcon } from '@/components/LixoIcon';
import type { Conversation } from '@/lib/deepseek';

const CURRENT_CONVERSATION_KEY = '@pocket_current_conversation';
const HISTORY_LIST_KEY = '@pocket_conversation_history';

export default function ChatHistoryScreen() {
  const { theme } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const historyListStr = await AsyncStorage.getItem(HISTORY_LIST_KEY);
      if (!historyListStr) {
        setLoading(false);
        return;
      }

      const historyList: string[] = JSON.parse(historyListStr);
      const loadedConversations: Conversation[] = [];

      for (const id of historyList) {
        const key = `@pocket_conversation_${id}`;
        const conversationStr = await AsyncStorage.getItem(key);
        if (conversationStr) {
          const conversation: Conversation = JSON.parse(conversationStr);
          loadedConversations.push(conversation);
        }
      }

      // Sort by updatedAt descending
      loadedConversations.sort((a, b) => b.updatedAt - a.updatedAt);
      setConversations(loadedConversations);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    Alert.alert(
      'Excluir Conversa',
      'Tem certeza que deseja excluir esta conversa?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove from storage
              const key = `@pocket_conversation_${conversationId}`;
              await AsyncStorage.removeItem(key);

              // Update history list
              const historyListStr =
                await AsyncStorage.getItem(HISTORY_LIST_KEY);
              if (historyListStr) {
                const historyList: string[] = JSON.parse(historyListStr);
                const updatedList = historyList.filter(
                  (id) => id !== conversationId
                );
                await AsyncStorage.setItem(
                  HISTORY_LIST_KEY,
                  JSON.stringify(updatedList)
                );
              }

              // Check if this is the current conversation
              const currentConvStr = await AsyncStorage.getItem(
                CURRENT_CONVERSATION_KEY
              );
              if (currentConvStr) {
                const currentConv: Conversation = JSON.parse(currentConvStr);
                if (currentConv.id === conversationId) {
                  await AsyncStorage.removeItem(CURRENT_CONVERSATION_KEY);
                }
              }

              // Reload history
              loadHistory();
            } catch (error) {
              console.error('Error deleting conversation:', error);
              Alert.alert('Erro', 'Não foi possível excluir a conversa.');
            }
          },
        },
      ]
    );
  };

  const handleOpenConversation = async (conversation: Conversation) => {
    try {
      // Set as current conversation
      await AsyncStorage.setItem(
        CURRENT_CONVERSATION_KEY,
        JSON.stringify(conversation)
      );
      router.back();
    } catch (error) {
      console.error('Error opening conversation:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return 'Hoje';
    } else if (diffInDays === 1) {
      return 'Ontem';
    } else if (diffInDays < 7) {
      return `${diffInDays} dias atrás`;
    } else {
      return date.toLocaleDateString('pt-BR');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[styles.header, { backgroundColor: theme.background }]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          Histórico de Conversas
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Carregando...
          </Text>
        ) : conversations.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Nenhuma conversa salva ainda.
          </Text>
        ) : (
          conversations.map((conversation) => (
            <TouchableOpacity
              key={conversation.id}
              style={[
                styles.conversationCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={() => handleOpenConversation(conversation)}
            >
              <View style={styles.conversationLeft}>
                <Text
                  style={[styles.conversationTitle, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {conversation.title}
                </Text>
                <Text
                  style={[
                    styles.conversationDate,
                    { color: theme.textSecondary },
                  ]}
                >
                  {formatDate(conversation.updatedAt)}
                </Text>
                <Text
                  style={[
                    styles.conversationMessages,
                    { color: theme.textSecondary },
                  ]}
                >
                  {conversation.messages.length} mensagens
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteConversation(conversation.id)}
              >
                <LixoIcon size={20} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginTop: 40,
  },
  conversationCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationLeft: {
    flex: 1,
    marginRight: 12,
  },
  conversationTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  conversationDate: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 2,
  },
  conversationMessages: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  deleteButton: {
    padding: 8,
  },
});
