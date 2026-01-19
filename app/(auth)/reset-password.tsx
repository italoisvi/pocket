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
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não coincidem');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Erro', 'A senha deve ter no mínimo 8 caracteres');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Erro', error.message);
    } else {
      // Fazer logout para invalidar sessões antigas
      await supabase.auth.signOut();

      Alert.alert('Sucesso', 'Sua senha foi redefinida com sucesso!', [
        {
          text: 'OK',
          onPress: () => router.replace('/(auth)/login'),
        },
      ]);
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
          Nova senha
        </Text>

        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Digite sua nova senha abaixo.
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
          placeholder="Nova senha"
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
          onPress={handleUpdatePassword}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: theme.background }]}>
            {loading ? 'Salvando...' : 'Redefinir senha'}
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
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 24,
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
});
