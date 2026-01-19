import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { CheckIcon } from '@/components/CheckIcon';
import { CoroaIcon } from '@/components/CoroaIcon';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  ENTITLEMENT_ID,
} from '@/lib/revenuecat';
import { getCardShadowStyle } from '@/lib/cardStyles';
import type { PurchasesPackage } from 'react-native-purchases';

type PlanType = 'monthly' | 'annual';

type PlanData = {
  id: string;
  type: PlanType;
  price: string;
  pricePerMonth?: string;
  rcPackage: PurchasesPackage;
};

type PaywallModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
};

const PREMIUM_FEATURES = [
  'Open Finance - Conexão com seus bancos',
  'Walts - Assistente financeiro com IA',
  'Raio-X Financeiro - Análises avançadas',
  'Gráficos e relatórios detalhados',
];

export function PaywallModal({
  visible,
  onClose,
  onSuccess,
  title = 'Pocket Premium',
  subtitle = 'Gerencie suas finanças de forma inteligente',
}: PaywallModalProps) {
  const { theme } = useTheme();
  const [plans, setPlans] = useState<{ monthly?: PlanData; annual?: PlanData }>(
    {}
  );
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPlans();
    }
  }, [visible]);

  const loadPlans = async () => {
    try {
      setLoading(true);

      const offering = await getOfferings();

      if (!offering || offering.availablePackages.length === 0) {
        return;
      }

      const loadedPlans: { monthly?: PlanData; annual?: PlanData } = {};

      offering.availablePackages.forEach((pkg) => {
        const product = pkg.product;
        const identifier = product.identifier.toLowerCase();

        if (identifier.includes('monthly') || identifier.includes('mensal')) {
          loadedPlans.monthly = {
            id: pkg.identifier,
            type: 'monthly',
            price: product.priceString,
            rcPackage: pkg,
          };
        } else if (
          identifier.includes('yearly') ||
          identifier.includes('annual') ||
          identifier.includes('anual')
        ) {
          // Calcular preço por mês para o plano anual
          const yearlyPrice = product.price;
          const monthlyEquivalent = yearlyPrice / 12;

          loadedPlans.annual = {
            id: pkg.identifier,
            type: 'annual',
            price: product.priceString,
            pricePerMonth: `R$ ${monthlyEquivalent.toFixed(2).replace('.', ',')}`,
            rcPackage: pkg,
          };
        }
      });

      setPlans(loadedPlans);
    } catch (error) {
      console.error('[PaywallModal] Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    const planToPurchase =
      selectedPlan === 'monthly' ? plans.monthly : plans.annual;
    if (!planToPurchase) return;

    setPurchasing(true);
    try {
      const customerInfo = await purchasePackage(planToPurchase.rcPackage);
      const hasEntitlement =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

      if (hasEntitlement) {
        onClose();
        onSuccess?.();
      }
    } catch (error: any) {
      console.error('[PaywallModal] Error purchasing:', error);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const customerInfo = await restorePurchases();
      const hasEntitlement =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

      if (hasEntitlement) {
        onClose();
        onSuccess?.();
      }
    } catch (error) {
      console.error('[PaywallModal] Error restoring:', error);
    } finally {
      setRestoring(false);
    }
  };

  const currentPlan = selectedPlan === 'monthly' ? plans.monthly : plans.annual;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
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
          {/* Header com ícone */}
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
              <CoroaIcon size={48} color={theme.primary} />
            </View>
          </View>

          {/* Destaque: 7 Dias Grátis */}
          <View style={styles.trialHighlight}>
            <Text style={[styles.trialTitle, { color: theme.text }]}>
              7 Dias Grátis
            </Text>
            <Text
              style={[styles.trialSubtitle, { color: theme.textSecondary }]}
            >
              Teste todos os recursos premium sem compromisso
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : (
            <>
              {/* Toggle Mensal/Anual */}
              <View
                style={[
                  styles.toggleContainer,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    selectedPlan === 'monthly' && {
                      backgroundColor: theme.primary,
                    },
                  ]}
                  onPress={() => setSelectedPlan('monthly')}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      {
                        color:
                          selectedPlan === 'monthly'
                            ? theme.background
                            : theme.text,
                      },
                    ]}
                  >
                    Mensal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    selectedPlan === 'annual' && {
                      backgroundColor: theme.primary,
                    },
                  ]}
                  onPress={() => setSelectedPlan('annual')}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      {
                        color:
                          selectedPlan === 'annual'
                            ? theme.background
                            : theme.text,
                      },
                    ]}
                  >
                    Anual
                  </Text>
                  {selectedPlan === 'annual' && (
                    <View
                      style={[
                        styles.saveBadge,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <Text
                        style={[styles.saveBadgeText, { color: theme.primary }]}
                      >
                        -40%
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Preço do plano selecionado */}
              <View style={styles.priceContainer}>
                <Text
                  style={[
                    styles.afterTrialText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Após o período de teste:
                </Text>
                <Text style={[styles.priceText, { color: theme.text }]}>
                  {currentPlan?.price || '...'}
                  <Text
                    style={[styles.pricePeriod, { color: theme.textSecondary }]}
                  >
                    {selectedPlan === 'monthly' ? '/mês' : '/ano'}
                  </Text>
                </Text>
                {selectedPlan === 'annual' && currentPlan?.pricePerMonth && (
                  <Text
                    style={[
                      styles.priceEquivalent,
                      { color: theme.textSecondary },
                    ]}
                  >
                    equivale a {currentPlan.pricePerMonth}/mês
                  </Text>
                )}
              </View>

              {/* Lista de recursos */}
              <View style={styles.featuresContainer}>
                {PREMIUM_FEATURES.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <CheckIcon size={20} color={theme.primary} />
                    <Text style={[styles.featureText, { color: theme.text }]}>
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Disclaimer */}
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
                  onClose();
                  router.push('/termos-uso');
                }}
              >
                <Text style={[styles.modalLinkText, { color: theme.primary }]}>
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
                  onClose();
                  router.push('/politica-privacidade');
                }}
              >
                <Text style={[styles.modalLinkText, { color: theme.primary }]}>
                  Política de Privacidade
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Footer com botões */}
        <SafeAreaView edges={['bottom']} style={styles.modalFooter}>
          <TouchableOpacity
            style={[
              styles.mainButton,
              {
                backgroundColor: theme.primary,
              },
            ]}
            onPress={handlePurchase}
            disabled={purchasing || loading || !currentPlan}
          >
            {purchasing ? (
              <ActivityIndicator size="small" color={theme.background} />
            ) : (
              <Text
                style={[styles.mainButtonText, { color: theme.background }]}
              >
                Começar Teste Grátis
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
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

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            disabled={purchasing}
          >
            <Text
              style={[styles.closeButtonText, { color: theme.textSecondary }]}
            >
              Agora não
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  modalIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  trialHighlight: {
    alignItems: 'center',
    marginBottom: 32,
  },
  trialTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  trialSubtitle: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    marginBottom: 24,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  toggleText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  saveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  saveBadgeText: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  afterTrialText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    marginBottom: 8,
  },
  priceText: {
    fontSize: 40,
    fontFamily: 'DMSans-Bold',
  },
  pricePeriod: {
    fontSize: 20,
    fontFamily: 'DMSans-Regular',
  },
  priceEquivalent: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    marginTop: 4,
  },
  featuresContainer: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  featureText: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    flex: 1,
  },
  modalDisclaimer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  modalDisclaimerText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
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
    fontFamily: 'DMSans-Regular',
    textDecorationLine: 'underline',
  },
  modalLinkSeparator: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  mainButton: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  mainButtonText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  restoreButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  restoreButtonText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
});
