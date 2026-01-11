-- Tabela para armazenar análises do Walts (Raio-X Financeiro)
CREATE TABLE IF NOT EXISTS walts_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL DEFAULT 'raio_x_financeiro',
  content TEXT NOT NULL,
  context_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscar análises do usuário
CREATE INDEX IF NOT EXISTS walts_analyses_user_id_idx ON walts_analyses(user_id);
CREATE INDEX IF NOT EXISTS walts_analyses_created_at_idx ON walts_analyses(created_at DESC);

-- RLS
ALTER TABLE walts_analyses ENABLE ROW LEVEL SECURITY;

-- Política: usuários só podem ver suas próprias análises
CREATE POLICY "Users can view own analyses"
  ON walts_analyses FOR SELECT
  USING (auth.uid() = user_id);

-- Política: usuários só podem inserir suas próprias análises
CREATE POLICY "Users can insert own analyses"
  ON walts_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: usuários só podem deletar suas próprias análises
CREATE POLICY "Users can delete own analyses"
  ON walts_analyses FOR DELETE
  USING (auth.uid() = user_id);
