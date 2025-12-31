import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configurar como as notificações serão exibidas
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('budget-alerts', {
      name: 'Alertas de Orçamento',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return true;
}

export async function scheduleBudgetNotification(
  categoryName: string,
  percentage: number,
  spent: number,
  limit: number
) {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log('Permissão de notificação negada');
    return;
  }

  let title = '';
  let body = '';

  if (percentage >= 100) {
    title = `⚠️ Orçamento de ${categoryName} excedido!`;
    body = `Você gastou R$ ${spent.toFixed(2)} de R$ ${limit.toFixed(2)}`;
  } else if (percentage >= 90) {
    title = `🔴 90% do orçamento de ${categoryName}`;
    body = `Você já gastou R$ ${spent.toFixed(2)} de R$ ${limit.toFixed(2)}`;
  } else if (percentage >= 80) {
    title = `🟡 80% do orçamento de ${categoryName}`;
    body = `Você já gastou R$ ${spent.toFixed(2)} de R$ ${limit.toFixed(2)}`;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { categoryName, percentage, spent, limit },
    },
    trigger: null, // Enviar imediatamente
  });
}

export async function checkBudgetAndNotify(
  categoryName: string,
  spent: number,
  limit: number,
  notificationsEnabled: boolean,
  lastNotifiedPercentage: number = 0
) {
  if (!notificationsEnabled) return lastNotifiedPercentage;

  const percentage = (spent / limit) * 100;

  // Notificar apenas quando cruzar os limites pela primeira vez
  if (percentage >= 100 && lastNotifiedPercentage < 100) {
    await scheduleBudgetNotification(categoryName, percentage, spent, limit);
    return 100;
  } else if (percentage >= 90 && lastNotifiedPercentage < 90) {
    await scheduleBudgetNotification(categoryName, percentage, spent, limit);
    return 90;
  } else if (percentage >= 80 && lastNotifiedPercentage < 80) {
    await scheduleBudgetNotification(categoryName, percentage, spent, limit);
    return 80;
  }

  return lastNotifiedPercentage;
}
