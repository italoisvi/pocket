import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { markOnboardingPaywallShown } from '@/lib/onboarding';
import Svg, { Path } from 'react-native-svg';

// Função para formatar nome com maiúsculas
function formatName(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export default function SignupScreen() {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (text: string) => {
    setName(formatName(text));
  };

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não correspondem');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Erro', 'A senha deve ter pelo menos 8 caracteres');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
        },
      },
    });

    if (error) {
      setLoading(false);
      Alert.alert('Erro ao cadastrar', error.message);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: data.user.id, name: name }, { onConflict: 'id' });

      if (profileError) {
        console.error('Error upserting profile:', profileError);
      }

      const { data: kiwifyPurchase } = await supabase
        .from('kiwify_purchases')
        .select('access_until')
        .eq('email', email.toLowerCase().trim())
        .eq('status', 'approved')
        .gt('access_until', new Date().toISOString())
        .order('access_until', { ascending: false })
        .limit(1)
        .single();

      if (kiwifyPurchase) {
        await supabase
          .from('profiles')
          .update({ kiwify_access_until: kiwifyPurchase.access_until })
          .eq('id', data.user.id);
      }
    }

    setLoading(false);
    router.replace('/(tabs)/home');
  };

  const handleAppleSignUp = async () => {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
          nonce: credential.identityToken,
        });

        if (error) {
          Alert.alert('Erro ao cadastrar com Apple', error.message);
        } else {
          // Salvar nome completo se disponível
          if (data.user) {
            let formattedName = 'Usuário';

            // Tentar pegar o nome do Apple
            if (credential.fullName) {
              const firstName = credential.fullName.givenName || '';
              const lastName = credential.fullName.familyName || '';
              const fullName = `${firstName} ${lastName}`.trim();

              if (fullName) {
                formattedName = formatName(fullName);
              }
            }

            // Tentar pegar o email do Apple como fallback
            if (formattedName === 'Usuário' && credential.email) {
              const emailName = credential.email.split('@')[0];
              formattedName = formatName(emailName.replace(/[._-]/g, ' '));
            }

            await supabase
              .from('profiles')
              .upsert(
                { id: data.user.id, name: formattedName },
                { onConflict: 'id' }
              );

            const userEmail = data.user.email?.toLowerCase().trim();
            if (userEmail) {
              const { data: kiwifyPurchase } = await supabase
                .from('kiwify_purchases')
                .select('access_until')
                .eq('email', userEmail)
                .eq('status', 'approved')
                .gt('access_until', new Date().toISOString())
                .order('access_until', { ascending: false })
                .limit(1)
                .single();

              if (kiwifyPurchase) {
                await supabase
                  .from('profiles')
                  .update({ kiwify_access_until: kiwifyPurchase.access_until })
                  .eq('id', data.user.id);
              }
            }
          }

          router.replace('/(tabs)/home');
        }
      }
    } catch (e: any) {
      if (e.code === 'ERR_CANCELED') {
        // User canceled the sign-in flow
      } else {
        Alert.alert('Erro', 'Não foi possível cadastrar com Apple');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/kangaroo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Pocket</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Crie sua conta
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              color: theme.text,
            },
          ]}
          placeholder="Nome completo"
          placeholderTextColor={theme.textSecondary}
          value={name}
          onChangeText={handleNameChange}
          autoCapitalize="words"
          autoCorrect={false}
          spellCheck={false}
          editable={!loading}
        />

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              color: theme.text,
            },
          ]}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardType="email-address"
          editable={!loading}
        />

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              color: theme.text,
            },
          ]}
          placeholder="Senha"
          placeholderTextColor={theme.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              color: theme.text,
            },
          ]}
          placeholder="Confirmar senha"
          placeholderTextColor={theme.textSecondary}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: theme.primary },
            loading && styles.buttonDisabled,
          ]}
          onPress={handleSignup}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: theme.background }]}>
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[
              styles.appleButton,
              {
                backgroundColor:
                  theme.background === '#000' ? theme.card : '#000',
                borderColor: theme.cardBorder,
              },
              loading && styles.buttonDisabled,
            ]}
            onPress={handleAppleSignUp}
            disabled={loading}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path
                d="M18.546 12.763c0.024-1.87 1.004-3.597 2.597-4.576-1.009-1.442-2.64-2.323-4.399-2.378-1.851-0.194-3.645 1.107-4.588 1.107-0.961 0-2.413-1.088-3.977-1.056-2.057 0.067-3.929 1.208-4.93 3.007-2.131 3.69-0.542 9.114 1.5 12.097 1.022 1.461 2.215 3.092 3.778 3.035 1.529-0.063 2.1-0.975 3.945-0.975 1.828 0 2.364 0.975 3.958 0.938 1.64-0.027 2.674-1.467 3.66-2.942 0.734-1.041 1.299-2.191 1.673-3.408-1.948-0.824-3.215-2.733-3.217-4.849zM15.535 3.847c0.894-1.074 1.335-2.454 1.228-3.847-1.366 0.144-2.629 0.797-3.535 1.829-0.895 1.019-1.349 2.351-1.261 3.705 1.385 0.014 2.7-0.636 3.568-1.687z"
                fill={theme.background === '#000' ? '#FFF' : '#FFF'}
              />
            </Svg>
            <Text
              style={[
                styles.appleButtonText,
                {
                  color: theme.background === '#000' ? theme.text : '#FFF',
                },
              ]}
            >
              Cadastrar com sua conta Apple
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <Text style={[styles.linkText, { color: theme.textSecondary }]}>
            Já tem uma conta?{' '}
            <Text style={[styles.linkBold, { color: theme.text }]}>Entre</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 56,
    fontFamily: 'CormorantGaramond-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 20,
    fontFamily: 'DMSans-Regular',
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    height: 56,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    marginBottom: 16,
  },
  button: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  linkText: {
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
  },
  linkBold: {
    fontFamily: 'DMSans-SemiBold',
  },
  appleButton: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    flexDirection: 'row',
    paddingLeft: 16,
    paddingRight: 16,
    position: 'relative',
  },
  appleButtonText: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
    flex: 1,
    textAlign: 'center',
    marginRight: 20, // Compensa o espaço do ícone à esquerda
  },
});
