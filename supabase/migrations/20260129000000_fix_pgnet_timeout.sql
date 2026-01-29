-- Corrige timeout do pg_net: aumenta para 120 segundos (a função pode demorar até 60s)

CREATE OR REPLACE FUNCTION trigger_pluggy_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  account_record RECORD;
  supabase_url TEXT;
  service_key TEXT;
  request_id BIGINT;
  account_count INT := 0;
BEGIN
  RAISE NOTICE '[trigger_pluggy_sync] Iniciando sincronizacao automatica...';

  -- Pegar configurações da tabela
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO service_key FROM app_config WHERE key = 'supabase_service_key';

  -- Se não tiver configurado, logar e sair
  IF supabase_url IS NULL THEN
    RAISE NOTICE '[trigger_pluggy_sync] ERRO: supabase_url nao configurado';
    RETURN;
  END IF;

  IF service_key IS NULL THEN
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
      -- IMPORTANTE: timeout_milliseconds = 120000 (2 minutos) para dar tempo do polling
      SELECT net.http_post(
        url := supabase_url || '/functions/v1/pluggy-sync-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key,
          'apikey', service_key
        ),
        body := jsonb_build_object(
          'accountId', account_record.pluggy_account_id,
          'userId', account_record.user_id::text
        ),
        timeout_milliseconds := 120000
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
