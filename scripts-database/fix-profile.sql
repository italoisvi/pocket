-- Este script cria o perfil para o usuário atual se não existir
-- Execute este script no SQL Editor do Supabase

-- Primeiro, vamos ver se o perfil já existe
-- SELECT * FROM profiles WHERE id = auth.uid();

-- Se não existir, cria o perfil
INSERT INTO profiles (id, created_at)
SELECT auth.uid(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid()
);

-- Verifica se foi criado
SELECT * FROM profiles WHERE id = auth.uid();
