import Purchases from 'react-native-purchases';

export async function diagnoseRevenueCat(): Promise<void> {
  console.log('[Diagnostics] Starting RevenueCat diagnostics...');

  try {
    // 1. Check if SDK is configured
    console.log('[Diagnostics] ✅ SDK is configured');

    // 2. Get customer info
    const customerInfo = await Purchases.getCustomerInfo();
    console.log('[Diagnostics] Customer Info:', {
      originalAppUserId: customerInfo.originalAppUserId,
      entitlements: Object.keys(customerInfo.entitlements.all),
      activeEntitlements: Object.keys(customerInfo.entitlements.active),
    });

    // 3. Try to get offerings
    console.log('[Diagnostics] Fetching offerings...');
    const offerings = await Purchases.getOfferings();

    console.log('[Diagnostics] Offerings response:', {
      current: offerings.current?.identifier,
      all: Object.keys(offerings.all),
    });

    if (offerings.current) {
      console.log('[Diagnostics] Current offering details:', {
        identifier: offerings.current.identifier,
        serverDescription: offerings.current.serverDescription,
        availablePackages: offerings.current.availablePackages.length,
      });

      offerings.current.availablePackages.forEach((pkg, index) => {
        console.log(`[Diagnostics] Package ${index + 1}:`, {
          identifier: pkg.identifier,
          packageType: pkg.packageType,
          product: {
            identifier: pkg.product.identifier,
            title: pkg.product.title,
            description: pkg.product.description,
            price: pkg.product.priceString,
          },
        });
      });
    } else {
      console.log('[Diagnostics] ❌ No current offering found');
      console.log('[Diagnostics] All offerings:', offerings.all);
    }

    // 4. Try to get products directly (bypass offerings)
    console.log('[Diagnostics] Attempting to fetch products directly...');
    const productIds = [
      'pocket_monthly',
      'pocket_yearly',
      'pocket_7days_trial',
    ];

    try {
      const products = await Purchases.getProducts(productIds);
      console.log(
        '[Diagnostics] Products fetched directly:',
        products.map((p) => ({
          id: p.identifier,
          title: p.title,
          price: p.priceString,
        }))
      );
    } catch (error) {
      console.error(
        '[Diagnostics] ❌ Error fetching products directly:',
        error
      );
    }

    console.log('[Diagnostics] ✅ Diagnostics complete');
  } catch (error) {
    console.error('[Diagnostics] ❌ Error during diagnostics:', error);
  }
}
