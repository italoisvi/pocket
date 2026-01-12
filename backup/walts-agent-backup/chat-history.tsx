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
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LixoIcon } from '@/components/LixoIcon';
import type { Conversation } from '@/lib/deepseek';
import { supabase } from '@/lib/supabase';
import { getCardShadowStyle } from '@/lib/cardStyles';

export default function ChatHistoryScreen() {
  const { theme } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: conversationsData } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (conversationsData) {
        const mappedConversations: Conversation[] = conversationsData.map(
          (conv) => ({
            id: conv.id,
            title: conv.title,
            messages: conv.messages || [],
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
          })
        );
        setConversations(mappedConversations);
      }
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
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) return;

              // Delete from database
              await supabase
                .from('conversations')
                .delete()
                .eq('id', conversationId)
                .eq('user_id', user.id);

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Marcar esta conversa como a mais recentemente atualizada para ser carregada
      await supabase
        .from('conversations')
        .update({
          updated_at: Date.now(),
        })
        .eq('id', conversation.id)
        .eq('user_id', user.id);

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
                getCardShadowStyle(theme.background === '#000'),
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
