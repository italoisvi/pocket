export default {
  expo: {
    name: 'Pocket',
    slug: 'pocket',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: 'pocket',
    splash: {
      image: './assets/images/Pocket.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.gladius.pocket',
      scheme: 'pocket',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          'O Pocket precisa da câmera para escanear seus comprovantes.',
        NSPhotoLibraryUsageDescription:
          'O Pocket precisa acessar suas fotos para ler comprovantes salvos.',
        UIViewControllerBasedStatusBarAppearance: true,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'com.gladius.pocket',
      scheme: 'pocket',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'pocket',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      [
        'expo-router',
        {
          origin: 'pocket://',
        },
      ],
      '@sentry/react-native/expo',
    ],
    extra: {
      eas: {
        projectId: '3f8676c7-50be-4b5e-a3a0-c49dde31197d',
      },
      // Expor variáveis de ambiente para o runtime (funciona em builds release)
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      openaiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
      sentryDsn: process.env.SENTRY_DSN,
    },
  },
};
