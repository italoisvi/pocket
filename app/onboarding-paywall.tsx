import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { CoroaIcon } from '@/components/CoroaIcon';
import { CheckIcon } from '@/components/CheckIcon';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { usePremium } from '@/lib/usePremium';
import { markOnboardingPaywallShown } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import {
  getOfferings,
  purchasePackage,
  ENTITLEMENT_ID,
} from '@/lib/revenuecat';
import type { PurchasesPackage } from 'react-native-purchases';

type PlanType = 'trial' | 'yearly' | 'monthly';

interface PlanData {
  id: PlanType;
  title: string;
  subtitle: string;
  price: string;
  period: string;
  highlighted: boolean;
  badge?: string;
  rcPackage?: PurchasesPackage;
}

export default function OnboardingPaywallScreen() {
  const { theme } = useTheme();
  const { refresh } = usePremium();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('yearly');
  const [purchasing, setPurchasing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanData[]>([
    {
      id: 'trial' as PlanType,
      title: '7 Dias Grátis',
      subtitle: 'Teste sem compromisso',
      price: 'Grátis',
      period: '7 dias',
      highlighted: false,
    },
    {
      id: 'yearly' as PlanType,
      title: 'Plano Anual',
      subtitle: 'Melhor custo-benefício',
      price: 'R$ 12,90',
      period: 'por mês',
      highlighted: true,
      badge: 'Mais Popular',
    },
    {
      id: 'monthly' as PlanType,
      title: 'Plano Mensal',
      subtitle: 'Flexibilidade total',
      price: 'R$ 14,90',
      period: 'por mês',
      highlighted: false,
    },
  ]);

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      const offering = await getOfferings();
      if (!offering) {
        console.warn('[OnboardingPaywall] No offerings available');
        setLoading(false);
        return;
      }

      const updatedPlans: PlanData[] = [];

      if (offering.availablePackages.length > 0) {
        offering.availablePackages.forEach((pkg) => {
          const product = pkg.product;
          const identifier = product.identifier.toLowerCase();

          if (identifier.includes('trial') || identifier.includes('intro')) {
            updatedPlans.push({
              id: 'trial',
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
            updatedPlans.push({
              id: 'yearly',
              title: 'Plano Anual',
              subtitle: 'Melhor custo-benefício',
              price: product.priceString,
              period: 'por ano',
              highlighted: true,
              badge: 'Mais Popular',
              rcPackage: pkg,
            });
          } else if (identifier.includes('monthly')) {
            updatedPlans.push({
              id: 'monthly',
              title: 'Plano Mensal',
              subtitle: 'Flexibilidade total',
              price: product.priceString,
              period: 'por mês',
              highlighted: false,
              rcPackage: pkg,
            });
          }
        });
      }

      if (updatedPlans.length > 0) {
        setPlans(updatedPlans);
      }
    } catch (error) {
      console.error('[OnboardingPaywall] Error loading offerings:', error);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    'Análises financeiras avançadas com IA',
    'Gráficos e relatórios detalhados',
    'Acesso ilimitado ao chat financeiro',
    'Suporte prioritário',
    'Sincronização em todos os dispositivos',
    'Exportação de dados',
  ];

  const handleSkip = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      await markOnboardingPaywallShown(user.id);
    }
    router.replace('/(tabs)/home');
  };

  const handleContinue = async () => {
    setPurchasing(true);
    try {
      const selectedPlanData = plans.find((p) => p.id === selectedPlan);

      if (!selectedPlanData?.rcPackage) {
        Alert.alert(
          'Erro',
          'Plano selecionado não disponível. Tente novamente.'
        );
        setPurchasing(false);
        return;
      }

      const customerInfo = await purchasePackage(selectedPlanData.rcPackage);

      const hasEntitlement =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

      if (hasEntitlement) {
        await refresh();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          await markOnboardingPaywallShown(user.id);
        }
        router.replace('/(tabs)/home');
      } else {
        Alert.alert(
          'Erro',
          'Não foi possível ativar sua assinatura. Tente novamente.'
        );
      }
    } catch (error: any) {
      console.error('[OnboardingPaywall] Error:', error);

      if (error.userCancelled) {
        console.log('[OnboardingPaywall] User cancelled purchase');
      } else {
        Alert.alert(
          'Erro',
          'Não foi possível processar sua solicitação. Tente novamente.'
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.background, justifyContent: 'center' },
        ]}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={{ backgroundColor: theme.background }}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={[styles.skipButtonText, { color: theme.text }]}>
              Pular
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(theme.background === '#000'),
            ]}
          >
            <CoroaIcon size={48} color={theme.text} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>
            Desbloqueie Todo o Potencial do Pocket
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Gerencie suas finanças de forma inteligente e eficiente
          </Text>
        </View>

        <View style={styles.plansContainer}>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                {
                  backgroundColor: theme.card,
                  borderColor:
                    selectedPlan === plan.id ? theme.primary : theme.cardBorder,
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
                  style={[styles.badge, { backgroundColor: theme.primary }]}
                >
                  <Text style={[styles.badgeText, { color: theme.background }]}>
                    {plan.badge}
                  </Text>
                </View>
              )}
              <View style={styles.planHeader}>
                <View style={styles.planTitleContainer}>
                  <Text style={[styles.planTitle, { color: theme.text }]}>
                    {plan.title}
                  </Text>
                  <Text
                    style={[
                      styles.planSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {plan.subtitle}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioButton,
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
              <View style={styles.planPricing}>
                <Text style={[styles.planPrice, { color: theme.text }]}>
                  {plan.price}
                </Text>
                <Text
                  style={[styles.planPeriod, { color: theme.textSecondary }]}
                >
                  {plan.period}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.featuresContainer}>
          <Text style={[styles.featuresTitle, { color: theme.text }]}>
            Recursos Incluídos:
          </Text>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <CheckIcon size={20} color={theme.primary} />
              <Text style={[styles.featureText, { color: theme.text }]}>
                {feature}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.disclaimer}>
          <Text style={[styles.disclaimerText, { color: theme.textSecondary }]}>
            Cancele a qualquer momento. Sem compromisso.
          </Text>
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            {
              backgroundColor: theme.primary,
            },
          ]}
          onPress={handleContinue}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <Text
              style={[styles.continueButtonText, { color: theme.background }]}
            >
              Continuar
            </Text>
          )}
        </TouchableOpacity>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>
          Ao continuar, você concorda com nossos Termos de Uso
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
  },
  title: {
    fontSize: 22,
    fontFamily: 'DMSans-Bold',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  plansContainer: {
    marginBottom: 32,
    gap: 12,
  },
  planCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planTitleContainer: {
    flex: 1,
  },
  planTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    marginBottom: 4,
  },
  planSubtitle: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  planPrice: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
  },
  planPeriod: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  featuresContainer: {
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  featureText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    flex: 1,
  },
  disclaimer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  disclaimerText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  continueButton: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  continueButtonText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  footerText: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
});
