import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkPremiumEntitlement, Purchases } from './revenuecat';
import { supabase } from './supabase';
import type { CustomerInfo } from 'react-native-purchases';

const PREMIUM_STORAGE_KEY = '@pocket_is_premium';

async function checkKiwifyAccess(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('kiwify_access_until')
      .eq('id', user.id)
      .single();

    if (profile?.kiwify_access_until) {
      const accessUntil = new Date(profile.kiwify_access_until);
      return accessUntil > new Date();
    }

    const { data: kiwifyPurchase } = await supabase
      .from('kiwify_purchases')
      .select('access_until')
      .eq('email', user.email.toLowerCase().trim())
      .eq('status', 'approved')
      .gt('access_until', new Date().toISOString())
      .order('access_until', { ascending: false })
      .limit(1)
      .single();

    if (kiwifyPurchase) {
      await supabase
        .from('profiles')
        .update({ kiwify_access_until: kiwifyPurchase.access_until })
        .eq('id', user.id);

      return true;
    }

    return false;
  } catch (error) {
    console.error('[usePremium] Error checking Kiwify access:', error);
    return false;
  }
}

export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

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
      const [revenueCatPremium, kiwifyAccess] = await Promise.all([
        checkPremiumEntitlement(),
        checkKiwifyAccess(),
      ]);
      const hasPremium = revenueCatPremium || kiwifyAccess;
      await updatePremiumStatus(hasPremium);
    } catch (error) {
      console.error('[usePremium] Error checking entitlement:', error);
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
