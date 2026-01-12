-- Habilitar extensão pg_net para fazer requisições HTTP do banco
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Tabela para armazenar configurações do sistema
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configurações (ou atualizar se já existirem)
INSERT INTO app_config (key, value) VALUES
  ('supabase_url', 'https://yiwkuqihujjrxejeybeg.supabase.co'),
  ('supabase_service_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpd2t1cWlodWpqcnhlamV5YmVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjMyODk1OCwiZXhwIjoyMDgxOTA0OTU4fQ.fdjCOu3d_ICukc4kl1cld71Abcte29mmPp6TMs9Hw80')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Função que dispara sincronização para todas as contas que precisam
CREATE OR REPLACE FUNCTION trigger_pluggy_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  account_record RECORD;
  supabase_url TEXT;
  anon_key TEXT;
BEGIN
  -- Pegar configurações da tabela
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO anon_key FROM app_config WHERE key = 'supabase_service_key';

  -- Se não tiver configurado, logar e sair
  IF supabase_url IS NULL OR anon_key IS NULL THEN
    RAISE NOTICE 'Configurações não encontradas na tabela app_config';
    RETURN;
  END IF;

  -- Buscar contas que não sincronizaram nas últimas 6 horas
  FOR account_record IN
    SELECT
      pa.id,
      pa.pluggy_account_id,
      pa.user_id
    FROM pluggy_accounts pa
    WHERE pa.last_sync_at < NOW() - INTERVAL '3 hours'
       OR pa.last_sync_at IS NULL
    LIMIT 10 -- Processar no máximo 10 por vez para não sobrecarregar
  LOOP
    -- Fazer requisição HTTP para a Edge Function de sincronização interna
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/pluggy-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'accountId', account_record.pluggy_account_id,
        'userId', account_record.user_id::text
      )
    );

    -- Atualizar last_sync_at para evitar reprocessamento
    UPDATE pluggy_accounts SET last_sync_at = NOW() WHERE id = account_record.id;

    RAISE NOTICE 'Triggered sync for account %', account_record.pluggy_account_id;
  END LOOP;
END;
$$;

-- Remover cron antigo se existir
DO $$
BEGIN
  PERFORM cron.unschedule('check-accounts-sync');
EXCEPTION WHEN OTHERS THEN
  -- Ignora se não existir
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-pluggy');
EXCEPTION WHEN OTHERS THEN
  -- Ignora se não existir
END;
$$;

-- Criar cron job que dispara a sincronização a cada 6 horas
SELECT cron.schedule(
  'auto-sync-pluggy',
  '0 */3 * * *', -- A cada 3 horas (0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00)
  'SELECT trigger_pluggy_sync()'
);

-- Comentário
COMMENT ON FUNCTION trigger_pluggy_sync() IS 'Dispara sincronização automática das contas do Open Finance que não sincronizaram nas últimas 6 horas';
