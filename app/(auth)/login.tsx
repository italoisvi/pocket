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
import Svg, { Path } from 'react-native-svg';

export default function LoginScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Erro ao fazer login', error.message);
    } else {
      router.replace('/(tabs)/home');
    }
  };

  const handleAppleSignIn = async () => {
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
        });

        if (error) {
          Alert.alert('Erro ao fazer login com Apple', error.message);
        } else {
          router.replace('/(tabs)/home');
        }
      }
    } catch (e: any) {
      if (e.code === 'ERR_CANCELED') {
        // User canceled the sign-in flow
      } else {
        Alert.alert('Erro', 'Não foi possível fazer login com Apple');
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
          Entre na sua conta
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

        <TouchableOpacity
          onPress={() => router.push('/(auth)/forgot-password')}
          disabled={loading}
          style={styles.forgotPassword}
        >
          <Text
            style={[styles.forgotPasswordText, { color: theme.textSecondary }]}
          >
            Esqueci a senha
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: theme.primary },
            loading && styles.buttonDisabled,
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: theme.background }]}>
            {loading ? 'Entrando...' : 'Entrar'}
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
            onPress={handleAppleSignIn}
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
              Entrar com sua conta Apple
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.push('/(auth)/signup')}
          disabled={loading}
        >
          <Text style={[styles.linkText, { color: theme.textSecondary }]}>
            Não tem uma conta?{' '}
            <Text style={[styles.linkBold, { color: theme.text }]}>
              Cadastre-se
            </Text>
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
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    height: 56,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
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
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  linkText: {
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
  },
  linkBold: {
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
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
    fontFamily: 'CormorantGaramond-SemiBold',
    flex: 1,
    textAlign: 'center',
    marginRight: 20, // Compensa o espaço do ícone à esquerda
  },
});
