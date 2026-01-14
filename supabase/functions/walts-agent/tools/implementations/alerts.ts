import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../../types.ts';

type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

type ToolContext = {
  userId: UserId;
  supabase: SupabaseClient;
};

type SpendingAlert = {
  id: string;
  category: string;
  threshold: number;
  notification_type: 'push' | 'email' | 'both';
  created_at: string;
  triggered_at?: string;
  triggered_amount?: number;
};

// ============================================================================
// create_spending_alert - Cria alerta de gasto
// ============================================================================

type CreateSpendingAlertParams = {
  category: string;
  threshold: number;
  notification_type?: 'push' | 'email' | 'both';
};

export async function createSpendingAlert(
  params: CreateSpendingAlertParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar alertas existentes do usuario
    const { data: existingMemory } = await supabase
      .from('walts_memory')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'spending_alerts')
      .single();

    const existingAlerts: SpendingAlert[] = existingMemory?.value?.alerts || [];

    // Verificar se ja existe alerta para esta categoria
    const existingAlert = existingAlerts.find(
      (a) => a.category === params.category
    );

    if (existingAlert) {
      // Atualizar alerta existente
      existingAlert.threshold = params.threshold;
      existingAlert.notification_type = params.notification_type || 'push';

      await supabase
        .from('walts_memory')
        .update({
          value: { alerts: existingAlerts },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('key', 'spending_alerts');

      return {
        success: true,
        data: {
          alert_id: existingAlert.id,
          category: params.category,
          threshold: params.threshold,
          notification_type: params.notification_type || 'push',
          updated: true,
          message: `Alerta de ${params.category} atualizado para R$ ${params.threshold.toFixed(2)}.`,
        },
      };
    }

    // Criar novo alerta
    const newAlert: SpendingAlert = {
      id: crypto.randomUUID(),
      category: params.category,
      threshold: params.threshold,
      notification_type: params.notification_type || 'push',
      created_at: new Date().toISOString(),
    };

    const updatedAlerts = [...existingAlerts, newAlert];

    // Salvar na memoria
    if (existingMemory) {
      await supabase
        .from('walts_memory')
        .update({
          value: { alerts: updatedAlerts },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('key', 'spending_alerts');
    } else {
      await supabase.from('walts_memory').insert({
        user_id: userId,
        memory_type: 'context',
        key: 'spending_alerts',
        value: { alerts: updatedAlerts },
        confidence: 1.0,
        source: 'user_defined',
      });
    }

    return {
      success: true,
      data: {
        alert_id: newAlert.id,
        category: params.category,
        threshold: params.threshold,
        notification_type: params.notification_type || 'push',
        message: `Alerta criado: vou te avisar quando ${params.category} passar de R$ ${params.threshold.toFixed(2)}.`,
      },
    };
  } catch (error) {
    console.error('[alerts.createSpendingAlert] Error:', error);
    return { success: false, error: 'Erro ao criar alerta' };
  }
}

// ============================================================================
// check_pending_alerts - Verifica alertas pendentes/disparados
// ============================================================================

export async function checkPendingAlerts(
  _params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    // Buscar alertas configurados
    const { data: alertsMemory } = await supabase
      .from('walts_memory')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'spending_alerts')
      .single();

    const alerts: SpendingAlert[] = alertsMemory?.value?.alerts || [];

    if (alerts.length === 0) {
      return {
        success: true,
        data: {
          alerts: [],
          triggered: [],
          message: 'Voce nao tem alertas configurados.',
        },
      };
    }

    // Buscar gastos do mes atual por categoria
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const today = now.toISOString().split('T')[0];

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount, category')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', today);

    // Calcular totais por categoria
    const byCategory: Record<string, number> = {};
    for (const e of expenses || []) {
      const cat = e.category || 'outros';
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    }

    // Verificar quais alertas foram disparados
    const triggered: Array<{
      alert: SpendingAlert;
      currentAmount: number;
      overAmount: number;
      percentOver: number;
    }> = [];

    const configuredAlerts = alerts.map((alert) => {
      const currentAmount = byCategory[alert.category] || 0;
      const isTriggered = currentAmount >= alert.threshold;
      const overAmount = Math.max(0, currentAmount - alert.threshold);
      const percentOver =
        alert.threshold > 0
          ? Math.round(
              ((currentAmount - alert.threshold) / alert.threshold) * 100
            )
          : 0;

      if (isTriggered) {
        triggered.push({
          alert,
          currentAmount,
          overAmount,
          percentOver,
        });
      }

      return {
        id: alert.id,
        category: alert.category,
        threshold: alert.threshold,
        currentAmount: Math.round(currentAmount * 100) / 100,
        isTriggered,
        remaining: Math.max(0, alert.threshold - currentAmount),
        percentUsed: Math.round((currentAmount / alert.threshold) * 100),
      };
    });

    // Gerar mensagens de alerta
    const alertMessages: string[] = [];
    for (const t of triggered) {
      alertMessages.push(
        `${t.alert.category}: R$ ${t.currentAmount.toFixed(2)} (${t.percentOver}% acima do limite de R$ ${t.alert.threshold.toFixed(2)})`
      );
    }

    return {
      success: true,
      data: {
        alerts: configuredAlerts,
        triggered: triggered.map((t) => ({
          category: t.alert.category,
          threshold: t.alert.threshold,
          currentAmount: t.currentAmount,
          overAmount: t.overAmount,
          percentOver: t.percentOver,
        })),
        summary: {
          totalAlerts: alerts.length,
          triggeredCount: triggered.length,
          withinLimitCount: alerts.length - triggered.length,
        },
        messages: alertMessages,
        hasTriggeredAlerts: triggered.length > 0,
      },
    };
  } catch (error) {
    console.error('[alerts.checkPendingAlerts] Error:', error);
    return { success: false, error: 'Erro ao verificar alertas' };
  }
}

// ============================================================================
// configure_debt_notifications - Configura notificacoes de divida
// ============================================================================

type ConfigureDebtNotificationsParams = {
  enabled: boolean;
};

export async function configureDebtNotifications(
  params: ConfigureDebtNotificationsParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        debt_notifications_enabled: params.enabled,
      })
      .eq('id', userId);

    if (error) {
      console.error('[alerts.configureDebtNotifications] DB Error:', error);
      return {
        success: false,
        error: `Erro ao configurar notificacoes: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        debt_notifications_enabled: params.enabled,
        message: params.enabled
          ? 'Alertas de divida ativados. Vou te avisar sobre faturas e pagamentos pendentes.'
          : 'Alertas de divida desativados.',
      },
    };
  } catch (error) {
    console.error('[alerts.configureDebtNotifications] Error:', error);
    return { success: false, error: 'Erro ao configurar notificacoes' };
  }
}
