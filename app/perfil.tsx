import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LapisIcon } from '@/components/LapisIcon';
import { AdicionarUsuarioIcon } from '@/components/AdicionarUsuarioIcon';
import { SettingsIcon } from '@/components/SettingsIcon';
import { UsuarioIcon } from '@/components/UsuarioIcon';
import { AlinhamentoGraficoIcon } from '@/components/AlinhamentoGraficoIcon';

export default function PerfilScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/');
        return;
      }

      setUserEmail(user.email || '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.name) {
        setUserName(profile.name);
      } else {
        setUserName('Usuário');
      }
      if (profile?.avatar_url) {
        setProfileImage(profile.avatar_url);
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteFriend = async () => {
    try {
      await Share.share({
        message:
          'Experimente o Pocket! Um app simples e elegante para controlar suas finanças pessoais. 💰',
      });
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
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
        <Text style={[styles.title, { color: theme.text }]}>Meu Perfil</Text>
        <TouchableOpacity
          style={[
            styles.settingsButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <SettingsIcon size={24} color={theme.text} />
        </TouchableOpacity>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Card de Perfil */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.profilePhoto,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={styles.profilePhotoImage}
                  />
                ) : (
                  <UsuarioIcon size={32} color={theme.textSecondary} />
                )}
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>
                  {userName}
                </Text>
                <Text
                  style={[styles.userEmail, { color: theme.textSecondary }]}
                >
                  {userEmail}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.editButton,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={() => router.push('/editar-perfil')}
              >
                <LapisIcon size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Card de Painel Financeiro */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.inviteCard}
              onPress={() => router.push('/painel-financeiro')}
            >
              <View style={styles.inviteLeft}>
                <AlinhamentoGraficoIcon size={28} color={theme.text} />
                <Text style={[styles.inviteTitle, { color: theme.text }]}>
                  Painel Financeiro
                </Text>
              </View>
              <LapisIcon size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Card de Indique um Amigo */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.inviteCard}
              onPress={handleInviteFriend}
            >
              <View style={styles.inviteLeft}>
                <AdicionarUsuarioIcon size={28} color={theme.primary} />
                <Text style={[styles.inviteTitle, { color: theme.text }]}>
                  Indique a um amigo
                </Text>
              </View>
              <Text
                style={[styles.inviteSubtitle, { color: theme.textSecondary }]}
              >
                CONVIDAR
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
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
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  profilePhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  profilePhotoImage: {
    width: '100%',
    height: '100%',
  },
  cardInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  inviteTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  inviteSubtitle: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Medium',
    letterSpacing: 1,
  },
});
