import { useEffect, useState } from 'react';
import { checkPremiumEntitlement, Purchases } from './revenuecat';
import type { CustomerInfo } from 'react-native-purchases';

export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkEntitlement = async () => {
    setLoading(true);
    try {
      const hasPremium = await checkPremiumEntitlement();
      setIsPremium(hasPremium);
    } catch (error) {
      console.error('[usePremium] Error checking entitlement:', error);
      setIsPremium(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkEntitlement();

    const customerInfoUpdateListener = (info: CustomerInfo) => {
      const hasPremium = info.entitlements.active['Pocket'] !== undefined;
      setIsPremium(hasPremium);
    };

    Purchases.addCustomerInfoUpdateListener(customerInfoUpdateListener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(customerInfoUpdateListener);
    };
  }, []);

  return {
    isPremium,
    loading,
    refresh: checkEntitlement,
  };
}
