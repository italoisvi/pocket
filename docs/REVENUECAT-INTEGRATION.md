# RevenueCat Integration Guide

This document describes the complete RevenueCat SDK integration in the Pocket app, including subscription management, paywall presentation, and customer center support.

## Overview

The Pocket app now includes full RevenueCat integration to support premium subscriptions with the following features:

- **Subscription Management**: Monthly, Yearly, and Lifetime offerings
- **Paywall Presentation**: Native RevenueCat paywall UI
- **Customer Center**: Self-service subscription management
- **Entitlement Checking**: Real-time premium status monitoring
- **Purchase Restoration**: Support for restoring previous purchases

## Architecture

### Files Created/Modified

#### New Files

1. **[lib/revenuecat.ts](../lib/revenuecat.ts)** - Core RevenueCat configuration and utilities
2. **[lib/usePremium.ts](../lib/usePremium.ts)** - React hook for premium entitlement checking
3. **[app/subscription.tsx](../app/subscription.tsx)** - Main subscription management screen
4. **[app/customer-center.tsx](../app/customer-center.tsx)** - Customer center screen
5. **[components/CoroaIcon.tsx](../components/CoroaIcon.tsx)** - Crown icon for premium features

#### Modified Files

1. **[app/_layout.tsx](../app/_layout.tsx)** - Added RevenueCat initialization and screen registration
2. **[app/(tabs)/settings.tsx](../app/(tabs)/settings.tsx)** - Added premium subscription button
3. **[app.config.js](../app.config.js)** - Added RevenueCat API key configuration
4. **[.env](.env)** - Added RevenueCat API key environment variable

### Configuration

#### Environment Variables

Add to your `.env` file:

```env
EXPO_PUBLIC_REVENUECAT_API_KEY=your_api_key_here
```

The current test API key is configured as: `test_vICdjLMlpFUqDYCkzItmxJZLlJv`

#### Entitlement Configuration

The entitlement identifier used throughout the app is: `Pocket`

This must match the entitlement configured in the RevenueCat dashboard.

## Implementation Details

### 1. SDK Initialization

RevenueCat is initialized at app startup in [app/_layout.tsx](../app/_layout.tsx:39-44):

```typescript
import { initializeRevenueCat } from '@/lib/revenuecat';

// Initialize RevenueCat
try {
  initializeRevenueCat();
} catch (error) {
  console.error('[RootLayout] RevenueCat initialization failed:', error);
}
```

### 2. Core Functions

The [lib/revenuecat.ts](../lib/revenuecat.ts) module exports the following utilities:

- `initializeRevenueCat()` - Initializes the SDK with the API key
- `getCustomerInfo()` - Retrieves current customer info
- `checkPremiumEntitlement()` - Checks if user has active premium entitlement
- `getOfferings()` - Fetches available subscription offerings
- `restorePurchases()` - Restores previous purchases
- `Purchases` - Re-exported Purchases SDK for direct access

### 3. Premium Status Hook

The `usePremium()` hook provides reactive premium status:

```typescript
import { usePremium } from '@/lib/usePremium';

function MyComponent() {
  const { isPremium, loading, refresh } = usePremium();

  if (loading) return <Loading />;

  return isPremium ? <PremiumFeature /> : <UpgradePrompt />;
}
```

The hook:
- Automatically checks entitlement on mount
- Listens for customer info updates
- Provides a `refresh()` method to manually re-check

### 4. Subscription Screen

The [app/subscription.tsx](../app/subscription.tsx) screen handles:

- Displaying premium status
- Presenting the RevenueCat paywall
- Restoring purchases
- Navigation to customer center (for premium users)

Key features:
- Shows different UI for premium vs. non-premium users
- Lists premium features with bullet points
- Handles paywall presentation with proper result handling
- Provides restore purchases functionality

### 5. Customer Center

The [app/customer-center.tsx](../app/customer-center.tsx) screen:

- Presents the RevenueCat Customer Center
- Allows users to manage their subscriptions
- Automatically navigates back after dismissal

### 6. Settings Integration

The settings screen shows a prominent subscription button:

