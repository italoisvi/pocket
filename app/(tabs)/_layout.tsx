import { Tabs, router, usePathname } from 'expo-router';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CasaIcon } from '@/components/CasaIcon';
import { CasaIconFilled } from '@/components/CasaIconFilled';
import { DocumentoIcon } from '@/components/DocumentoIcon';
import { DocumentoIconFilled } from '@/components/DocumentoIconFilled';
import { OpenFinanceIcon } from '@/components/OpenFinanceIcon';
import { OpenFinanceIconFilled } from '@/components/OpenFinanceIconFilled';
import { CameraIcon } from '@/components/CameraIcon';
import { CameraIconFilled } from '@/components/CameraIconFilled';
import { ComenteMedicalIcon } from '@/components/ComenteMedicalIcon';
import { ComenteMedicalIconFilled } from '@/components/ComenteMedicalIconFilled';
import { useTheme } from '@/lib/theme';
import {
  BrowserProvider,
  useBrowser,
} from '@/components/browser/BrowserContext';
import InAppBrowser from '@/components/browser/InAppBrowser';

function TabsLayoutContent() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const {
    browserUrl,
    browserVisible,
    showToolbar,
    closeBrowser,
    appTranslateY,
    panResponder,
  } = useBrowser();

  // Função para lidar com o clique na tab - reseta a navegação
  const handleTabPress = (tabRoute: string) => {
    return (e: any) => {
      // Se já está na tab, não faz nada
      if (pathname === `/${tabRoute}` || pathname === `/(tabs)/${tabRoute}`) {
        e.preventDefault();
        return;
      }
      // Navega para a tab resetando o histórico
      e.preventDefault();
      router.replace(`/(tabs)/${tabRoute}`);
    };
  };

  const getDomain = (url: string | null) => {
    if (!url) return '';
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  return (
    <View style={styles.container}>
      {/* Browser - ATRÁS (zIndex: 1) */}
      <InAppBrowser />

      {/* App inteiro - NA FRENTE (zIndex: 2), move pra baixo */}
      <Animated.View
        style={[
          styles.appWrapper,
          {
            transform: [{ translateY: appTranslateY }],
            backgroundColor: theme.background,
          },
          browserVisible && styles.appWrapperWithBrowser,
        ]}
      >
        {/* Toolbar do browser - aparece no topo quando browser está aberto */}
        {showToolbar && (
          <View {...panResponder.panHandlers} style={styles.toolbar}>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={closeBrowser}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#505050" />
            </TouchableOpacity>

            <View style={styles.domainContainer}>
              <Text style={styles.domainText} numberOfLines={1}>
                {getDomain(browserUrl)}
              </Text>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.toolbarButtonPlaceholder} />
          </View>
        )}

        {/* Tabs - configuração ORIGINAL preservada */}
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
            name="comprovantes"
            options={{
              title: 'Comprovantes',
              tabBarIcon: ({ color, focused }) =>
                focused ? (
                  <DocumentoIconFilled size={28} color={color} />
                ) : (
                  <DocumentoIcon size={28} color={color} />
                ),
            }}
            listeners={{
              tabPress: handleTabPress('comprovantes'),
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
              href: null,
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
      </Animated.View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <BrowserProvider>
      <TabsLayoutContent />
    </BrowserProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appWrapper: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  appWrapperWithBrowser: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  // Toolbar do browser
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EBEBEB',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  toolbarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D5D5D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButtonPlaceholder: {
    width: 36,
    height: 36,
  },
  domainContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5D5D5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: 200,
  },
  domainText: {
    color: '#303030',
    fontSize: 14,
    fontWeight: '500',
  },
  dragIndicator: {
    width: 32,
    height: 4,
    backgroundColor: '#B0B0B0',
    borderRadius: 2,
    marginLeft: 10,
  },
});
