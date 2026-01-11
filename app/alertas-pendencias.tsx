import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { AlertaIcon } from '@/components/AlertaIcon';
import { CardBrandIcon } from '@/lib/cardBrand';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { checkAndNotifyAlerts } from '@/lib/notifications';

type AlertPriority = 'urgent' | 'attention';

type Alert = {
  id: string;
  type: 'overdue_bill' | 'credit_limit' | 'upcoming_bill' | 'budget_exceeded';
  title: string;
  description: string;
  amount: number;
  priority: AlertPriority;
  daysInfo?: number; // dias atrasado ou dias até vencer
  metadata?: {
    cardName?: string;
    budgetName?: string;
    limitUsedPercent?: number;
  };
};

export default function AlertasPendenciasScreen() {
  const { theme } = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const detectedAlerts: Alert[] = [];
      const today = new Date();

      // Dados para notificações push
      const notificationOverdueBills: Array<{
        id: string;
        description: string;
        amount: number;
        daysOverdue: number;
      }> = [];
      const notificationUpcomingBills: Array<{
        id: string;
        description: string;
        amount: number;
        daysUntilDue: number;
      }> = [];
      const notificationCreditCards: Array<{
        id: string;
        name: string;
        usedCredit: number;
        creditLimit: number;
      }> = [];
      const notificationBudgets: Array<{
        id: string;
        name: string;
        spent: number;
        limit: number;
        notificationsEnabled: boolean;
      }> = [];

      // 1. Buscar boletos/transações pendentes (atrasadas e próximas)
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(today.getDate() + 7);

      const { data: pendingTransactions } = await supabase
        .from('pluggy_transactions')
        .select('id, description, amount, date, status, account_id')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .eq('type', 'DEBIT')
        .lte('date', sevenDaysFromNow.toISOString().split('T')[0]);

      // Buscar contas bancárias (não cartões de crédito)
      const { data: bankAccounts } = await supabase
        .from('pluggy_accounts')
        .select('id')
        .eq('user_id', user.id)
        .in('type', ['BANK', 'CHECKING']);

      const bankAccountIds = bankAccounts?.map((acc) => acc.id) || [];

      if (pendingTransactions) {
        pendingTransactions.forEach((tx) => {
          // Apenas considerar transações de contas bancárias
          if (!bankAccountIds.includes(tx.account_id)) return;

          const dueDate = new Date(tx.date);
          const diffTime = dueDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            // Atrasado
            const daysOverdue = Math.abs(diffDays);
            detectedAlerts.push({
              id: `bill-${tx.id}`,
              type: 'overdue_bill',
              title: tx.description,
              description: `Vencido ha ${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'}`,
              amount: Math.abs(tx.amount),
              priority: 'urgent',
              daysInfo: daysOverdue,
            });
            // Adicionar para notificação
            notificationOverdueBills.push({
              id: tx.id,
              description: tx.description,
              amount: Math.abs(tx.amount),
              daysOverdue,
            });
          } else if (diffDays <= 7) {
            // Vence em até 7 dias
            detectedAlerts.push({
              id: `bill-${tx.id}`,
              type: 'upcoming_bill',
              title: tx.description,
              description:
                diffDays === 0
                  ? 'Vence hoje'
                  : `Vence em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`,
              amount: Math.abs(tx.amount),
              priority: diffDays <= 2 ? 'urgent' : 'attention',
              daysInfo: diffDays,
            });
            // Adicionar para notificação (só até 2 dias)
            if (diffDays <= 2) {
              notificationUpcomingBills.push({
                id: tx.id,
                description: tx.description,
                amount: Math.abs(tx.amount),
                daysUntilDue: diffDays,
              });
            }
          }
        });
      }

      // 2. Buscar cartões de crédito próximos do limite
      const { data: creditAccounts } = await supabase
        .from('pluggy_accounts')
        .select('id, name, balance, credit_limit, available_credit_limit')
        .eq('user_id', user.id)
        .eq('type', 'CREDIT');

      if (creditAccounts) {
        creditAccounts.forEach((account) => {
          if (account.credit_limit && account.available_credit_limit !== null) {
            const usedCredit =
              account.credit_limit - account.available_credit_limit;
            const usedPercent = (usedCredit / account.credit_limit) * 100;

            // Adicionar para notificação (80%+)
            if (usedPercent >= 80) {
              notificationCreditCards.push({
                id: account.id,
                name: account.name,
                usedCredit,
                creditLimit: account.credit_limit,
              });
            }

            if (usedPercent >= 90) {
              detectedAlerts.push({
                id: `credit-${account.id}`,
                type: 'credit_limit',
                title: account.name,
                description: `${usedPercent.toFixed(0)}% do limite utilizado`,
                amount: usedCredit,
                priority: 'urgent',
                metadata: {
                  cardName: account.name,
                  limitUsedPercent: usedPercent,
                },
              });
            } else if (usedPercent >= 70) {
              detectedAlerts.push({
                id: `credit-${account.id}`,
                type: 'credit_limit',
                title: account.name,
                description: `${usedPercent.toFixed(0)}% do limite utilizado`,
                amount: usedCredit,
                priority: 'attention',
                metadata: {
                  cardName: account.name,
                  limitUsedPercent: usedPercent,
                },
              });
            }
          }
        });
      }

      // 3. Buscar orçamentos estourados
      const firstDayOfMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      );
      const lastDayOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0
      );

      const { data: budgets } = await supabase
        .from('budgets')
        .select('id, name, amount, category, notifications_enabled')
        .eq('user_id', user.id);

      if (budgets && budgets.length > 0) {
        // Buscar gastos do mês por categoria
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount, category')
          .eq('user_id', user.id)
          .gte('date', firstDayOfMonth.toISOString().split('T')[0])
          .lte('date', lastDayOfMonth.toISOString().split('T')[0]);

        if (expenses) {
          const spentByCategory: { [key: string]: number } = {};
          expenses.forEach((exp) => {
            const cat = exp.category || 'outros';
            spentByCategory[cat] = (spentByCategory[cat] || 0) + exp.amount;
          });

          budgets.forEach((budget) => {
            const spent = spentByCategory[budget.category] || 0;
            const budgetAmount = Number(budget.amount);
            const percentUsed = (spent / budgetAmount) * 100;

            // Adicionar para notificação (80%+)
            if (percentUsed >= 80) {
              notificationBudgets.push({
                id: budget.id,
                name: budget.name,
                spent,
                limit: budgetAmount,
                notificationsEnabled: budget.notifications_enabled ?? true,
              });
            }

            if (percentUsed >= 100) {
              detectedAlerts.push({
                id: `budget-${budget.id}`,
                type: 'budget_exceeded',
                title: `Orcamento: ${budget.name}`,
                description: `Excedido em ${formatCurrency(spent - budgetAmount)}`,
                amount: spent,
                priority: 'urgent',
                metadata: {
                  budgetName: budget.name,
                },
              });
            } else if (percentUsed >= 80) {
              detectedAlerts.push({
                id: `budget-${budget.id}`,
                type: 'budget_exceeded',
                title: `Orcamento: ${budget.name}`,
                description: `${percentUsed.toFixed(0)}% utilizado - resta ${formatCurrency(budgetAmount - spent)}`,
                amount: spent,
                priority: 'attention',
                metadata: {
                  budgetName: budget.name,
                },
              });
            }
          });
        }
      }

      // Ordenar por prioridade (urgent primeiro) e depois por valor
      detectedAlerts.sort((a, b) => {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
        return b.amount - a.amount;
      });

      setAlerts(detectedAlerts);

      // Disparar notificações push para alertas urgentes
      await checkAndNotifyAlerts(
        notificationBudgets,
        notificationOverdueBills,
        notificationUpcomingBills,
        notificationCreditCards
      );
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAlerts();
  };

  const urgentAlerts = alerts.filter((a) => a.priority === 'urgent');
  const attentionAlerts = alerts.filter((a) => a.priority === 'attention');

  const getAlertIcon = (alert: Alert) => {
    if (alert.type === 'credit_limit' && alert.metadata?.cardName) {
      return <CardBrandIcon cardName={alert.metadata.cardName} size={32} />;
    }
    return <AlertaIcon size={24} color={theme.text} />;
  };

  const renderAlertCard = (alert: Alert) => {
    const isUrgent = alert.priority === 'urgent';
    const borderColor = isUrgent ? '#ef4444' : '#f59e0b';

    return (
      <View
        key={alert.id}
        style={[
          styles.alertCard,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
            borderLeftWidth: 4,
            borderLeftColor: borderColor,
          },
        ]}
      >
        <View style={styles.alertHeader}>
          <View style={styles.alertIconContainer}>{getAlertIcon(alert)}</View>
          <View style={styles.alertInfo}>
            <Text
              style={[styles.alertTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {alert.title}
            </Text>
            <Text
              style={[styles.alertDescription, { color: theme.textSecondary }]}
            >
              {alert.description}
            </Text>
          </View>
          <View style={styles.alertAmount}>
            <Text style={[styles.amountValue, { color: borderColor }]}>
              {formatCurrency(alert.amount)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSection = (
    title: string,
    sectionAlerts: Alert[],
    color: string
  ) => {
    if (sectionAlerts.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIndicator, { backgroundColor: color }]} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {title}
          </Text>
          <View style={[styles.countBadge, { backgroundColor: color }]}>
            <Text style={styles.countText}>{sectionAlerts.length}</Text>
          </View>
        </View>
        {sectionAlerts.map(renderAlertCard)}
      </View>
    );
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
          Alertas e Pendencias
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
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
        ) : alerts.length > 0 ? (
          <>
            {renderSection('Urgente', urgentAlerts, '#ef4444')}
            {renderSection('Atencao', attentionAlerts, '#f59e0b')}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Tudo em ordem
            </Text>
            <Text
              style={[styles.emptyDescription, { color: theme.textSecondary }]}
            >
              Nenhum alerta ou pendencia no momento. Continue assim!
            </Text>
          </View>
        )}
      </ScrollView>
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
  loader: {
    marginTop: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#fff',
  },
  alertCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertIconContainer: {
    marginRight: 12,
  },
  alertInfo: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  alertDescription: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  alertAmount: {
    marginLeft: 12,
  },
  amountValue: {
    fontSize: 18,
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
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
