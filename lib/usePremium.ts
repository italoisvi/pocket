import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkPremiumEntitlement, Purchases } from './revenuecat';
import type { CustomerInfo } from 'react-native-purchases';

const PREMIUM_STORAGE_KEY = '@pocket_is_premium';

export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  // Atualiza estado e persiste
  const updatePremiumStatus = async (status: boolean) => {
    setIsPremium(status);
    try {
      await AsyncStorage.setItem(PREMIUM_STORAGE_KEY, JSON.stringify(status));
    } catch (error) {
      console.error('[usePremium] Error saving premium status:', error);
    }
  };

  const checkEntitlement = async () => {
    try {
      const hasPremium = await checkPremiumEntitlement();
      await updatePremiumStatus(hasPremium);
    } catch (error) {
      console.error('[usePremium] Error checking entitlement:', error);
      // Em caso de erro, mantém o estado atual (não força false)
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Primeiro: carregar estado persistido (instantâneo)
    const loadPersistedStatus = async () => {
      try {
        const savedStatus = await AsyncStorage.getItem(PREMIUM_STORAGE_KEY);
        if (savedStatus !== null) {
          const parsed = JSON.parse(savedStatus);
          setIsPremium(parsed);
          console.log('[usePremium] Loaded persisted status:', parsed);
        }
      } catch (error) {
        console.error('[usePremium] Error loading persisted status:', error);
      }
      // Depois: verificar com RevenueCat em background
      checkEntitlement();
    };

    loadPersistedStatus();

    // Listener para atualizações do RevenueCat
    const customerInfoUpdateListener = async (info: CustomerInfo) => {
      const hasPremium = info.entitlements.active['Pocket'] !== undefined;
      await updatePremiumStatus(hasPremium);
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
