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
        // --- ADICIONEI AQUI AS PERMISSÕES QUE FALTAVAM ---
        NSCameraUsageDescription: "O Pocket precisa da câmera para escanear seus comprovantes.",
        NSPhotoLibraryUsageDescription: "O Pocket precisa acessar suas fotos para ler comprovantes salvos.",
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
    ],
    extra: {
      eas: {
        projectId: '237c2752-d411-45d3-9f97-6fa641a5430a',
      },
      // Expor variáveis de ambiente para o runtime (funciona em builds release)
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      openaiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
    },
  },
};