import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { useTheme } from '@/lib/theme';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

type BiometricLockProps = {
  children: React.ReactNode;
};

export function BiometricLock({ children }: BiometricLockProps) {
  const { theme } = useTheme();
  const [isLocked, setIsLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const appState = useRef(AppState.currentState);
  const hasAuthenticatedThisSession = useRef(false);
  const isFirstMount = useRef(true);
  const lastAuthenticationTime = useRef<number>(0); // Timestamp da última autenticação

  // Verificar se biometria está habilitada
  useEffect(() => {
    checkBiometricSettings();
  }, []);

  const checkBiometricSettings = async () => {
    try {
      const enabled = await AsyncStorage.getItem('@pocket_biometric_enabled');
      const biometricIsEnabled = enabled === 'true';
      setBiometricEnabled(biometricIsEnabled);

      // Se biometria está habilitada E é a primeira montagem do componente
      // E ainda não autenticou nesta sessão, bloquear o app
      if (
        biometricIsEnabled &&
        isFirstMount.current &&
        !hasAuthenticatedThisSession.current
      ) {
        setIsLocked(true);
        // Aguardar um pouco antes de mostrar o prompt para evitar conflito com splash
        setTimeout(() => {
          authenticate();
        }, 500);
      }

      isFirstMount.current = false;
    } catch (error) {
      console.error('[BiometricLock] Erro ao verificar configurações:', error);
    }
  };

  // Monitorar mudanças no estado do app (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );
    return () => {
      subscription.remove();
    };
  }, [biometricEnabled, isAuthenticating]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log(
      `[BiometricLock] AppState change: ${appState.current} → ${nextAppState}`
    );

    // CRÍTICO: Se estamos autenticando, IGNORAR completamente mudanças de AppState
    if (isAuthenticating) {
      console.log(
        '[BiometricLock] Ignorando AppState (autenticação em andamento)'
      );
      appState.current = nextAppState;
      return;
    }

    const now = Date.now();
    const timeSinceLastAuth = now - lastAuthenticationTime.current;
    console.log(
      `[BiometricLock] timeSinceLastAuth: ${timeSinceLastAuth}ms, lastAuthenticationTime: ${lastAuthenticationTime.current}`
    );

    // Ignorar mudanças de estado nos primeiros 5 segundos após autenticação
    // Aumentado para 5s para dar tempo do RootLayout terminar de renderizar
    if (lastAuthenticationTime.current > 0 && timeSinceLastAuth < 5000) {
      console.log(
        '[BiometricLock] Ignorando mudança de AppState (cooldown ativo)'
      );
      appState.current = nextAppState;
      return;
    }

    // Se o app estava em background e voltou para foreground
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active' &&
      biometricEnabled &&
      hasAuthenticatedThisSession.current
    ) {
      console.log('[BiometricLock] App voltou do background - bloqueando');
      setIsLocked(true);
      setTimeout(() => {
        authenticate();
      }, 300);
    }

    appState.current = nextAppState;
  };

  const authenticate = async () => {
    // Evitar múltiplas autenticações simultâneas
    if (isAuthenticating) {
      console.log('[BiometricLock] Autenticação já em andamento');
      return;
    }

    try {
      setIsAuthenticating(true);
      console.log('[BiometricLock] Iniciando autenticação biométrica');

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autentique-se para acessar o Pocket',
        fallbackLabel: 'Usar senha do dispositivo',
        disableDeviceFallback: false,
        cancelLabel: 'Cancelar',
      });

      if (result.success) {
        console.log('[BiometricLock] Autenticação bem-sucedida');
        hasAuthenticatedThisSession.current = true;
        lastAuthenticationTime.current = Date.now(); // Registrar timestamp
        setIsLocked(false);
      } else {
        console.log('[BiometricLock] Autenticação falhou');
        // Se falhar, tentar novamente após um delay
        setTimeout(() => {
          authenticate();
        }, 1000);
      }
    } catch (error) {
      console.error('[BiometricLock] Erro na autenticação:', error);
      // Em caso de erro, permitir acesso (fail-safe)
      hasAuthenticatedThisSession.current = true;
      setIsLocked(false);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Se não estiver bloqueado, mostrar o conteúdo normalmente
  if (!isLocked) {
    return <>{children}</>;
  }

  // Tela de bloqueio
  return (
    <View style={[styles.lockScreen, { backgroundColor: theme.background }]}>
      <View style={styles.lockContent}>
        <Ionicons
          name="lock-closed"
          size={64}
          color={theme.text}
          style={styles.lockIcon}
        />
        <Text style={[styles.lockText, { color: theme.text }]}>
          Pocket bloqueado
        </Text>
        <Text style={[styles.lockSubtext, { color: theme.textSecondary }]}>
          Use sua biometria para desbloquear
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockContent: {
    alignItems: 'center',
    gap: 16,
  },
  lockIcon: {
    marginBottom: 8,
  },
  lockText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  lockSubtext: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
});
