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
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

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
    const { error } = await supabase.auth.signInWithPassword({
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
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
});
