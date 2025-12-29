import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { usePremium } from '@/lib/usePremium';
import { restorePurchases } from '@/lib/revenuecat';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

export default function SubscriptionScreen() {
  const { theme } = useTheme();
  const { isPremium, loading: premiumLoading, refresh } = usePremium();
  const [showingPaywall, setShowingPaywall] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleShowPaywall = async () => {
    try {
      setShowingPaywall(true);
      const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: 'Pocket',
      });

      switch (paywallResult) {
        case PAYWALL_RESULT.NOT_PRESENTED:
        case PAYWALL_RESULT.ERROR:
        case PAYWALL_RESULT.CANCELLED:
          console.log('[Subscription] Paywall dismissed or error occurred');
          break;
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED:
          Alert.alert(
            'Sucesso!',
            'Sua assinatura foi ativada. Aproveite todos os recursos premium!'
          );
          await refresh();
          break;
      }
    } catch (error) {
      console.error('[Subscription] Error showing paywall:', error);
      Alert.alert(
        'Erro',
        'Não foi possível carregar as opções de assinatura. Tente novamente.'
      );
    } finally {
      setShowingPaywall(false);
    }
  };

  const handleRestorePurchases = async () => {
    setRestoring(true);
    try {
      const customerInfo = await restorePurchases();
      const hasEntitlement =
        customerInfo.entitlements.active['Pocket'] !== undefined;

      if (hasEntitlement) {
        Alert.alert('Sucesso!', 'Sua assinatura foi restaurada com sucesso!');
        await refresh();
      } else {
        Alert.alert(
          'Nenhuma assinatura encontrada',
          'Não encontramos nenhuma assinatura ativa vinculada à sua conta.'
        );
      }
    } catch (error) {
      console.error('[Subscription] Error restoring purchases:', error);
      Alert.alert(
        'Erro',
        'Não foi possível restaurar suas compras. Tente novamente.'
      );
    } finally {
      setRestoring(false);
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
        <Text style={[styles.title, { color: theme.text }]}>Assinatura</Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <View style={styles.content}>
        {premiumLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : isPremium ? (
          <View style={styles.premiumContainer}>
            <Text style={[styles.premiumTitle, { color: theme.text }]}>
              Você é Premium! 🎉
            </Text>
            <Text
              style={[
                styles.premiumDescription,
                { color: theme.textSecondary },
              ]}
            >
              Você tem acesso a todos os recursos premium do Pocket.
            </Text>
            <TouchableOpacity
              style={[
                styles.manageButton,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={() => router.push('/customer-center')}
            >
              <Text style={[styles.manageButtonText, { color: theme.text }]}>
                Gerenciar Assinatura
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.nonPremiumContainer}>
            <Text style={[styles.nonPremiumTitle, { color: theme.text }]}>
              Desbloqueie o Pocket Premium
            </Text>
            <Text
              style={[
                styles.nonPremiumDescription,
                { color: theme.textSecondary },
              ]}
            >
              Acesse recursos exclusivos com uma assinatura premium:
            </Text>

            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <Text style={[styles.featureBullet, { color: theme.primary }]}>
                  •
                </Text>
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Análises financeiras avançadas com IA
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={[styles.featureBullet, { color: theme.primary }]}>
                  •
                </Text>
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Gráficos e relatórios detalhados
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={[styles.featureBullet, { color: theme.primary }]}>
                  •
                </Text>
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Acesso ilimitado ao chat financeiro
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={[styles.featureBullet, { color: theme.primary }]}>
                  •
                </Text>
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Suporte prioritário
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.subscribeButton,
                { backgroundColor: theme.primary },
              ]}
              onPress={handleShowPaywall}
              disabled={showingPaywall}
            >
              {showingPaywall ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.subscribeButtonText}>
                  Ver Planos de Assinatura
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestorePurchases}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <Text
                  style={[
                    styles.restoreButtonText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Restaurar Compras
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
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
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  premiumTitle: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  premiumDescription: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 24,
  },
  manageButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderWidth: 2,
  },
  manageButtonText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  nonPremiumContainer: {
    flex: 1,
  },
  nonPremiumTitle: {
    fontSize: 28,
    fontFamily: 'CormorantGaramond-Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  nonPremiumDescription: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginBottom: 32,
  },
  featuresList: {
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  featureBullet: {
    fontSize: 24,
    marginRight: 12,
    marginTop: -4,
  },
  featureText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    flex: 1,
  },
  subscribeButton: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  subscribeButtonText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#fff',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
});
