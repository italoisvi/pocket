-- =====================================================
-- OPEN FINANCE - PLUGGY INTEGRATION
-- Migration SQL Script
-- =====================================================

-- Tabela: pluggy_items
-- Armazena as conexões (Items) com bancos via Pluggy
CREATE TABLE IF NOT EXISTS pluggy_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id TEXT NOT NULL UNIQUE,
  connector_id INTEGER NOT NULL,
  connector_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'UPDATING', 'UPDATED', 'LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT')),
  last_updated_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela: pluggy_accounts
-- Armazena contas bancárias e cartões de crédito
CREATE TABLE IF NOT EXISTS pluggy_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES pluggy_items(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('BANK', 'CREDIT')),
  subtype TEXT,
  name TEXT NOT NULL,
  number TEXT,
  balance NUMERIC(10, 2),
  currency_code TEXT DEFAULT 'BRL',
  credit_limit NUMERIC(10, 2),
  available_credit_limit NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela: pluggy_transactions
-- Armazena transações sincronizadas dos bancos
CREATE TABLE IF NOT EXISTS pluggy_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES pluggy_accounts(id) ON DELETE CASCADE,
  pluggy_transaction_id TEXT NOT NULL UNIQUE,
  expense_id UUID REFERENCES expenses(id),
  description TEXT NOT NULL,
  description_raw TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'POSTED')),
  type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
  category TEXT,
  provider_code TEXT,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_pluggy_items_user_id ON pluggy_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_items_pluggy_item_id ON pluggy_items(pluggy_item_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_items_status ON pluggy_items(status);

CREATE INDEX IF NOT EXISTS idx_pluggy_accounts_user_id ON pluggy_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_accounts_item_id ON pluggy_accounts(item_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_accounts_pluggy_account_id ON pluggy_accounts(pluggy_account_id);

CREATE INDEX IF NOT EXISTS idx_pluggy_transactions_user_id ON pluggy_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_transactions_account_id ON pluggy_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_transactions_date ON pluggy_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_pluggy_transactions_synced ON pluggy_transactions(synced);
CREATE INDEX IF NOT EXISTS idx_pluggy_transactions_pluggy_id ON pluggy_transactions(pluggy_transaction_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE pluggy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pluggy_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pluggy_transactions ENABLE ROW LEVEL SECURITY;

-- Policies para pluggy_items
CREATE POLICY "Users can view own items"
  ON pluggy_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON pluggy_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON pluggy_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON pluggy_items FOR DELETE
  USING (auth.uid() = user_id);

-- Policies para pluggy_accounts
CREATE POLICY "Users can view own accounts"
  ON pluggy_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON pluggy_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON pluggy_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON pluggy_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Policies para pluggy_transactions
CREATE POLICY "Users can view own transactions"
  ON pluggy_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON pluggy_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON pluggy_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON pluggy_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TRIGGERS PARA UPDATED_AT
-- =====================================================

-- Function para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para pluggy_items
DROP TRIGGER IF EXISTS update_pluggy_items_updated_at ON pluggy_items;
CREATE TRIGGER update_pluggy_items_updated_at
    BEFORE UPDATE ON pluggy_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para pluggy_accounts
DROP TRIGGER IF EXISTS update_pluggy_accounts_updated_at ON pluggy_accounts;
CREATE TRIGGER update_pluggy_accounts_updated_at
    BEFORE UPDATE ON pluggy_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMENTÁRIOS DAS TABELAS
-- =====================================================

COMMENT ON TABLE pluggy_items IS 'Conexões com instituições financeiras via Pluggy';
COMMENT ON TABLE pluggy_accounts IS 'Contas bancárias e cartões de crédito sincronizados';
COMMENT ON TABLE pluggy_transactions IS 'Transações bancárias sincronizadas via Open Finance';

COMMENT ON COLUMN pluggy_items.pluggy_item_id IS 'ID único do Item na Pluggy';
COMMENT ON COLUMN pluggy_items.connector_id IS 'ID do conector (banco) na Pluggy';
COMMENT ON COLUMN pluggy_items.status IS 'Status da conexão: PENDING, UPDATING, UPDATED, LOGIN_ERROR, OUTDATED, WAITING_USER_INPUT';

COMMENT ON COLUMN pluggy_accounts.pluggy_account_id IS 'ID único da conta na Pluggy';
COMMENT ON COLUMN pluggy_accounts.type IS 'BANK (conta bancária) ou CREDIT (cartão de crédito)';
COMMENT ON COLUMN pluggy_accounts.subtype IS 'CHECKING_ACCOUNT, SAVINGS_ACCOUNT, CREDIT_CARD, etc.';

COMMENT ON COLUMN pluggy_transactions.pluggy_transaction_id IS 'ID único da transação na Pluggy';
COMMENT ON COLUMN pluggy_transactions.expense_id IS 'Referência ao expense se a transação foi sincronizada';
COMMENT ON COLUMN pluggy_transactions.synced IS 'Indica se a transação foi sincronizada com a tabela expenses';
COMMENT ON COLUMN pluggy_transactions.type IS 'DEBIT (saída) ou CREDIT (entrada)';
COMMENT ON COLUMN pluggy_transactions.status IS 'PENDING (pendente) ou POSTED (confirmada)';

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
