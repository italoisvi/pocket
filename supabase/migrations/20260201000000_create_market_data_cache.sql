-- Tabela para cache de dados de mercado financeiro
-- Usada pela Edge Function get-market-data

CREATE TABLE IF NOT EXISTS market_data_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para busca rápida por id
CREATE INDEX IF NOT EXISTS idx_market_data_cache_id ON market_data_cache(id);

-- Permitir leitura pública (dados de mercado são públicos)
ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura por todos (incluindo anônimos)
CREATE POLICY "Allow public read access to market data cache"
  ON market_data_cache
  FOR SELECT
  TO public
  USING (true);

-- Política para permitir escrita apenas por service role (Edge Functions)
CREATE POLICY "Allow service role to manage market data cache"
  ON market_data_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
