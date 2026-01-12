-- Habilitar extensão pg_cron (se não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Criar tabela para controlar jobs de sincronização
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'pluggy_sync',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar jobs pendentes
CREATE INDEX IF NOT EXISTS sync_jobs_next_run_idx ON sync_jobs(next_run_at, status);
CREATE INDEX IF NOT EXISTS sync_jobs_user_idx ON sync_jobs(user_id);

-- RLS
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync jobs"
  ON sync_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Função para marcar contas que precisam sincronizar
CREATE OR REPLACE FUNCTION check_accounts_need_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Atualizar last_sync_at para contas que não sincronizaram nas últimas 6 horas
  UPDATE pluggy_accounts
  SET updated_at = NOW()
  WHERE last_sync_at < NOW() - INTERVAL '6 hours';

  -- Log
  RAISE NOTICE 'Checked accounts for sync at %', NOW();
END;
$$;

-- Criar cron job para verificar a cada hora (ajustável)
-- Nota: O cron real de sincronização precisa chamar a Edge Function externamente
-- Este job apenas marca contas que precisam sincronizar
SELECT cron.schedule(
  'check-accounts-sync',
  '0 */6 * * *', -- A cada 6 horas
  'SELECT check_accounts_need_sync()'
);

-- Comentário explicativo
COMMENT ON TABLE sync_jobs IS 'Controla jobs de sincronização automática do Open Finance';
