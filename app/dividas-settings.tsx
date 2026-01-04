import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { supabase } from '@/lib/supabase';

export default function DividasSettingsScreen() {
  const { theme } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('debt_notifications_enabled')
        .eq('id', user.id)
        .single();

      if (profile) {
        setNotificationsEnabled(profile.debt_notifications_enabled || false);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ debt_notifications_enabled: value })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      setNotificationsEnabled(value);
      Alert.alert(
        'Sucesso',
        value
          ? 'Notificações de dívidas ativadas'
          : 'Notificações de dívidas desativadas'
      );
    } catch (error) {
      console.error('Error updating settings:', error);
      Alert.alert('Erro', 'Não foi possível atualizar as configurações');
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          Configurações de Dívidas
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Settings */}
      <View style={styles.content}>
        <View
          style={[
            styles.settingCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <View style={styles.settingContent}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, { color: theme.text }]}>
                Notificações de Dívidas
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: theme.textSecondary },
                ]}
              >
                Receba alertas quando houver dívidas vencidas ou cartões de
                crédito próximos do limite
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={
                notificationsEnabled
                  ? theme.background === '#000'
                    ? '#000'
                    : '#fff'
                  : '#f4f3f4'
              }
              disabled={loading}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
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
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  settingCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  settingContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 20,
  },
});
