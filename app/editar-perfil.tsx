import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { UsuarioIcon } from '@/components/UsuarioIcon';

export default function EditarPerfilScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
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

      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.name) {
        setUserName(profile.name);
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

  const handlePickImage = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permissão Necessária',
          'Precisamos de permissão para acessar sua galeria.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        setProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Erro ao selecionar imagem:', error);
      Alert.alert('Erro', 'Não foi possível carregar a imagem.');
    }
  };

  const uploadImageToStorage = async (uri: string): Promise<string | null> => {
    try {
      console.log('[EditProfile] Starting upload for URI:', uri);

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      // Path format: userId/filename (required by RLS policy)
      const filePath = `${userId}/${fileName}`;

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: fileName,
        type: `image/${fileExt}`,
      } as any);

      console.log('[EditProfile] Uploading to path:', filePath);

      // Get Supabase URL from config
      const uploadUrl = `${supabaseUrl}/storage/v1/object/profile-images/${filePath}`;

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      console.log('[EditProfile] Upload URL:', uploadUrl);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('[EditProfile] Upload error:', errorText);
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      console.log('[EditProfile] Upload successful, getting public URL');
      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      console.log('[EditProfile] Public URL:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('[EditProfile] Erro ao fazer upload da imagem:', error);
      return null;
    }
  };

  const handleSave = async () => {
    if (!userName.trim()) {
      Alert.alert('Erro', 'Por favor, insira um nome.');
      return;
    }

    setSaving(true);
    try {
      let avatarUrl = profileImage;

      // Se a imagem foi alterada e é uma URI local, fazer upload
      if (profileImage && profileImage.startsWith('file://')) {
        console.log('[EditProfile] Uploading image from:', profileImage);
        const uploadedUrl = await uploadImageToStorage(profileImage);
        console.log('[EditProfile] Upload result:', uploadedUrl);
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        } else {
          Alert.alert(
            'Aviso',
            'Não foi possível fazer upload da imagem, mas o nome será salvo.'
          );
        }
      }

      console.log('[EditProfile] Saving profile with avatar_url:', avatarUrl);
      const { data, error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            name: userName.trim(),
            avatar_url: avatarUrl,
          },
          { onConflict: 'id' }
        )
        .select();

      if (error) throw error;

      console.log('[EditProfile] Profile saved successfully:', data);

      Alert.alert('Sucesso', 'Perfil atualizado com sucesso!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('[EditProfile] Erro ao salvar perfil:', error);
      Alert.alert('Erro', 'Não foi possível atualizar o perfil.');
    } finally {
      setSaving(false);
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
        <Text style={[styles.title, { color: theme.text }]}>Editar Perfil</Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            {/* Foto de perfil */}
            <View style={styles.photoContainer}>
              <TouchableOpacity
                style={[
                  styles.photoButton,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                onPress={handlePickImage}
              >
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={styles.profileImage}
                  />
                ) : (
                  <UsuarioIcon size={48} color={theme.textSecondary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickImage}>
                <Text style={[styles.photoText, { color: theme.primary }]}>
                  Alterar foto de perfil
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <Text style={[styles.label, { color: theme.text }]}>Nome</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.cardBorder,
                    color: theme.text,
                  },
                ]}
                value={userName}
                onChangeText={setUserName}
                placeholder="Digite seu nome"
                placeholderTextColor={theme.textSecondary}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    theme.background === '#000' ? theme.card : theme.primary,
                  borderWidth: 2,
                  borderColor:
                    theme.background === '#000'
                      ? theme.cardBorder
                      : theme.primary,
                },
                saving && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color={theme.background === '#000' ? theme.text : '#FFF'}
                />
              ) : (
                <Text
                  style={[
                    styles.saveButtonText,
                    {
                      color: theme.background === '#000' ? theme.text : '#FFF',
                    },
                  ]}
                >
                  Salvar Alterações
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
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
  placeholder: {
    width: 40,
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
  photoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  photoButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  photoText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
  },
  label: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 12,
  },
  input: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-Regular',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  saveButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    color: '#FFF',
  },
});
