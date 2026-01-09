-- Criar bucket para armazenar PDFs de comprovantes
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Política: Usuários podem fazer upload de seus próprios PDFs
CREATE POLICY "Users can upload their own receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Política: PDFs são públicos para leitura
CREATE POLICY "Receipts are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'expense-receipts');

-- Política: Usuários podem deletar seus próprios PDFs
CREATE POLICY "Users can delete their own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'expense-receipts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
