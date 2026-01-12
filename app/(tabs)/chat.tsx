import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { RelogioTresIcon } from '@/components/RelogioTresIcon';
import { ComenteMedicalIcon } from '@/components/ComenteMedicalIcon';
import {
  sendMessageToDeepSeek,
  type Message,
  type MessageAttachment,
} from '@/lib/deepseek';
import { sendMessageToWaltsAgent } from '@/lib/walts-agent';
import { supabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/categories';
import { PaywallModal } from '@/components/PaywallModal';
import { usePremium } from '@/lib/usePremium';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage } from '@/components/ChatMessage';

export default function ChatScreen() {
  const { theme } = useTheme();
  const {
    isPremium,
    loading: premiumLoading,
    refresh: refreshPremium,
  } = usePremium();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [useAgent, setUseAgent] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadUserContext();
  }, []);

  const handlePaywallSuccess = async () => {
    await refreshPremium();
  };

  useFocusEffect(
    useCallback(() => {
      loadCurrentConversation();
    }, [])
  );

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

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
      console.error('Error loading conversation:', error);
    }
  };

  const [userContext, setUserContext] = useState<{
    totalExpenses?: number;
    totalIncome?: number;
    categoryBreakdown?: { [key: string]: number };
    essentialExpenses?: { [key: string]: number };
    nonEssentialExpenses?: { [key: string]: number };
    recentExpenses?: Array<{ name: string; amount: number; category: string }>;
    openFinance?: {
      connectedBanks: Array<{ name: string; status: string }>;
      accounts: Array<{
        name: string;
        type: string;
        subtype: string | null;
        balance: number | null;
        creditLimit: number | null;
        availableCredit: number | null;
      }>;
      recentTransactions: Array<{
        description: string;
        amount: number;
        date: string;
        type: string;
        status: string;
      }>;
    };
  }>({});

  const loadUserContext = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, monthly_salary, income_cards')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.name) {
        setUserName(profile.name);
      }

      let totalIncome = 0;
      if (profile?.income_cards && Array.isArray(profile.income_cards)) {
        totalIncome = profile.income_cards.reduce((sum, card) => {
          const salary = parseFloat(
            card.salary.replace(/\./g, '').replace(',', '.')
          );
          return sum + (isNaN(salary) ? 0 : salary);
        }, 0);
      }
      if (totalIncome === 0 && profile?.monthly_salary) {
        totalIncome = profile.monthly_salary;
      }

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayISO = firstDayOfMonth.toISOString();

      const { data: expenses } = await supabase
        .from('expenses')
        .select('establishment_name, amount, category, subcategory, date')
        .eq('user_id', user.id)
        .gte('created_at', firstDayISO)
        .order('created_at', { ascending: false });

      const { data: openFinanceItems } = await supabase
        .from('pluggy_items')
        .select('id, connector_name, status')
        .eq('user_id', user.id);

      const { data: openFinanceAccounts } = await supabase
        .from('pluggy_accounts')
        .select(
          'id, name, type, subtype, balance, credit_limit, available_credit_limit'
        )
        .eq('user_id', user.id);

      const { data: openFinanceTransactions } = await supabase
        .from('pluggy_transactions')
        .select('description, amount, date, type, status')
        .eq('user_id', user.id)
        .gte('date', firstDayOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(50);

      if (expenses && expenses.length > 0) {
        const totalExpenses = expenses.reduce(
          (sum, exp) => sum + exp.amount,
          0
        );

        const categoryBreakdown: { [key: string]: number } = {};
        const essentialExpenses: { [key: string]: number } = {};
        const nonEssentialExpenses: { [key: string]: number } = {};

        expenses.forEach((exp) => {
          const category = exp.category || 'Outros';
          const subcategory = exp.subcategory || 'Outros';
          categoryBreakdown[category] =
            (categoryBreakdown[category] || 0) + exp.amount;

          const categoryInfo =
            CATEGORIES[exp.category as keyof typeof CATEGORIES];
          if (categoryInfo) {
            const key = `${categoryInfo.name} - ${subcategory}`;
            if (categoryInfo.type === 'essencial') {
              essentialExpenses[key] =
                (essentialExpenses[key] || 0) + exp.amount;
            } else {
              nonEssentialExpenses[key] =
                (nonEssentialExpenses[key] || 0) + exp.amount;
            }
          }
        });

        const recentExpenses = expenses.slice(0, 10).map((exp) => ({
          name: exp.establishment_name,
          amount: exp.amount,
          category: exp.category || 'Outros',
        }));

        setUserContext({
          totalExpenses,
          totalIncome,
          categoryBreakdown,
          essentialExpenses,
          nonEssentialExpenses,
          recentExpenses,
          openFinance: {
            connectedBanks:
              openFinanceItems?.map((item) => ({
                name: item.connector_name,
                status: item.status,
              })) || [],
            accounts:
              openFinanceAccounts?.map((acc) => ({
                name: acc.name,
                type: acc.type,
                subtype: acc.subtype,
                balance: acc.balance,
                creditLimit: acc.credit_limit,
                availableCredit: acc.available_credit_limit,
              })) || [],
            recentTransactions:
              openFinanceTransactions?.map((tx) => ({
                description: tx.description,
                amount: tx.amount,
                date: tx.date,
                type: tx.type,
                status: tx.status,
              })) || [],
          },
        });
      } else {
        setUserContext({
          totalIncome,
          openFinance: {
            connectedBanks:
              openFinanceItems?.map((item) => ({
                name: item.connector_name,
                status: item.status,
              })) || [],
            accounts:
              openFinanceAccounts?.map((acc) => ({
                name: acc.name,
                type: acc.type,
                subtype: acc.subtype,
                balance: acc.balance,
                creditLimit: acc.credit_limit,
                availableCredit: acc.available_credit_limit,
              })) || [],
            recentTransactions:
              openFinanceTransactions?.map((tx) => ({
                description: tx.description,
                amount: tx.amount,
                date: tx.date,
                type: tx.type,
                status: tx.status,
              })) || [],
          },
        });
      }
    } catch (error) {
      console.error('Error loading user context:', error);
    }
  };

  const saveConversation = async (updatedMessages: Message[]) => {
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
        .eq('id', conversationId)
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
          .eq('id', conversationId)
          .eq('user_id', user.id);
      } else {
        await supabase.from('conversations').insert({
          id: conversationId,
          user_id: user.id,
          title,
          messages: updatedMessages,
          created_at: parseInt(conversationId),
          updated_at: now,
        });
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const handleSendMessage = async (
    text: string,
    attachments?: MessageAttachment[]
  ) => {
    if ((!text.trim() && (!attachments || attachments.length === 0)) || loading)
      return;

    if (!isPremium) {
      setShowPaywall(true);
      return;
    }

    let messageContent = text.trim();
    let displayContent = text.trim();

    if (attachments && attachments.length > 0) {
      const imageAttachments = attachments.filter((a) => a.type === 'image');
      const audioAttachments = attachments.filter((a) => a.type === 'audio');

      // Processar imagens com OCR
      if (imageAttachments.length > 0) {
        const ocrResults = imageAttachments
          .filter((a) => a.ocrData)
          .map((a) => {
            const ocr = a.ocrData!;
            let result = `\n📋 COMPROVANTE DETECTADO:\n`;
            result += `- Estabelecimento: ${ocr.establishment_name || 'Não identificado'}\n`;
            result += `- Valor: R$ ${ocr.amount?.toFixed(2) || 'Não identificado'}\n`;
            result += `- Data: ${ocr.date || 'Não identificada'}\n`;
            if (ocr.items && ocr.items.length > 0) {
              result += `- Itens: ${ocr.items.map((i) => `${i.name} (${i.quantity}x R$ ${i.price.toFixed(2)})`).join(', ')}\n`;
            }
            return result;
          })
          .join('\n');

        if (ocrResults) {
          messageContent = messageContent
            ? `${messageContent}\n${ocrResults}`
            : `[Imagem de comprovante enviada]${ocrResults}`;
          displayContent = displayContent || '[Imagem enviada]';
        } else {
          messageContent = messageContent
            ? `${messageContent}\n\n[Imagem enviada - não foi possível extrair dados]`
            : `[Imagem enviada - não foi possível extrair dados]`;
          displayContent = displayContent || '[Imagem enviada]';
        }
      }

      // Processar áudios - serão transcritos pelo walts-agent
      if (audioAttachments.length > 0) {
        // Não modificar messageContent - a transcrição será feita no servidor
        // Não definir displayContent - apenas o player de áudio deve aparecer
        if (!messageContent) {
          messageContent = ''; // Áudio será processado pelo walts-agent
        }
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: displayContent || messageContent, // Sem fallback para áudio
      timestamp: Date.now(),
      attachments,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      let response: string;

      const messagesForApi = updatedMessages.map((m) => ({
        ...m,
        content:
          m.id === userMessage.id && attachments?.length
            ? messageContent
            : m.content,
      }));

      if (useAgent) {
        console.log('[chat] Using Walts Agent mode');
        response = await sendMessageToWaltsAgent(messagesForApi);
      } else {
        console.log('[chat] Using normal chat mode');
        response = await sendMessageToDeepSeek(messagesForApi, userContext);
      }

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
      setMessages(messages);
    } finally {
      setLoading(false);
    }
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
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                attachments={message.attachments}
              />
            ))}
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ChatInput
        onSendMessage={handleSendMessage}
        loading={loading}
        isPremium={isPremium}
        onShowPaywall={() => setShowPaywall(true)}
      />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={handlePaywallSuccess}
        title="Walts Premium"
        subtitle="Seu assistente financeiro com inteligência artificial"
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
    fontSize: 26,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  loadingContainer: {
    alignSelf: 'flex-start',
    padding: 16,
  },
});
