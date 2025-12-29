import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_PAYWALL_SHOWN_KEY = '@pocket_onboarding_paywall_shown';

export async function shouldShowOnboardingPaywall(
  userId: string
): Promise<boolean> {
  try {
    const key = `${ONBOARDING_PAYWALL_SHOWN_KEY}_${userId}`;
    const hasShown = await AsyncStorage.getItem(key);
    return hasShown === null;
  } catch (error) {
    console.error('[Onboarding] Error checking paywall status:', error);
    return false;
  }
}

export async function markOnboardingPaywallShown(
  userId: string
): Promise<void> {
  try {
    const key = `${ONBOARDING_PAYWALL_SHOWN_KEY}_${userId}`;
    await AsyncStorage.setItem(key, 'true');
  } catch (error) {
    console.error('[Onboarding] Error marking paywall as shown:', error);
  }
}
