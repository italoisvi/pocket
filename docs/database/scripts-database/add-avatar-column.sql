-- Adicionar coluna avatar_url na tabela profiles
-- Execute este script no Supabase SQL Editor

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Adicionar comentário na coluna
COMMENT ON COLUMN profiles.avatar_url IS 'URL da foto de perfil do usuário armazenada no Supabase Storage';
