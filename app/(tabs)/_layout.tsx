import { Tabs, router, usePathname } from 'expo-router';
import { CasaIcon } from '@/components/CasaIcon';
import { CasaIconFilled } from '@/components/CasaIconFilled';
import { DividirContaIcon } from '@/components/DividirContaIcon';
import { DividirContaIconFilled } from '@/components/DividirContaIconFilled';
import { OpenFinanceIcon } from '@/components/OpenFinanceIcon';
import { OpenFinanceIconFilled } from '@/components/OpenFinanceIconFilled';
import { CameraIcon } from '@/components/CameraIcon';
import { CameraIconFilled } from '@/components/CameraIconFilled';
import { ComenteMedicalIcon } from '@/components/ComenteMedicalIcon';
import { ComenteMedicalIconFilled } from '@/components/ComenteMedicalIconFilled';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const { theme } = useTheme();
  const pathname = usePathname();

  // Função para lidar com o clique na tab - reseta a navegação
  const handleTabPress = (tabRoute: string) => {
    return (e: any) => {
      // Se já está na tab, não faz nada (ou pode implementar scroll to top)
      if (pathname === `/${tabRoute}` || pathname === `/(tabs)/${tabRoute}`) {
        e.preventDefault();
        return;
      }
      // Navega para a tab resetando o histórico
      e.preventDefault();
      router.replace(`/(tabs)/${tabRoute}`);
    };
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f7c359',
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 0,
          height: 95,
          paddingBottom: 26,
          paddingTop: 16,
          shadowColor: theme.background === '#000' ? '#fff' : '#000',
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: theme.background === '#000' ? 0.15 : 0.1,
          shadowRadius: 4,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'DMSans-Medium',
          marginBottom: 6,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <CasaIconFilled size={size} color={color} />
            ) : (
              <CasaIcon size={size} color={color} />
            ),
        }}
        listeners={{
          tabPress: handleTabPress('home'),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Adicionar',
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <CameraIconFilled size={size} color={color} />
            ) : (
              <CameraIcon size={size} color={color} />
            ),
        }}
        listeners={{
          tabPress: handleTabPress('camera'),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Walts',
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <ComenteMedicalIconFilled size={size} color={color} />
            ) : (
              <ComenteMedicalIcon size={size} color={color} />
            ),
        }}
        listeners={{
          tabPress: handleTabPress('chat'),
        }}
      />
      <Tabs.Screen
        name="open-finance"
        options={{
          title: 'Open Finance',
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <OpenFinanceIconFilled size={size + 40} color={color} />
            ) : (
              <OpenFinanceIcon size={size + 40} color={color} />
            ),
        }}
        listeners={{
          tabPress: handleTabPress('open-finance'),
        }}
      />
      <Tabs.Screen
        name="dividir-conta"
        options={{
          title: 'Dividir Conta',
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <DividirContaIconFilled size={size} color={color} />
            ) : (
              <DividirContaIcon size={size} color={color} />
            ),
        }}
        listeners={{
          tabPress: handleTabPress('dividir-conta'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
