import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { useTheme, type ThemeMode } from '@/lib/theme';
import * as Sentry from '@sentry/react-native';

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const [showThemeModal, setShowThemeModal] = useState(false);

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
      'Tem certeza que deseja deletar sua conta? Esta ação não pode ser desfeita.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            // TODO: Implement account deletion
            Alert.alert(
              'Em desenvolvimento',
              'Funcionalidade de deletar conta será implementada em breve.'
            );
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

  const handleTestSentry = () => {
    try {
      Sentry.captureException(new Error('Sentry test error from Settings'));
      Alert.alert(
        'Teste Enviado',
        'Um erro de teste foi enviado para o Sentry. Verifique em:\nhttps://gladius-gs.sentry.io/issues/?project=4510589471293440'
      );
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível enviar o teste para o Sentry.');
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
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
            onPress={() => setShowThemeModal(true)}
          >
            <Text style={[styles.settingCardTitle, { color: theme.text }]}>
              Aparência
            </Text>
            <Text
              style={[styles.settingCardValue, { color: theme.textSecondary }]}
            >
              {getThemeName(themeMode)}
            </Text>
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
            ]}
            onPress={handleTestSentry}
          >
            <Text style={[styles.settingCardTitle, { color: theme.text }]}>
              🐛 Testar Sentry
            </Text>
            <Text
              style={[styles.settingCardValue, { color: theme.textSecondary }]}
            >
              Enviar erro de teste
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />

        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[
              styles.logoutButton,
              {
                backgroundColor:
                  themeMode === 'dark' ||
                  (themeMode === 'system' && theme.background === '#000')
                    ? theme.card
                    : theme.primary,
                borderWidth: 2,
                borderColor:
                  themeMode === 'dark' ||
                  (themeMode === 'system' && theme.background === '#000')
                    ? theme.cardBorder
                    : theme.primary,
              },
            ]}
            onPress={handleLogout}
          >
            <Text
              style={[
                styles.logoutButtonText,
                {
                  color:
                    themeMode === 'dark' ||
                    (themeMode === 'system' && theme.background === '#000')
                      ? theme.text
                      : '#fff',
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
              ]}
              onPress={() => handleThemeSelect('light')}
            >
              <Text style={[styles.themeOptionText, { color: theme.text }]}>
                Modo Claro
              </Text>
              {themeMode === 'light' && (
                <View
                  style={[
                    styles.selectedIndicator,
                    { backgroundColor: theme.primary },
                  ]}
                />
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
              ]}
              onPress={() => handleThemeSelect('dark')}
            >
              <Text style={[styles.themeOptionText, { color: theme.text }]}>
                Modo Escuro
              </Text>
              {themeMode === 'dark' && (
                <View
                  style={[
                    styles.selectedIndicator,
                    { backgroundColor: theme.primary },
                  ]}
                />
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
              ]}
              onPress={() => handleThemeSelect('system')}
            >
              <Text style={[styles.themeOptionText, { color: theme.text }]}>
                Modo do Sistema
              </Text>
              {themeMode === 'system' && (
                <View
                  style={[
                    styles.selectedIndicator,
                    { backgroundColor: theme.primary },
                  ]}
                />
              )}
            </TouchableOpacity>
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
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
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
  settingCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingCardTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  settingCardValue: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
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
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
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
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
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
  themeOptionText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Medium',
  },
  selectedIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
