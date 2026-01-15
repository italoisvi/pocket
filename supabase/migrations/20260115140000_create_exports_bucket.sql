-- ============================================================================
-- Migration: Criar bucket 'exports' para exportação de dados via Walts
-- ============================================================================

-- Criar o bucket (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,  -- privado, requer autenticação
  10485760,  -- 10MB max
  ARRAY['application/json', 'text/csv']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: usuários podem fazer upload apenas em sua própria pasta
CREATE POLICY "Users can upload their own exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: usuários podem ler apenas seus próprios arquivos
CREATE POLICY "Users can read their own exports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: usuários podem deletar seus próprios arquivos
CREATE POLICY "Users can delete their own exports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'exports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: service role pode fazer tudo (para o Walts agent)
CREATE POLICY "Service role has full access to exports"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'exports')
WITH CHECK (bucket_id = 'exports');
