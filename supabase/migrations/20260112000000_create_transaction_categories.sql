-- Tabela para armazenar categorias das transacoes do extrato bancario
-- O Walts pode categorizar transacoes do Open Finance sem criar expenses duplicados
-- Isso permite mostrar gastos do extrato em Custos Fixos/Variaveis com uma flag

CREATE TABLE IF NOT EXISTS transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES pluggy_transactions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subcategory TEXT,
  is_fixed_cost BOOLEAN DEFAULT FALSE,
  categorized_by TEXT DEFAULT 'walts', -- 'walts' ou 'user'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Cada transacao so pode ter uma categoria por usuario
  UNIQUE(user_id, transaction_id)
);

-- Indices para performance
CREATE INDEX idx_transaction_categories_user_id ON transaction_categories(user_id);
CREATE INDEX idx_transaction_categories_transaction_id ON transaction_categories(transaction_id);
CREATE INDEX idx_transaction_categories_category ON transaction_categories(category);

-- RLS (Row Level Security)
ALTER TABLE transaction_categories ENABLE ROW LEVEL SECURITY;

-- Politica: usuario so ve suas proprias categorias
CREATE POLICY "Users can view own transaction categories"
  ON transaction_categories FOR SELECT
  USING (auth.uid() = user_id);

-- Politica: usuario pode inserir suas proprias categorias
CREATE POLICY "Users can insert own transaction categories"
  ON transaction_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politica: usuario pode atualizar suas proprias categorias
CREATE POLICY "Users can update own transaction categories"
  ON transaction_categories FOR UPDATE
  USING (auth.uid() = user_id);

-- Politica: usuario pode deletar suas proprias categorias
CREATE POLICY "Users can delete own transaction categories"
  ON transaction_categories FOR DELETE
  USING (auth.uid() = user_id);

-- Adicionar coluna source na tabela expenses para diferenciar origem
-- 'manual' = adicionado pelo usuario (camera, upload)
-- 'import' = importado do extrato pelo Walts
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Atualizar expenses existentes para ter source = 'manual'
UPDATE expenses SET source = 'manual' WHERE source IS NULL;
