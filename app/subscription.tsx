import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { CheckIcon } from '@/components/CheckIcon';
import { CoroaIcon } from '@/components/CoroaIcon';
import { usePremium } from '@/lib/usePremium';
import {
  restorePurchases,
  getOfferings,
  purchasePackage,
  ENTITLEMENT_ID,
} from '@/lib/revenuecat';
import { getCardShadowStyle } from '@/lib/cardStyles';
import type { PurchasesPackage } from 'react-native-purchases';

interface PlanData {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  period: string;
  highlighted: boolean;
  badge?: string;
  rcPackage: PurchasesPackage;
}

export default function SubscriptionScreen() {
  const { theme } = useTheme();
  const { isPremium, loading: premiumLoading, refresh } = usePremium();
  const [showingPaywall, setShowingPaywall] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const handleShowPaywall = async () => {
    try {
      setLoadingPlans(true);

      const offering = await getOfferings();

      if (!offering || offering.availablePackages.length === 0) {
        Alert.alert(
          'Planos em Breve',
          'Os planos de assinatura estão sendo configurados e estarão disponíveis em breve. Por favor, tente novamente mais tarde.'
        );
        return;
      }

      const loadedPlans: PlanData[] = [];

      offering.availablePackages.forEach((pkg) => {
        const product = pkg.product;
        const identifier = product.identifier.toLowerCase();

        if (identifier.includes('trial') || identifier.includes('intro')) {
          loadedPlans.push({
            id: pkg.identifier,
            title: '7 Dias Grátis',
            subtitle: 'Teste sem compromisso',
            price: product.priceString,
            period: '7 dias',
            highlighted: false,
            rcPackage: pkg,
          });
        } else if (
          identifier.includes('yearly') ||
          identifier.includes('annual')
        ) {
          loadedPlans.push({
            id: pkg.identifier,
            title: 'Plano Anual',
            subtitle: 'Melhor custo-benefício',
            price: product.priceString,
            period: 'por ano',
            highlighted: true,
            badge: 'Mais Popular',
            rcPackage: pkg,
          });
        } else if (identifier.includes('monthly')) {
          loadedPlans.push({
            id: pkg.identifier,
            title: 'Plano Mensal',
            subtitle: 'Flexibilidade total',
            price: product.priceString,
            period: 'por mês',
            highlighted: false,
            rcPackage: pkg,
          });
        }
      });

      setPlans(loadedPlans);
      if (loadedPlans.length > 0) {
        const defaultPlan =
          loadedPlans.find((p) => p.highlighted) || loadedPlans[0];
        setSelectedPlan(defaultPlan.id);
        setShowingPaywall(true);
      }
    } catch (error) {
      console.error('[Subscription] Error loading offerings:', error);
      Alert.alert(
        'Erro',
        'Não foi possível carregar as opções de assinatura. Tente novamente.'
      );
    } finally {
      setLoadingPlans(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPlan) return;

    const planToPurchase = plans.find((p) => p.id === selectedPlan);
    if (!planToPurchase) return;

    setPurchasing(true);
    try {
      const customerInfo = await purchasePackage(planToPurchase.rcPackage);
      const hasEntitlement =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

      if (hasEntitlement) {
        setShowingPaywall(false);
        Alert.alert(
          'Sucesso!',
          'Sua assinatura foi ativada. Aproveite todos os recursos premium!'
        );
        await refresh();
      } else {
        Alert.alert(
          'Erro',
          'Não foi possível ativar sua assinatura. Tente novamente.'
        );
      }
    } catch (error: any) {
      console.error('[Subscription] Error purchasing:', error);
      if (!error.userCancelled) {
        Alert.alert(
          'Erro',
          'Não foi possível processar sua compra. Tente novamente.'
        );
      }
    } finally {
      setPurchasing(false);
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
                  Open Finance - Conexão com seus bancos
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={[styles.featureBullet, { color: theme.primary }]}>
                  •
                </Text>
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Walts - Assistente financeiro com IA
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={[styles.featureBullet, { color: theme.primary }]}>
                  •
                </Text>
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Raio-X Financeiro - Análises avançadas
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
            </View>

            <TouchableOpacity
              style={[
                styles.subscribeButton,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={handleShowPaywall}
              disabled={loadingPlans}
            >
              {loadingPlans ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Text
                  style={[styles.subscribeButtonText, { color: theme.text }]}
                >
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

      <Modal
        visible={showingPaywall}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowingPaywall(false)}
      >
        <View
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
        >
          <SafeAreaView
            edges={['top']}
            style={{ backgroundColor: theme.background }}
          />
          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalIconContainer,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(theme.background === '#000'),
                ]}
              >
                <CoroaIcon size={48} color={theme.text} />
              </View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Desbloqueie Todo o Potencial do Pocket
              </Text>
              <Text
                style={[styles.modalSubtitle, { color: theme.textSecondary }]}
              >
                Gerencie suas finanças de forma inteligente e eficiente
              </Text>
            </View>

            <View style={styles.modalPlansContainer}>
              {plans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    styles.modalPlanCard,
                    {
                      backgroundColor: theme.card,
                      borderColor:
                        selectedPlan === plan.id
                          ? theme.primary
                          : theme.cardBorder,
                    },
                    plan.highlighted && {
                      borderColor: theme.primary,
                    },
                    getCardShadowStyle(theme.background === '#000'),
                  ]}
                  onPress={() => setSelectedPlan(plan.id)}
                >
                  {plan.badge && (
                    <View
                      style={[
                        styles.modalBadge,
                        { backgroundColor: theme.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalBadgeText,
                          { color: theme.background },
                        ]}
                      >
                        {plan.badge}
                      </Text>
                    </View>
                  )}
                  <View style={styles.modalPlanHeader}>
                    <View style={styles.modalPlanTitleContainer}>
                      <Text
                        style={[styles.modalPlanTitle, { color: theme.text }]}
                      >
                        {plan.title}
                      </Text>
                      <Text
                        style={[
                          styles.modalPlanSubtitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {plan.subtitle}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.modalRadioButton,
                        {
                          borderColor:
                            selectedPlan === plan.id
                              ? theme.primary
                              : theme.cardBorder,
                          backgroundColor:
                            selectedPlan === plan.id
                              ? theme.primary
                              : 'transparent',
                        },
                      ]}
                    >
                      {selectedPlan === plan.id && (
                        <CheckIcon size={16} color={theme.background} />
                      )}
                    </View>
                  </View>
                  <View style={styles.modalPlanPricing}>
                    <Text
                      style={[styles.modalPlanPrice, { color: theme.text }]}
                    >
                      {plan.price}
                    </Text>
                    <Text
                      style={[
                        styles.modalPlanPeriod,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {plan.period}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalFeaturesContainer}>
              <Text style={[styles.modalFeaturesTitle, { color: theme.text }]}>
                Recursos Premium:
              </Text>
              {[
                'Open Finance - Conexão com seus bancos',
                'Walts - Assistente financeiro com IA',
                'Raio-X Financeiro - Análises avançadas',
                'Gráficos e relatórios detalhados',
                'Sincronização em todos os dispositivos',
                'Suporte prioritário',
              ].map((feature, index) => (
                <View key={index} style={styles.modalFeatureItem}>
                  <CheckIcon size={20} color={theme.primary} />
                  <Text
                    style={[styles.modalFeatureText, { color: theme.text }]}
                  >
                    {feature}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.modalDisclaimer}>
              <Text
                style={[
                  styles.modalDisclaimerText,
                  { color: theme.textSecondary },
                ]}
              >
                Cancele a qualquer momento. Sem compromisso.
              </Text>
              <View style={styles.modalLinks}>
                <TouchableOpacity
                  onPress={() => {
                    setShowingPaywall(false);
                    router.push('/termos-uso');
                  }}
                >
                  <Text
                    style={[styles.modalLinkText, { color: theme.primary }]}
                  >
                    Termos de Uso
                  </Text>
                </TouchableOpacity>
                <Text
                  style={[
                    styles.modalLinkSeparator,
                    { color: theme.textSecondary },
                  ]}
                >
                  {' • '}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowingPaywall(false);
                    router.push('/politica-privacidade');
                  }}
                >
                  <Text
                    style={[styles.modalLinkText, { color: theme.primary }]}
                  >
                    Política de Privacidade
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <SafeAreaView edges={['bottom']} style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.modalContinueButton,
                {
                  backgroundColor: theme.primary,
                },
              ]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <Text
                  style={[
                    styles.modalContinueButtonText,
                    { color: theme.background },
                  ]}
                >
                  Continuar
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowingPaywall(false)}
              disabled={purchasing}
            >
              <Text
                style={[
                  styles.modalCancelButtonText,
                  { color: theme.textSecondary },
                ]}
              >
                Cancelar
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
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
    borderWidth: 2,
  },
  subscribeButtonText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  modalContainer: {
    flex: 1,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  modalIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
  },
  modalTitle: {
    fontSize: 28,
    fontFamily: 'CormorantGaramond-Bold',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  modalSubtitle: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  modalPlansContainer: {
    marginBottom: 32,
    gap: 12,
  },
  modalPlanCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    position: 'relative',
  },
  modalBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  modalBadgeText: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  modalPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalPlanTitleContainer: {
    flex: 1,
  },
  modalPlanTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 4,
  },
  modalPlanSubtitle: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  modalRadioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPlanPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  modalPlanPrice: {
    fontSize: 32,
    fontFamily: 'CormorantGaramond-Bold',
  },
  modalPlanPeriod: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  modalFeaturesContainer: {
    marginBottom: 24,
  },
  modalFeaturesTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 16,
  },
  modalFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  modalFeatureText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    flex: 1,
  },
  modalDisclaimer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  modalDisclaimerText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLinkText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    textDecorationLine: 'underline',
  },
  modalLinkSeparator: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalContinueButton: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalContinueButtonText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  modalCancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
});
