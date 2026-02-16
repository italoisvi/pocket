import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
  Linking,
  Switch,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { CheckIcon } from '@/components/CheckIcon';
import { ModoEscuroIcon } from '@/components/ModoEscuroIcon';
import { SolIcon } from '@/components/SolIcon';
import { LuaIcon } from '@/components/LuaIcon';
import { BotaoMovelIcon } from '@/components/BotaoMovelIcon';
import { ChevronRightIcon } from '@/components/ChevronRightIcon';
import { InformacoesIcon } from '@/components/InformacoesIcon';
import { EscudoIcon } from '@/components/EscudoIcon';
import { DocumentoIcon } from '@/components/DocumentoIcon';
import { ComentarioIcon } from '@/components/ComentarioIcon';
import { EnvelopeIcon } from '@/components/EnvelopeIcon';
import { CoroaIcon } from '@/components/CoroaIcon';
import { SinoIcon } from '@/components/SinoIcon';
import { useTheme, type ThemeMode } from '@/lib/theme';
import { getCardShadowStyle } from '@/lib/cardStyles';
import { usePremium } from '@/lib/usePremium';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportData, importData, importFromCSV } from '@/lib/dataExport';
import * as DocumentPicker from 'expo-document-picker';
// @ts-ignore
import * as FileSystem from 'expo-file-system/legacy';

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const { isPremium, loading: premiumLoading } = usePremium();
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('');
  const [exportingData, setExportingData] = useState(false);
  const [importingData, setImportingData] = useState(false);

  useEffect(() => {
    checkNotificationStatus();
    checkBiometricStatus();
  }, []);

  const checkNotificationStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationsEnabled(status === 'granted');
  };

  const checkBiometricStatus = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (compatible) {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (enrolled) {
        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
          )
        ) {
          setBiometricType('Face ID');
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ) {
          setBiometricType('Touch ID');
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.IRIS)
        ) {
          setBiometricType('Íris');
        } else {
          setBiometricType('Biometria');
        }

        // Verificar se biometria está habilitada
        const enabled = await AsyncStorage.getItem('@pocket_biometric_enabled');
        setBiometricEnabled(enabled === 'true');
      }
    }
  };

  const handleNotificationToggle = async (value: boolean) => {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsEnabled(status === 'granted');
      if (status !== 'granted') {
        Alert.alert(
          'Permissão Negada',
          'Por favor, habilite as notificações nas configurações do seu dispositivo.'
        );
      }
    } else {
      Alert.alert(
        'Desabilitar Notificações',
        'Para desabilitar as notificações, vá até as configurações do seu dispositivo.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleImportJSON = async () => {
    try {
      setImportingData(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setImportingData(false);
        return;
      }

      // Ler o arquivo
      // @ts-ignore
      const fileContent = await FileSystem.readAsStringAsync(
        result.assets[0].uri
      );

      // Importar os dados
      const success = await importData(fileContent);

      if (success) {
        setShowDataModal(false);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo');
    } finally {
      setImportingData(false);
    }
  };

  const handleImportCSV = async () => {
    try {
      setImportingData(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setImportingData(false);
        return;
      }

      // Ler o arquivo
      // @ts-ignore
      const fileContent = await FileSystem.readAsStringAsync(
        result.assets[0].uri
      );

      // Importar os dados
      const success = await importFromCSV(fileContent);

      if (success) {
        setShowDataModal(false);
      }
    } catch (error) {
      console.error('Error picking CSV:', error);
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo CSV');
    } finally {
      setImportingData(false);
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autentique-se para ativar a biometria',
        fallbackLabel: 'Usar senha',
      });

      if (result.success) {
        await AsyncStorage.setItem('@pocket_biometric_enabled', 'true');
        setBiometricEnabled(true);
        Alert.alert('Sucesso', 'Biometria ativada com sucesso!');
      } else {
        Alert.alert('Erro', 'Não foi possível ativar a biometria.');
      }
    } else {
      await AsyncStorage.setItem('@pocket_biometric_enabled', 'false');
      setBiometricEnabled(false);
      Alert.alert('Biometria desativada', 'A biometria foi desativada.');
    }
  };

  const handleLogout = async () => {
    Alert.alert('Sair', 'Deseja realmente sair da sua conta?', [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Deletar Conta',
      'Tem certeza que deseja deletar sua conta? Esta ação não pode ser desfeita. Todos os seus dados serão permanentemente removidos.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();

              if (!session) {
                Alert.alert('Erro', 'Sessão não encontrada');
                return;
              }

              // Chamar a Edge Function para deletar o usuário completamente
              const { data, error } = await supabase.functions.invoke(
                'delete-user',
                {
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                  },
                }
              );

              if (error) {
                console.error('Erro ao deletar conta:', error);
                console.error('Detalhes do erro:', JSON.stringify(error));
                Alert.alert(
                  'Erro',
                  'Não foi possível deletar sua conta. Tente novamente mais tarde.'
                );
                return;
              }

              console.log('Resposta da função:', data);

              // Fazer logout
              await supabase.auth.signOut();
              router.replace('/(auth)/login');

              Alert.alert(
                'Conta Deletada',
                'Sua conta e todos os dados foram removidos permanentemente.'
              );
            } catch (error) {
              console.error('Erro ao deletar conta:', error);
              Alert.alert(
                'Erro',
                'Não foi possível deletar sua conta. Tente novamente mais tarde.'
              );
            }
          },
        },
      ]
    );
  };

  const getThemeName = (theme: ThemeMode) => {
    switch (theme) {
      case 'light':
        return 'Modo Claro';
      case 'dark':
        return 'Modo Escuro';
      case 'system':
        return 'Modo do Sistema';
    }
  };

  const handleThemeSelect = (mode: ThemeMode) => {
    setThemeMode(mode);
    setShowThemeModal(false);
  };

  const handleSendEmail = async (subject: string) => {
    const email = 'contato@gladiussistemas.com.br';
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Erro', 'Não foi possível abrir o cliente de email.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível abrir o cliente de email.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[styles.header, { backgroundColor: theme.background }]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Configurações</Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: isPremium ? theme.card : theme.card,
                borderColor: isPremium ? theme.primary : theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => router.push('/subscription')}
          >
            <View style={styles.settingCardLeft}>
              <CoroaIcon
                size={24}
                color={isPremium ? theme.primary : theme.text}
              />
              <Text
                style={[
                  styles.settingCardTitle,
                  { color: isPremium ? theme.primary : theme.text },
                ]}
              >
                {isPremium ? 'Premium Ativo' : 'Assinar Pocket'}
              </Text>
            </View>
            <ChevronRightIcon
              size={20}
              color={isPremium ? theme.primary : theme.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => setShowThemeModal(true)}
          >
            <View style={styles.settingCardLeft}>
              <ModoEscuroIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Aparência
              </Text>
            </View>
            <Text
              style={[styles.settingCardValue, { color: theme.textSecondary }]}
            >
              {getThemeName(themeMode)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => setShowNotificationsModal(true)}
          >
            <View style={styles.settingCardLeft}>
              <SinoIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Notificações
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>

          {biometricType && (
            <TouchableOpacity
              style={[
                styles.settingCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(isDark),
              ]}
              onPress={() => setShowBiometricModal(true)}
            >
              <View style={styles.settingCardLeft}>
                <EscudoIcon size={24} color={theme.text} />
                <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                  Biometria
                </Text>
              </View>
              <ChevronRightIcon size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Dados</Text>

        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => setShowDataModal(true)}
          >
            <View style={styles.settingCardLeft}>
              <DocumentoIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Exportar/Importar
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Sobre o Pocket
        </Text>

        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => router.push('/sobre-nos')}
          >
            <View style={styles.settingCardLeft}>
              <InformacoesIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Sobre nós
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => router.push('/politica-privacidade')}
          >
            <View style={styles.settingCardLeft}>
              <EscudoIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Política de Privacidade
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => router.push('/termos-uso')}
          >
            <View style={styles.settingCardLeft}>
              <DocumentoIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Termos de Uso
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => router.push('/sobre-pluggy')}
          >
            <View style={styles.settingCardLeft}>
              <InformacoesIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Sobre a Pluggy
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Entre em Contato
        </Text>

        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => handleSendEmail('Feedback do Pocket')}
          >
            <View style={styles.settingCardLeft}>
              <ComentarioIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Dar feedback
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
              getCardShadowStyle(isDark),
            ]}
            onPress={() => handleSendEmail('Contato - Pocket')}
          >
            <View style={styles.settingCardLeft}>
              <EnvelopeIcon size={24} color={theme.text} />
              <Text style={[styles.settingCardTitle, { color: theme.text }]}>
                Entre em contato
              </Text>
            </View>
            <ChevronRightIcon size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />

        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[
              styles.logoutButton,
              {
                backgroundColor: isDark ? theme.card : theme.primary,
                borderWidth: 2,
                borderColor: isDark ? theme.cardBorder : theme.primary,
              },
            ]}
            onPress={handleLogout}
          >
            <Text
              style={[
                styles.logoutButtonText,
                {
                  color: isDark ? theme.text : '#fff',
                },
              ]}
            >
              SAIR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteAccount}
          >
            <Text style={[styles.deleteButtonText, { color: '#000' }]}>
              DELETAR CONTA
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showThemeModal && <BlurView intensity={10} style={styles.blurOverlay} />}
      {showNotificationsModal && (
        <BlurView intensity={10} style={styles.blurOverlay} />
      )}
      {showBiometricModal && (
        <BlurView intensity={10} style={styles.blurOverlay} />
      )}
      {showDataModal && <BlurView intensity={10} style={styles.blurOverlay} />}

      <Modal
        visible={showThemeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowThemeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowThemeModal(false)}
          />
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Aparência
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.themeOption,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                themeMode === 'light' && {
                  borderColor: theme.primary,
                },
                getCardShadowStyle(isDark),
              ]}
              onPress={() => handleThemeSelect('light')}
            >
              <View style={styles.themeOptionLeft}>
                <SolIcon size={20} color={theme.text} />
                <Text style={[styles.themeOptionText, { color: theme.text }]}>
                  Modo Claro
                </Text>
              </View>
              {themeMode === 'light' && (
                <CheckIcon size={20} color={theme.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeOption,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                themeMode === 'dark' && {
                  borderColor: theme.primary,
                },
                getCardShadowStyle(isDark),
              ]}
              onPress={() => handleThemeSelect('dark')}
            >
              <View style={styles.themeOptionLeft}>
                <LuaIcon size={20} color={theme.text} />
                <Text style={[styles.themeOptionText, { color: theme.text }]}>
                  Modo Escuro
                </Text>
              </View>
              {themeMode === 'dark' && (
                <CheckIcon size={20} color={theme.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeOption,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                themeMode === 'system' && {
                  borderColor: theme.primary,
                },
                getCardShadowStyle(isDark),
              ]}
              onPress={() => handleThemeSelect('system')}
            >
              <View style={styles.themeOptionLeft}>
                <BotaoMovelIcon size={20} color={theme.text} />
                <Text style={[styles.themeOptionText, { color: theme.text }]}>
                  Modo do Sistema
                </Text>
              </View>
              {themeMode === 'system' && (
                <CheckIcon size={20} color={theme.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNotificationsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowNotificationsModal(false)}
          />
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Notificações
              </Text>
            </View>

            <View
              style={[
                styles.notificationOption,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(isDark),
              ]}
            >
              <View style={styles.notificationLeft}>
                <Text style={[styles.notificationTitle, { color: theme.text }]}>
                  Permitir notificações push
                </Text>
                <Text
                  style={[
                    styles.notificationDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Receba alertas sobre orçamentos e atualizações
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{
                  false: isDark ? '#333' : '#e0e0e0',
                  true: '#f7c359',
                }}
                thumbColor={
                  notificationsEnabled
                    ? isDark
                      ? '#fff'
                      : '#000'
                    : isDark
                      ? '#000'
                      : '#fff'
                }
                ios_backgroundColor={isDark ? '#333' : '#e0e0e0'}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBiometricModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBiometricModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowBiometricModal(false)}
          />
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Biometria
              </Text>
            </View>

            <View
              style={[
                styles.notificationOption,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
                getCardShadowStyle(isDark),
              ]}
            >
              <View style={styles.notificationLeft}>
                <Text style={[styles.notificationTitle, { color: theme.text }]}>
                  Autenticação {biometricType}
                </Text>
                <Text
                  style={[
                    styles.notificationDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Use {biometricType} para acessar o app com mais segurança
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                trackColor={{
                  false: isDark ? '#333' : '#e0e0e0',
                  true: '#f7c359',
                }}
                thumbColor={
                  biometricEnabled
                    ? isDark
                      ? '#fff'
                      : '#000'
                    : isDark
                      ? '#000'
                      : '#fff'
                }
                ios_backgroundColor={isDark ? '#333' : '#e0e0e0'}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDataModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDataModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowDataModal(false)}
          />
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Exportar/Importar Dados
              </Text>
            </View>

            <View style={styles.dataModalContent}>
              <Text
                style={[styles.dataDescription, { color: theme.textSecondary }]}
              >
                Exporte seus dados para backup ou importe dados de outro
                dispositivo
              </Text>

              <TouchableOpacity
                style={[
                  styles.dataButton,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
                onPress={async () => {
                  setExportingData(true);
                  await exportData('json');
                  setExportingData(false);
                }}
                disabled={exportingData}
              >
                <DocumentoIcon size={20} color={theme.text} />
                <View style={styles.dataButtonTextContainer}>
                  <Text style={[styles.dataButtonTitle, { color: theme.text }]}>
                    Exportar JSON
                  </Text>
                  <Text
                    style={[
                      styles.dataButtonDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Backup completo de todos os dados
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dataButton,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
                onPress={async () => {
                  setExportingData(true);
                  await exportData('csv');
                  setExportingData(false);
                }}
                disabled={exportingData}
              >
                <DocumentoIcon size={20} color={theme.text} />
                <View style={styles.dataButtonTextContainer}>
                  <Text style={[styles.dataButtonTitle, { color: theme.text }]}>
                    Exportar CSV
                  </Text>
                  <Text
                    style={[
                      styles.dataButtonDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Para Excel, Google Sheets, etc
                  </Text>
                </View>
              </TouchableOpacity>

              <View
                style={[styles.divider, { backgroundColor: theme.border }]}
              />

              <TouchableOpacity
                style={[
                  styles.dataButton,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
                onPress={handleImportJSON}
                disabled={importingData}
              >
                <DocumentoIcon size={20} color={theme.text} />
                <View style={styles.dataButtonTextContainer}>
                  <Text style={[styles.dataButtonTitle, { color: theme.text }]}>
                    {importingData ? 'Importando...' : 'Importar JSON'}
                  </Text>
                  <Text
                    style={[
                      styles.dataButtonDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Restaurar backup de arquivo JSON
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dataButton,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                  getCardShadowStyle(isDark),
                ]}
                onPress={handleImportCSV}
                disabled={importingData}
              >
                <DocumentoIcon size={20} color={theme.text} />
                <View style={styles.dataButtonTextContainer}>
                  <Text style={[styles.dataButtonTitle, { color: theme.text }]}>
                    {importingData ? 'Importando...' : 'Importar CSV'}
                  </Text>
                  <Text
                    style={[
                      styles.dataButtonDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Importar de Excel, Google Sheets, etc
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  settingCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  settingCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingCardTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  settingCardValue: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
  },
  spacer: {
    flex: 1,
  },
  actionsSection: {
    marginTop: 'auto',
  },
  logoutButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  logoutButtonText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  modalHeader: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  themeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  themeOptionText: {
    fontSize: 18,
    fontFamily: 'DMSans-Medium',
  },
  notificationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  notificationLeft: {
    flex: 1,
    marginRight: 16,
  },
  notificationTitle: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 4,
  },
  notificationDescription: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    lineHeight: 20,
  },
  dataModalContent: {
    gap: 12,
  },
  dataDescription: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    marginBottom: 8,
    lineHeight: 22,
  },
  dataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  dataButtonTextContainer: {
    flex: 1,
  },
  dataButtonTitle: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 4,
  },
  dataButtonDescription: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
});
