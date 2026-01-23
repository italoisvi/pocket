-- Remove a condição de tempo para sincronizar SEMPRE, independente da última sincronização
-- O cronjob roda a cada 3 horas, então não faz sentido verificar last_sync_at

CREATE OR REPLACE FUNCTION trigger_pluggy_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  account_record RECORD;
  supabase_url TEXT;
  anon_key TEXT;
  request_id BIGINT;
  account_count INT := 0;
BEGIN
  RAISE NOTICE '[trigger_pluggy_sync] Iniciando sincronizacao automatica...';

  -- Pegar configurações da tabela
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO anon_key FROM app_config WHERE key = 'supabase_service_key';

  -- Se não tiver configurado, logar e sair
  IF supabase_url IS NULL THEN
    RAISE NOTICE '[trigger_pluggy_sync] ERRO: supabase_url nao configurado';
    RETURN;
  END IF;

  IF anon_key IS NULL THEN
    RAISE NOTICE '[trigger_pluggy_sync] ERRO: supabase_service_key nao configurado';
    RETURN;
  END IF;

  RAISE NOTICE '[trigger_pluggy_sync] Configuracoes OK. URL: %', supabase_url;

  -- Buscar TODAS as contas ativas (sem filtro de tempo)
  FOR account_record IN
    SELECT
      pa.id,
      pa.pluggy_account_id,
      pa.user_id,
      pa.last_sync_at
    FROM pluggy_accounts pa
    WHERE pa.pluggy_account_id IS NOT NULL
    LIMIT 20 -- Processar no máximo 20 por vez
  LOOP
    BEGIN
      account_count := account_count + 1;

      -- Fazer requisição HTTP para a Edge Function de sincronização
      SELECT net.http_post(
        url := supabase_url || '/functions/v1/pluggy-sync-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := jsonb_build_object(
          'accountId', account_record.pluggy_account_id,
          'userId', account_record.user_id::text
        )
      ) INTO request_id;

      RAISE NOTICE '[trigger_pluggy_sync] Conta % sincronizando (request_id: %, ultima_sync: %)',
                   account_record.pluggy_account_id, request_id, account_record.last_sync_at;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[trigger_pluggy_sync] ERRO ao sincronizar conta %: %',
                   account_record.pluggy_account_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[trigger_pluggy_sync] Concluido. % contas processadas.', account_count;
END;
$$;

-- Verificar se o cron existe e recriar
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-pluggy');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job auto-sync-pluggy nao existia';
END;
$$;

-- Criar cron job que dispara a sincronização a cada 3 horas
SELECT cron.schedule(
  'auto-sync-pluggy',
  '0 */3 * * *', -- A cada 3 horas (0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00 UTC)
  'SELECT trigger_pluggy_sync()'
);

COMMENT ON FUNCTION trigger_pluggy_sync() IS 'Dispara sincronizacao automatica de TODAS as contas do Open Finance a cada 3 horas.';
