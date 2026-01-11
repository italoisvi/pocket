-- Adicionar campo de última sincronização às contas do Open Finance
ALTER TABLE pluggy_accounts
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Atualizar registros existentes para usar a data de criação como última sincronização
UPDATE pluggy_accounts
SET last_sync_at = COALESCE(updated_at, created_at, NOW())
WHERE last_sync_at IS NULL;

-- Criar índice para busca eficiente
CREATE INDEX IF NOT EXISTS pluggy_accounts_last_sync_idx ON pluggy_accounts(last_sync_at);

-- Comentário explicativo
COMMENT ON COLUMN pluggy_accounts.last_sync_at IS 'Data da última sincronização com o Open Finance. Gastos registrados após essa data são considerados não sincronizados.';
