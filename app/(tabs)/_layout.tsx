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
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 0,
          height: 80,
          paddingBottom: 20,
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
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <CasaIconFilled size={28} color={color} />
            ) : (
              <CasaIcon size={28} color={color} />
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
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <CameraIconFilled size={28} color={color} />
            ) : (
              <CameraIcon size={28} color={color} />
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
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <ComenteMedicalIconFilled size={28} color={color} />
            ) : (
              <ComenteMedicalIcon size={28} color={color} />
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
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <OpenFinanceIconFilled size={68} color={color} />
            ) : (
              <OpenFinanceIcon size={68} color={color} />
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
          tabBarIcon: ({ color, focused }) =>
            focused ? (
              <DividirContaIconFilled size={28} color={color} />
            ) : (
              <DividirContaIcon size={28} color={color} />
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
