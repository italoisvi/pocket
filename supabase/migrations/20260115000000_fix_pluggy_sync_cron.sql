-- Corrige a função de sync automático para NÃO atualizar last_sync_at prematuramente
-- O problema: A função SQL atualizava last_sync_at ANTES da Edge Function completar
-- causando race conditions e impedindo retry em caso de falha

-- Recriar a função corrigida
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
BEGIN
  -- Pegar configurações da tabela
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO anon_key FROM app_config WHERE key = 'supabase_service_key';

  -- Se não tiver configurado, logar e sair
  IF supabase_url IS NULL OR anon_key IS NULL THEN
    RAISE NOTICE '[trigger_pluggy_sync] Configuracoes nao encontradas na tabela app_config';
    RETURN;
  END IF;

  -- Buscar contas que não sincronizaram nas últimas 3 horas
  FOR account_record IN
    SELECT
      pa.id,
      pa.pluggy_account_id,
      pa.user_id,
      pa.last_sync_at
    FROM pluggy_accounts pa
    WHERE pa.last_sync_at < NOW() - INTERVAL '3 hours'
       OR pa.last_sync_at IS NULL
    LIMIT 10 -- Processar no máximo 10 por vez para não sobrecarregar
  LOOP
    BEGIN
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

      RAISE NOTICE '[trigger_pluggy_sync] Disparada sincronizacao para conta % (request_id: %, last_sync: %)',
                   account_record.pluggy_account_id, request_id, account_record.last_sync_at;

      -- IMPORTANTE: NÃO atualizar last_sync_at aqui!
      -- A Edge Function vai atualizar quando completar COM SUCESSO
      -- Isso garante retry automático em caso de falha

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[trigger_pluggy_sync] Erro ao sincronizar conta %: %',
                   account_record.pluggy_account_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION trigger_pluggy_sync() IS 'Dispara sincronizacao automatica das contas do Open Finance. last_sync_at e atualizado pela Edge Function apos sucesso.';
