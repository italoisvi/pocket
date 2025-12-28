-- Criar bucket para imagens de perfil
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;

-- Política: Usuários podem fazer upload de suas próprias imagens de perfil
CREATE POLICY "Users can upload their own profile images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Política: Todos podem visualizar imagens de perfil (bucket é público)
CREATE POLICY "Users can view profile images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'profile-images');

-- Política: Usuários podem atualizar suas próprias imagens de perfil
CREATE POLICY "Users can update their own profile images"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Política: Usuários podem deletar suas próprias imagens de perfil
CREATE POLICY "Users can delete their own profile images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
