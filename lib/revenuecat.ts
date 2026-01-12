import Constants from 'expo-constants';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

const ENTITLEMENT_ID = 'Pocket';

function getRevenueCatApiKey(): string {
  const extra = Constants.expoConfig?.extra;

  if (!extra) {
    throw new Error(
      `❌ Constants.expoConfig.extra is undefined. Build configuration may be incorrect.`
    );
  }

  const apiKey = extra.revenueCatApiKey;

  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error(
      `❌ Environment variable "revenueCatApiKey" not found in app.config.js extra.\n` +
        `Available keys: ${Object.keys(extra).join(', ')}`
    );
  }

  return apiKey;
}

export function initializeRevenueCat(): void {
  try {
    const apiKey = getRevenueCatApiKey();

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({ apiKey });

    console.log('[RevenueCat] Initialized successfully');
  } catch (error) {
    console.error('[RevenueCat] Initialization error:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'revenuecat-init',
      },
    });
    throw error;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Error getting customer info:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'revenuecat-customer-info',
      },
    });
    throw error;
  }
}

export async function checkPremiumEntitlement(): Promise<boolean> {
  try {
    const customerInfo = await getCustomerInfo();
    const hasEntitlement =
      customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return hasEntitlement;
  } catch (error) {
    console.error('[RevenueCat] Error checking premium entitlement:', error);
    return false;
  }
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (error) {
    console.error('[RevenueCat] Error getting offerings:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'revenuecat-offerings',
      },
    });
    return null;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Error restoring purchases:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'revenuecat-restore',
      },
    });
    throw error;
  }
}

export async function loginRevenueCat(userId: string): Promise<CustomerInfo> {
  try {
    console.log('[RevenueCat] Logging in user:', userId);
    const { customerInfo } = await Purchases.logIn(userId);
    const hasPremium =
      customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    console.log('[RevenueCat] Login successful. Premium:', hasPremium);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Error logging in:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'revenuecat-login',
      },
    });
    throw error;
  }
}

export async function logoutRevenueCat(): Promise<CustomerInfo> {
  try {
    console.log('[RevenueCat] Logging out user');
    const customerInfo = await Purchases.logOut();
    console.log('[RevenueCat] Logout successful');
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Error logging out:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'revenuecat-logout',
      },
    });
    throw error;
  }
}

export async function purchasePackage(
  packageToPurchase: PurchasesPackage
): Promise<CustomerInfo> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Error purchasing package:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'revenuecat-purchase',
      },
    });
    throw error;
  }
}

export { ENTITLEMENT_ID };
export { Purchases };
