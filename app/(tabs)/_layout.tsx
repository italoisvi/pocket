import { Tabs } from 'expo-router';
import { CasaIcon } from '@/components/CasaIcon';
import { DividirContaIcon } from '@/components/DividirContaIcon';
import { KangarooIcon } from '@/components/KangarooIcon';
import { CameraIcon } from '@/components/CameraIcon';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 0,
          height: 85,
          paddingBottom: 16,
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
          fontFamily: 'CormorantGaramond-Medium',
          marginBottom: 6,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => (
            <CasaIcon size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dividir-conta"
        options={{
          title: 'Dividir',
          tabBarIcon: ({ color, size }) => (
            <DividirContaIcon size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Walts',
          tabBarIcon: ({ color, size }) => (
            <KangarooIcon
              size={size + 4}
              color={color}
              inverted={theme.background !== '#000'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Adicionar',
          tabBarIcon: ({ color, size }) => (
            <CameraIcon size={size} color={color} />
          ),
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
