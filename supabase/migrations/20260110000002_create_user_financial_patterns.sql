-- Tabela para armazenar padrões financeiros aprendidos do usuário
CREATE TABLE IF NOT EXISTS user_financial_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tipo do padrão aprendido
  -- spending_habit: hábitos de gasto (ex: gasta R$ 150/sem em alimentação)
  -- favorite_place: estabelecimentos frequentes
  -- time_pattern: padrões temporais (ex: gasta mais no fim de semana)
  -- seasonal: padrões sazonais (ex: dezembro gasta mais)
  -- payment_cycle: ciclo de pagamento (ex: gasta 60% na primeira semana)
  -- category_trend: tendência por categoria
  -- anomaly_threshold: limiar para detectar anomalias
  -- preference: preferência explícita do usuário
  pattern_type TEXT NOT NULL,

  -- Chave identificadora única do padrão
  -- Ex: 'weekly_food_spending', 'favorite_coffee_shop', 'weekend_spending_increase'
  pattern_key TEXT NOT NULL,

  -- Categoria relacionada (quando aplicável)
  category TEXT,

  -- Valor do padrão (JSON flexível para diferentes estruturas)
  pattern_value JSONB NOT NULL,

  -- Confiança do padrão (0.0 a 1.0)
  -- 1.0 = informação explícita do usuário
  -- 0.5-0.9 = padrão detectado com alta confiança
  -- < 0.5 = padrão detectado com baixa confiança
  confidence FLOAT DEFAULT 0.5,

  -- Quantas vezes esse padrão foi observado
  occurrences INTEGER DEFAULT 1,

  -- Período de análise usado para detectar o padrão
  analysis_period_start DATE,
  analysis_period_end DATE,

  -- Metadados de rastreamento
  first_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Constraint única para evitar duplicatas
  CONSTRAINT unique_user_pattern UNIQUE (user_id, pattern_type, pattern_key)
);

-- Índices para buscas eficientes
CREATE INDEX IF NOT EXISTS user_patterns_user_id_idx ON user_financial_patterns(user_id);
CREATE INDEX IF NOT EXISTS user_patterns_type_idx ON user_financial_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS user_patterns_category_idx ON user_financial_patterns(category);
CREATE INDEX IF NOT EXISTS user_patterns_confidence_idx ON user_financial_patterns(confidence DESC);

-- RLS
ALTER TABLE user_financial_patterns ENABLE ROW LEVEL SECURITY;

-- Política: usuários só podem ver seus próprios padrões
CREATE POLICY "Users can view own patterns"
  ON user_financial_patterns FOR SELECT
  USING (auth.uid() = user_id);

-- Política: usuários só podem inserir seus próprios padrões
CREATE POLICY "Users can insert own patterns"
  ON user_financial_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: usuários só podem atualizar seus próprios padrões
CREATE POLICY "Users can update own patterns"
  ON user_financial_patterns FOR UPDATE
  USING (auth.uid() = user_id);

-- Política: usuários só podem deletar seus próprios padrões
CREATE POLICY "Users can delete own patterns"
  ON user_financial_patterns FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Tabela para memória de longo prazo do Walts
-- ============================================

-- Verificar se já existe a tabela walts_memory
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'walts_memory') THEN
    CREATE TABLE walts_memory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

      -- Tipo de memória
      memory_type TEXT NOT NULL, -- 'preference', 'context', 'insight'

      -- Chave identificadora
      key TEXT NOT NULL,

      -- Valor (JSON flexível)
      value JSONB NOT NULL,

      -- Confiança
      confidence FLOAT DEFAULT 1.0,

      -- Fonte da memória
      source TEXT,

      -- Contagem de uso
      use_count INTEGER DEFAULT 0,

      -- Timestamps
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_used_at TIMESTAMP WITH TIME ZONE,

      -- Constraint única
      CONSTRAINT unique_walts_memory UNIQUE (user_id, memory_type, key)
    );

    -- Índices
    CREATE INDEX walts_memory_user_id_idx ON walts_memory(user_id);
    CREATE INDEX walts_memory_type_idx ON walts_memory(memory_type);
    CREATE INDEX walts_memory_key_idx ON walts_memory(key);

    -- RLS
    ALTER TABLE walts_memory ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view own walts_memory"
      ON walts_memory FOR SELECT
      USING (auth.uid() = user_id);

    CREATE POLICY "Users can insert own walts_memory"
      ON walts_memory FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can update own walts_memory"
      ON walts_memory FOR UPDATE
      USING (auth.uid() = user_id);

    CREATE POLICY "Users can delete own walts_memory"
      ON walts_memory FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- Função para atualizar last_updated_at automaticamente
-- ============================================

CREATE OR REPLACE FUNCTION update_pattern_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar timestamp
DROP TRIGGER IF EXISTS update_pattern_timestamp_trigger ON user_financial_patterns;
CREATE TRIGGER update_pattern_timestamp_trigger
  BEFORE UPDATE ON user_financial_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_timestamp();
