-- Tabelas para integração com a Belvo (Open Finance)
-- Estrutura equivalente às tabelas pluggy_* para manter compatibilidade

-- Tabela de Links (conexões com bancos)
CREATE TABLE IF NOT EXISTS belvo_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belvo_link_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  institution_type TEXT, -- BANK, FISCAL, etc
  access_mode TEXT DEFAULT 'recurrent', -- single ou recurrent
  status TEXT NOT NULL DEFAULT 'valid', -- valid, invalid, unconfirmed, token_required
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  refresh_rate TEXT, -- 6h, 12h, 24h, 7d, 30d
  external_id TEXT -- ID externo opcional para referência
);

-- Tabela de Contas
CREATE TABLE IF NOT EXISTS belvo_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belvo_account_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_id UUID NOT NULL REFERENCES belvo_links(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- CHECKING_ACCOUNT, SAVINGS_ACCOUNT, CREDIT_CARD, LOAN_ACCOUNT
  type TEXT, -- Tipo específico da instituição
  name TEXT NOT NULL,
  agency TEXT,
  number TEXT,
  balance_current NUMERIC(15, 2),
  balance_available NUMERIC(15, 2),
  currency TEXT DEFAULT 'BRL',
  -- Campos específicos para cartão de crédito
  credit_limit NUMERIC(15, 2),
  credit_available NUMERIC(15, 2),
  credit_used NUMERIC(15, 2),
  -- Metadados
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  institution_name TEXT -- Denormalizado para facilitar queries
);

-- Tabela de Transações
CREATE TABLE IF NOT EXISTS belvo_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belvo_transaction_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES belvo_accounts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  type TEXT NOT NULL, -- INFLOW ou OUTFLOW
  status TEXT, -- PENDING, PROCESSED, UNCATEGORIZED
  category TEXT, -- Categoria da Belvo
  subcategory TEXT,
  reference TEXT, -- Referência/código da transação
  balance NUMERIC(15, 2), -- Saldo após a transação
  value_date DATE NOT NULL, -- Data do valor
  accounting_date DATE, -- Data contábil
  currency TEXT DEFAULT 'BRL',
  -- Campos para sincronização com expenses
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de Consentimentos (específico do Open Finance Brasil)
CREATE TABLE IF NOT EXISTS belvo_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belvo_consent_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_id UUID REFERENCES belvo_links(id) ON DELETE SET NULL,
  institution_name TEXT NOT NULL,
  status TEXT NOT NULL, -- active, revoked, expired, pending
  permissions TEXT[], -- Lista de permissões concedidas
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_belvo_links_user_id ON belvo_links(user_id);
CREATE INDEX IF NOT EXISTS idx_belvo_links_belvo_link_id ON belvo_links(belvo_link_id);
CREATE INDEX IF NOT EXISTS idx_belvo_accounts_user_id ON belvo_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_belvo_accounts_link_id ON belvo_accounts(link_id);
CREATE INDEX IF NOT EXISTS idx_belvo_transactions_user_id ON belvo_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_belvo_transactions_account_id ON belvo_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_belvo_transactions_value_date ON belvo_transactions(value_date);
CREATE INDEX IF NOT EXISTS idx_belvo_consents_user_id ON belvo_consents(user_id);

-- RLS (Row Level Security)
ALTER TABLE belvo_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE belvo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE belvo_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE belvo_consents ENABLE ROW LEVEL SECURITY;

-- Políticas para belvo_links
CREATE POLICY "Users can view their own belvo links"
  ON belvo_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own belvo links"
  ON belvo_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own belvo links"
  ON belvo_links FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own belvo links"
  ON belvo_links FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas para belvo_accounts
CREATE POLICY "Users can view their own belvo accounts"
  ON belvo_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own belvo accounts"
  ON belvo_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own belvo accounts"
  ON belvo_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own belvo accounts"
  ON belvo_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas para belvo_transactions
CREATE POLICY "Users can view their own belvo transactions"
  ON belvo_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own belvo transactions"
  ON belvo_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own belvo transactions"
  ON belvo_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own belvo transactions"
  ON belvo_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas para belvo_consents
CREATE POLICY "Users can view their own belvo consents"
  ON belvo_consents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own belvo consents"
  ON belvo_consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own belvo consents"
  ON belvo_consents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own belvo consents"
  ON belvo_consents FOR DELETE
  USING (auth.uid() = user_id);

-- Service role também precisa acessar (para Edge Functions)
CREATE POLICY "Service role can manage belvo_links"
  ON belvo_links FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage belvo_accounts"
  ON belvo_accounts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage belvo_transactions"
  ON belvo_transactions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage belvo_consents"
  ON belvo_consents FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
