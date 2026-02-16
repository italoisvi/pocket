import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { sendMessageToWaltsAgent, type Message } from '@/lib/walts-agent';
import type { MessageAttachment } from '@/lib/chat-attachments';
import { supabase } from '@/lib/supabase';
import { PaywallModal } from '@/components/PaywallModal';
import { usePremium } from '@/lib/usePremium';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage } from '@/components/ChatMessage';
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import { RelogioTresIcon } from '@/components/RelogioTresIcon';
import { ComenteMedicalIcon } from '@/components/ComenteMedicalIcon';
import { MicrophoneIcon } from '@/components/MicrophoneIcon';
import { useVoice } from '@/lib/voice-context';
import { VoiceOverlay } from '@/components/VoiceOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FREE_MESSAGES_PER_MONTH = 3;

function getFreeMessagesKey(): string {
  const now = new Date();
  return `walts_free_msgs_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const { theme } = useTheme();
  const { isPremium, refresh: refreshPremium } = usePremium();
  const voice = useVoice();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [showPaywall, setShowPaywall] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const messagesRef = useRef<Message[]>([]);
  const conversationIdRef = useRef<string>('');
  const [freeMessageCount, setFreeMessageCount] = useState(0);
  const freeMessageCountRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    freeMessageCountRef.current = freeMessageCount;
  }, [freeMessageCount]);

  useEffect(() => {
    loadUserProfile();
    loadFreeMessageCount();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCurrentConversation();
      loadFreeMessageCount();
    }, [])
  );

  // Register voice turn callback
  useEffect(() => {
    voice.setOnTurnComplete((userMsg, assistantMsg) => {
      const updated = [...messagesRef.current, userMsg, assistantMsg];
      setMessages(updated);
      saveConversationForMessages(updated, conversationIdRef.current);
      incrementFreeMessageCount();
    });

    return () => {
      voice.setOnTurnComplete(null);
    };
  }, []);

  const loadFreeMessageCount = async () => {
    const key = getFreeMessagesKey();
    const stored = await AsyncStorage.getItem(key);
    const count = stored ? parseInt(stored, 10) : 0;
    setFreeMessageCount(isNaN(count) ? 0 : count);
  };

  const incrementFreeMessageCount = async () => {
    const key = getFreeMessagesKey();
    const newCount = freeMessageCountRef.current + 1;
    setFreeMessageCount(newCount);
    await AsyncStorage.setItem(key, newCount.toString());
  };

  const canSendMessage = (): boolean => {
    if (isPremium) return true;
    return freeMessageCount < FREE_MESSAGES_PER_MONTH;
  };

  const loadUserProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.name) {
        setUserName(profile.name);
      }
    } catch (error) {
      console.error('[chat] Error loading profile:', error);
    }
  };

  const loadCurrentConversation = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: conversations } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (conversations && conversations.length > 0) {
        const conversation = conversations[0];
        setMessages(conversation.messages || []);
        setConversationId(conversation.id);
      } else {
        const newId = Date.now().toString();
        setConversationId(newId);
        setMessages([]);
      }
    } catch (error) {
      console.error('[chat] Error loading conversation:', error);
    }
  };

  const saveConversationForMessages = async (
    updatedMessages: Message[],
    convId: string
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const title =
        updatedMessages
          .find((m) => m.role === 'user')
          ?.content.substring(0, 50) || 'Nova conversa';

      const now = Date.now();

      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', convId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('conversations')
          .update({
            title,
            messages: updatedMessages,
            updated_at: now,
          })
          .eq('id', convId)
          .eq('user_id', user.id);
      } else {
        await supabase.from('conversations').insert({
          id: convId,
          user_id: user.id,
          title,
          messages: updatedMessages,
          created_at: parseInt(convId),
          updated_at: now,
        });
      }
    } catch (error) {
      console.error('[chat] Error saving conversation:', error);
    }
  };

  const saveConversation = async (updatedMessages: Message[]) => {
    await saveConversationForMessages(updatedMessages, conversationId);
  };

  const handleSendMessage = async (
    text: string,
    attachments?: MessageAttachment[]
  ) => {
    if ((!text.trim() && (!attachments || attachments.length === 0)) || loading)
      return;

    if (!canSendMessage()) {
      setShowPaywall(true);
      return;
    }

    const hasImages =
      attachments && attachments.some((a) => a.type === 'image');
    const messageContent = text.trim() || (hasImages ? '' : '');

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      attachments,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      console.log('[chat] Sending message to Walts Agent...');
      const result = await sendMessageToWaltsAgent(updatedMessages);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.response,
        timestamp: Date.now(),
        sessionId: result.sessionId,
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveConversation(finalMessages);
      await incrementFreeMessageCount();
    } catch (error) {
      console.error('[chat] Error:', error);
      Alert.alert(
        'Erro',
        'N\u00e3o foi poss\u00edvel enviar a mensagem. Tente novamente.'
      );
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const handleVoicePress = () => {
    if (!canSendMessage()) {
      setShowPaywall(true);
      return;
    }
    voice.openOverlay();
  };

  const handleNewConversation = async () => {
    try {
      if (messages.length > 0) {
        await saveConversation(messages);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newId = Date.now().toString();
      const now = Date.now();

      await supabase.from('conversations').insert({
        id: newId,
        user_id: user.id,
        title: 'Nova conversa',
        messages: [],
        created_at: now,
        updated_at: now,
      });

      setConversationId(newId);
      setMessages([]);
    } catch (error) {
      console.error('[chat] Error creating new conversation:', error);
    }
  };

  const handlePaywallSuccess = async () => {
    await refreshPremium();
  };

  const remainingMessages = Math.max(
    0,
    FREE_MESSAGES_PER_MONTH - freeMessageCount
  );

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
        <Text style={[styles.title, { color: theme.text }]}>Walts</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleVoicePress}
          >
            <MicrophoneIcon size={24} color={theme.text} />
          </TouchableOpacity>
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

      {messages.length === 0 && !loading ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.messagesContainer, styles.emptyMessagesContent]}>
            <View style={styles.welcomeContainer}>
              <Text style={[styles.welcomeText, { color: theme.text }]}>
                {`Ol\u00e1${userName ? `, ${userName}` : ''}! Em que posso te ajudar?`}
              </Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <FlatList
          ref={flatListRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          ListHeaderComponent={
            loading ? (
              <View style={styles.loadingContainer}>
                <LoadingKangaroo size={50} />
              </View>
            ) : null
          }
          renderItem={({ item: message, index }) => {
            const reversedIndex = messages.length - 1 - index;
            const isLastAssistant =
              message.role === 'assistant' &&
              reversedIndex === messages.length - 1 &&
              !loading;

            return (
              <ChatMessage
                role={message.role}
                content={message.content}
                attachments={message.attachments}
                sessionId={message.sessionId}
                showFeedback={isLastAssistant}
              />
            );
          }}
        />
      )}

      {!isPremium && (
        <View style={styles.freeCounterContainer}>
          <Text
            style={[styles.freeCounterText, { color: theme.textSecondary }]}
          >
            {remainingMessages > 0
              ? `${remainingMessages} de ${FREE_MESSAGES_PER_MONTH} mensagens restantes este m\u00eas`
              : 'Limite de mensagens atingido'}
          </Text>
        </View>
      )}

      <ChatInput
        onSendMessage={handleSendMessage}
        loading={loading}
        isPremium={isPremium}
        onShowPaywall={() => setShowPaywall(true)}
      />

      <VoiceOverlay />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={handlePaywallSuccess}
        title="Walts Premium"
        subtitle="Seu assistente financeiro com intelig\u00eancia artificial"
      />
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
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
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
    paddingHorizontal: 40,
  },
  welcomeText: {
    fontSize: 22,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
  },
  loadingContainer: {
    alignSelf: 'flex-start',
  },
  freeCounterContainer: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  freeCounterText: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
});
