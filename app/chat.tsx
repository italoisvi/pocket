import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { AviaDePapelIcon } from '@/components/AviaDePapelIcon';
import { RelogioTresIcon } from '@/components/RelogioTresIcon';
import { KangarooIcon } from '@/components/KangarooIcon';
import { ComenteMedicalIcon } from '@/components/ComenteMedicalIcon';
import Markdown from 'react-native-markdown-display';
import {
  sendMessageToDeepSeek,
  type Message,
  type Conversation,
} from '@/lib/deepseek';
import { supabase } from '@/lib/supabase';

const CURRENT_CONVERSATION_KEY = '@pocket_current_conversation';

export default function ChatScreen() {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadCurrentConversation();
    loadUserContext();
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const loadCurrentConversation = async () => {
    try {
      const saved = await AsyncStorage.getItem(CURRENT_CONVERSATION_KEY);
      if (saved) {
        const conversation: Conversation = JSON.parse(saved);
        setMessages(conversation.messages);
        setConversationId(conversation.id);
      } else {
        // Create new conversation without initial message
        const newId = Date.now().toString();
        setConversationId(newId);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const [userContext, setUserContext] = useState<{
    totalExpenses?: number;
    categoryBreakdown?: { [key: string]: number };
    recentExpenses?: Array<{ name: string; amount: number; category: string }>;
  }>({});

  const loadUserContext = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Load user profile to get name
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.name) {
        setUserName(profile.name);
      }

      // Get expenses from current month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayISO = firstDayOfMonth.toISOString();

      const { data: expenses } = await supabase
        .from('expenses')
        .select('establishment_name, amount, category')
        .eq('user_id', user.id)
        .gte('date', firstDayISO)
        .order('date', { ascending: false });

      if (expenses && expenses.length > 0) {
        const totalExpenses = expenses.reduce(
          (sum, exp) => sum + exp.amount,
          0
        );

        const categoryBreakdown: { [key: string]: number } = {};
        expenses.forEach((exp) => {
          const category = exp.category || 'Outros';
          categoryBreakdown[category] =
            (categoryBreakdown[category] || 0) + exp.amount;
        });

        const recentExpenses = expenses.slice(0, 10).map((exp) => ({
          name: exp.establishment_name,
          amount: exp.amount,
          category: exp.category || 'Outros',
        }));

        setUserContext({
          totalExpenses,
          categoryBreakdown,
          recentExpenses,
        });
      }
    } catch (error) {
      console.error('Error loading user context:', error);
    }
  };

  const saveConversation = async (updatedMessages: Message[]) => {
    try {
      const conversation: Conversation = {
        id: conversationId,
        title:
          updatedMessages
            .find((m) => m.role === 'user')
            ?.content.substring(0, 50) || 'Nova conversa',
        messages: updatedMessages,
        createdAt: parseInt(conversationId),
        updatedAt: Date.now(),
      };

      await AsyncStorage.setItem(
        CURRENT_CONVERSATION_KEY,
        JSON.stringify(conversation)
      );

      // Save to history
      const historyKey = `@pocket_conversation_${conversationId}`;
      await AsyncStorage.setItem(historyKey, JSON.stringify(conversation));

      // Update history list
      const historyListKey = '@pocket_conversation_history';
      const historyListStr = await AsyncStorage.getItem(historyListKey);
      const historyList: string[] = historyListStr
        ? JSON.parse(historyListStr)
        : [];

      if (!historyList.includes(conversationId)) {
        historyList.unshift(conversationId);
        await AsyncStorage.setItem(historyListKey, JSON.stringify(historyList));
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      const response = await sendMessageToDeepSeek(
        updatedMessages,
        userContext
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveConversation(finalMessages);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(
        'Erro',
        'Não foi possível enviar a mensagem. Tente novamente.'
      );
      // Remove user message on error
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = async () => {
    try {
      // Save current conversation to history
      if (messages.length > 0) {
        await saveConversation(messages);
      }

      // Create new conversation without initial message
      const newId = Date.now().toString();
      setConversationId(newId);
      setMessages([]);

      // Clear current conversation
      await AsyncStorage.removeItem(CURRENT_CONVERSATION_KEY);
    } catch (error) {
      console.error('Error creating new conversation:', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
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
        <Text style={[styles.title, { color: theme.text }]}>Walts</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleNewConversation}
          >
            <ComenteMedicalIcon size={24} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/chat-history')}
          >
            <RelogioTresIcon size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={[
          styles.messagesContent,
          messages.length === 0 && styles.emptyMessagesContent,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && !loading ? (
          <View style={styles.welcomeContainer}>
            <Text style={[styles.welcomeText, { color: theme.text }]}>
              Olá, {userName || 'amigo'}! Em que posso te ajudar?
            </Text>
          </View>
        ) : (
          <>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageWrapper,
                  message.role === 'user'
                    ? styles.userMessageWrapper
                    : styles.assistantMessageWrapper,
                ]}
              >
                {message.role === 'user' ? (
                  <View
                    style={[
                      styles.userMessage,
                      {
                        backgroundColor: theme.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        {
                          color:
                            theme.background === '#000' ? theme.text : '#FFF',
                        },
                      ]}
                    >
                      {message.content}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.assistantMessage}>
                    <Markdown
                      style={{
                        body: {
                          color: theme.text,
                          fontSize: 18,
                          fontFamily: 'CormorantGaramond-Regular',
                          lineHeight: 24,
                        },
                        strong: {
                          fontFamily: 'CormorantGaramond-SemiBold',
                          fontWeight: '600',
                        },
                        em: {
                          fontFamily: 'CormorantGaramond-Italic',
                          fontStyle: 'italic',
                        },
                        bullet_list: {
                          marginVertical: 4,
                        },
                        ordered_list: {
                          marginVertical: 4,
                        },
                        list_item: {
                          marginVertical: 2,
                        },
                        paragraph: {
                          marginVertical: 4,
                        },
                      }}
                    >
                      {message.content}
                    </Markdown>
                  </View>
                )}
              </View>
            ))}
            {loading && (
              <View style={styles.assistantMessageWrapper}>
                <View style={styles.assistantMessage}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              color: theme.text,
            },
          ]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Digite sua mensagem..."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={500}
          autoCapitalize="sentences"
          autoCorrect={true}
          spellCheck={true}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor:
                !inputText.trim() || loading
                  ? theme.border
                  : theme.background === '#000'
                    ? theme.card
                    : theme.primary,
              borderWidth: 2,
              borderColor:
                !inputText.trim() || loading
                  ? theme.border
                  : theme.background === '#000'
                    ? theme.cardBorder
                    : theme.primary,
            },
          ]}
          onPress={handleSendMessage}
          disabled={!inputText.trim() || loading}
        >
          <AviaDePapelIcon
            size={20}
            color={
              !inputText.trim() || loading
                ? theme.textSecondary
                : theme.background === '#000'
                  ? theme.text
                  : '#FFF'
            }
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyMessagesContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  welcomeText: {
    fontSize: 24,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  userMessageWrapper: {
    alignItems: 'flex-end',
  },
  assistantMessageWrapper: {
    alignItems: 'flex-start',
  },
  userMessage: {
    maxWidth: '80%',
    borderRadius: 20,
    padding: 14,
    paddingHorizontal: 18,
  },
  assistantMessage: {
    maxWidth: '80%',
    padding: 4,
  },
  messageText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    padding: 12,
    borderRadius: 20,
    borderWidth: 2,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
