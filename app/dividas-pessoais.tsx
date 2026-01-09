import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { DividasPessoaisIcon } from '@/components/DividasPessoaisIcon';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';

type PersonalDebt = {
  id: string;
  person_name: string;
  amount: number;
  date: string;
  source: 'manual' | 'open_finance';
  subcategory: string;
  receipt_image_url?: string | null;
};

export default function DividasPessoaisScreen() {
  const { theme } = useTheme();
  const [debts, setDebts] = useState<PersonalDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [totalDebt, setTotalDebt] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  useFocusEffect(
    useCallback(() => {
      loadDebts();
    }, [selectedMonth])
  );

  const loadDebts = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Calcular primeiro e último dia do mês selecionado
      const firstDayOfMonth = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth(),
        1
      );
      const lastDayOfMonth = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth() + 1,
        0
      );

      // DEBUG: Verificar transações PIX da Pluggy que deveriam virar expenses
      const { data: pixTransactions } = await supabase
        .from('pluggy_transactions')
        .select(
          'id, description, amount, date, category, payment_data_receiver_name, payment_data_payer_name, expense_id, synced'
        )
        .eq('user_id', user.id)
        .ilike('category', '%pix%')
        .order('date', { ascending: false })
        .limit(10);

      console.log('[DividasPessoais] Transações PIX da Pluggy:', {
        total: pixTransactions?.length || 0,
        data: pixTransactions?.map((tx) => ({
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          receiver: tx.payment_data_receiver_name,
          payer: tx.payment_data_payer_name,
          expense_id: tx.expense_id,
          synced: tx.synced,
        })),
      });

      // DEBUG: Primeiro verificar se existem expenses dessa categoria em qualquer mês
      const { data: allDebts } = await supabase
        .from('expenses')
        .select('id, establishment_name, amount, date, category')
        .eq('user_id', user.id)
        .eq('category', 'dividas_pessoais')
        .order('date', { ascending: false });

      console.log(
        '[DividasPessoais] Total de dívidas pessoais (todos os meses):',
        allDebts?.length || 0
      );
      if (allDebts && allDebts.length > 0) {
        console.log(
          '[DividasPessoais] Primeiras 3 dívidas:',
          allDebts.slice(0, 3)
        );
      }

      // Buscar expenses da categoria 'dividas_pessoais' do mês selecionado
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('id, establishment_name, amount, date, subcategory, image_url')
        .eq('user_id', user.id)
        .eq('category', 'dividas_pessoais')
        .gte('date', firstDayOfMonth.toISOString().split('T')[0])
        .lte('date', lastDayOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false });

      console.log('[DividasPessoais] Query params:', {
        user_id: user.id,
        firstDay: firstDayOfMonth.toISOString().split('T')[0],
        lastDay: lastDayOfMonth.toISOString().split('T')[0],
      });

      console.log('[DividasPessoais] Query result:', {
        error: expensesError,
        count: expensesData?.length || 0,
        data: expensesData,
      });

      if (expensesData) {
        const personalDebts: PersonalDebt[] = expensesData.map((expense) => ({
          id: expense.id,
          person_name: expense.establishment_name,
          amount: expense.amount,
          date: expense.date,
          source: expense.image_url ? 'manual' : 'open_finance',
          subcategory: expense.subcategory,
          receipt_image_url: expense.image_url,
        }));

        setDebts(personalDebts);

        // Calcular total
        const total = personalDebts.reduce((sum, debt) => sum + debt.amount, 0);
        setTotalDebt(total);
      }
    } catch (error) {
      console.error('Erro ao carregar dívidas pessoais:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDebts();
  };

  const syncOldPixTransactions = async () => {
    setSyncing(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      console.log(
        '[DividasPessoais] Iniciando sincronização de PIX antigos...'
      );

      // Buscar todas as transações PIX que ainda não foram sincronizadas
      const { data: pixTransactions } = await supabase
        .from('pluggy_transactions')
        .select('*')
        .eq('user_id', user.id)
        .ilike('category', '%pix%')
        .lt('amount', 0) // Apenas gastos (valores negativos)
        .is('expense_id', null); // Que ainda não foram sincronizadas

      console.log(
        '[DividasPessoais] PIX não sincronizados encontrados:',
        pixTransactions?.length || 0
      );

      if (!pixTransactions || pixTransactions.length === 0) {
        Alert.alert('Info', 'Nenhuma transação PIX antiga para sincronizar');
        return;
      }

      let syncedCount = 0;

      for (const tx of pixTransactions) {
        // Verificar se o recebedor é pessoa física
        const receiverName = tx.payment_data_receiver_name;

        if (!receiverName) continue;

        // Usar lógica similar ao webhook
        const nameLower = receiverName.toLowerCase();
        const cleanText = receiverName
          .replace(/pix/gi, '')
          .replace(/transferencia|transferência/gi, '')
          .replace(/enviado|recebido|para|de/gi, '')
          .trim();

        const words = cleanText
          .split(/\s+/)
          .filter((w: string) => w.length > 1);

        // Verificar se parece ser nome de pessoa
        if (words.length >= 2 && words.length <= 4) {
          const capitalizedWords = words.filter((w: string) =>
            /^[A-Z]/.test(w)
          );
          const isPerson = capitalizedWords.length >= words.length * 0.5;

          if (isPerson) {
            // Criar expense
            const { data: expense } = await supabase
              .from('expenses')
              .insert({
                user_id: user.id,
                establishment_name: receiverName,
                amount: Math.abs(tx.amount),
                date: tx.date,
                category: 'dividas_pessoais',
                subcategory: 'PIX Pessoa Física',
                image_url: null,
              })
              .select()
              .single();

            if (expense) {
              // Vincular expense à transação
              await supabase
                .from('pluggy_transactions')
                .update({
                  expense_id: expense.id,
                  synced: true,
                })
                .eq('id', tx.id);

              syncedCount++;
            }
          }
        }
      }

      console.log('[DividasPessoais] Sincronizados:', syncedCount);
      Alert.alert(
        'Sucesso',
        `${syncedCount} PIX antigo(s) sincronizado(s) com sucesso!`
      );

      // Recarregar lista
      await loadDebts();
    } catch (error) {
      console.error('[DividasPessoais] Erro ao sincronizar:', error);
      Alert.alert('Erro', 'Não foi possível sincronizar PIX antigos');
    } finally {
      setSyncing(false);
    }
  };

  const handleDebtPress = (debt: PersonalDebt) => {
    // Navegar para detalhes do gasto
    router.push(`/expense/${debt.id}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getMonthLabel = () => {
    return selectedMonth.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  };

  const changeMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedMonth);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedMonth(newDate);
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
          Dívidas Pessoais
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

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
        {/* Seletor de Mês */}
        <View style={styles.monthSelector}>
          <TouchableOpacity
            style={styles.monthButton}
            onPress={() => changeMonth('prev')}
          >
            <Text style={[styles.monthButtonText, { color: theme.text }]}>
              ‹
            </Text>
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: theme.text }]}>
            {getMonthLabel()}
          </Text>
          <TouchableOpacity
            style={styles.monthButton}
            onPress={() => changeMonth('next')}
          >
            <Text style={[styles.monthButtonText, { color: theme.text }]}>
              ›
            </Text>
          </TouchableOpacity>
        </View>

        {/* Card de Total */}
        <View
          style={[
            styles.totalCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
            getCardShadowStyle(theme.background === '#000'),
          ]}
        >
          <DividasPessoaisIcon size={32} color="#FF6F61" />
          <View style={styles.totalInfo}>
            <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
              Total em Dívidas Pessoais
            </Text>
            <Text style={[styles.totalValue, { color: '#FF6F61' }]}>
              {formatCurrency(totalDebt)}
            </Text>
          </View>
        </View>

        {/* Botão Sincronizar PIX Antigos */}
        <TouchableOpacity
          style={[
            styles.syncButton,
            {
              backgroundColor: theme.primary,
              borderColor: theme.primary,
            },
          ]}
          onPress={syncOldPixTransactions}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={theme.background} />
          ) : (
            <Text style={[styles.syncButtonText, { color: theme.background }]}>
              Sincronizar PIX do Open Finance
            </Text>
          )}
        </TouchableOpacity>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : debts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <DividasPessoaisIcon size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Nenhuma dívida pessoal registrada este mês
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              PIX para pessoas físicas aparecerão aqui automaticamente
            </Text>
          </View>
        ) : (
          <View style={styles.debtsList}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {debts.length} {debts.length === 1 ? 'Transação' : 'Transações'}
            </Text>
            {debts.map((debt) => (
              <TouchableOpacity
                key={debt.id}
                style={[
                  styles.debtCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(theme.background === '#000'),
                ]}
                onPress={() => handleDebtPress(debt)}
              >
                <View style={styles.debtHeader}>
                  <View style={styles.debtIcon}>
                    <DividasPessoaisIcon size={24} color="#FF6F61" />
                  </View>
                  <View style={styles.debtInfo}>
                    <Text style={[styles.debtName, { color: theme.text }]}>
                      {debt.person_name}
                    </Text>
                    <Text
                      style={[
                        styles.debtSubcategory,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {debt.subcategory} • {formatDate(debt.date)}
                    </Text>
                  </View>
                  <View style={styles.debtAmount}>
                    <Text style={[styles.debtValue, { color: '#FF6F61' }]}>
                      {formatCurrency(debt.amount)}
                    </Text>
                    <View
                      style={[
                        styles.sourceBadge,
                        {
                          backgroundColor:
                            debt.source === 'manual'
                              ? theme.background
                              : '#34d399',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sourceBadgeText,
                          {
                            color:
                              debt.source === 'manual' ? theme.text : '#000',
                          },
                        ]}
                      >
                        {debt.source === 'manual' ? 'Manual' : 'Open Finance'}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
    padding: 24,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  monthButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthButtonText: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  monthText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    textTransform: 'capitalize',
  },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 2,
  },
  totalInfo: {
    marginLeft: 16,
    flex: 1,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 28,
    fontFamily: 'CormorantGaramond-Bold',
  },
  syncButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  debtsList: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 16,
  },
  debtCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
  },
  debtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  debtIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  debtInfo: {
    flex: 1,
  },
  debtName: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  debtSubcategory: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  debtAmount: {
    alignItems: 'flex-end',
  },
  debtValue: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 4,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