- Displays "Assinar Premium" for non-premium users
- Displays "Premium Ativo" with highlighted styling for premium users
- Uses crown icon to indicate premium status
- Routes to subscription screen when tapped

## Product Configuration

The app is configured to support three subscription types:

1. **Monthly** (`monthly`) - Recurring monthly subscription
2. **Yearly** (`yearly`) - Recurring annual subscription
3. **Lifetime** (`lifetime`) - One-time purchase

These must be configured in the RevenueCat dashboard and associated with the `Pocket` entitlement.

## Paywall Presentation

The paywall is presented using RevenueCat's native UI:

```typescript
const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({
  requiredEntitlementIdentifier: 'Pocket',
});
```

The paywall result is handled with proper switch cases:

- `NOT_PRESENTED` - User already has entitlement
- `ERROR` - Error occurred
- `CANCELLED` - User dismissed the paywall
- `PURCHASED` - User completed purchase
- `RESTORED` - User restored previous purchase

## Error Handling

All RevenueCat operations include:

- Try-catch blocks
- Console logging for debugging
- Sentry error tracking for production monitoring
- User-friendly error alerts

Example:

```typescript
try {
  const customerInfo = await restorePurchases();
  // Handle success
} catch (error) {
  console.error('[Subscription] Error restoring purchases:', error);
  Sentry.captureException(error, {
    tags: { component: 'revenuecat-restore' },
  });
  Alert.alert('Erro', 'Não foi possível restaurar suas compras.');
}
```

## Testing

### Test Mode

The current API key (`test_vICdjLMlpFUqDYCkzItmxJZLlJv`) is a test key that allows testing without real purchases.

### Testing Checklist

- [ ] Verify SDK initialization on app launch
- [ ] Check premium status updates in real-time
- [ ] Test paywall presentation
- [ ] Test purchase flow (sandbox)
- [ ] Test purchase restoration
- [ ] Test customer center navigation
- [ ] Verify entitlement checking works correctly
- [ ] Test error handling scenarios

## RevenueCat Dashboard Configuration

### Required Setup

1. **Products**: Create products for monthly, yearly, and lifetime subscriptions
2. **Entitlement**: Create "Pocket" entitlement
3. **Offerings**: Link products to entitlements
4. **Paywall**: Configure paywall design (optional, uses default if not configured)

### Platform Configuration

Make sure to configure both iOS and Android:

- **iOS**: Add App Store Connect integration
- **Android**: Add Google Play Console integration

## Navigation Flow

```
Settings Screen
    ├─> Subscription Screen
    │       ├─> RevenueCat Paywall (if not premium)
    │       └─> Customer Center (if premium)
    └─> Other settings
```

## Best Practices

1. **Always check entitlement status** before showing premium features
2. **Use the `usePremium` hook** for reactive updates
3. **Handle all paywall results** appropriately
4. **Provide restore purchases option** for users who reinstall
5. **Log errors to Sentry** for production monitoring
6. **Test thoroughly in sandbox** before production

## Troubleshooting

### Common Issues

**Issue**: SDK initialization fails
- **Solution**: Check that API key is correctly set in `.env` and `app.config.js`

**Issue**: Paywall doesn't show
- **Solution**: Verify offerings are configured in RevenueCat dashboard

**Issue**: Entitlement not updating
- **Solution**: Check that entitlement ID matches exactly ("Pocket")

**Issue**: Restore purchases not working
- **Solution**: Ensure user is signed in with same Apple ID / Google account

## Future Enhancements

Potential improvements for the subscription system:

1. Add analytics tracking for paywall events
2. Implement promotional offers
3. Add subscription cancellation flow
4. Create custom paywall UI (optional)
5. Add subscription reminder notifications
6. Implement referral system

## Resources

- [RevenueCat Documentation](https://www.revenuecat.com/docs)
- [RevenueCat SDK for React Native](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
- [Paywall Documentation](https://www.revenuecat.com/docs/tools/paywalls)
- [Customer Center Documentation](https://www.revenuecat.com/docs/tools/customer-center)
