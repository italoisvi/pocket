-- Função para verificar status das requisições pg_net
CREATE OR REPLACE FUNCTION check_pgnet_requests()
RETURNS TABLE (
  request_id BIGINT,
  created_at TIMESTAMPTZ,
  method TEXT,
  url TEXT,
  status_code INT,
  error_msg TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar se a tabela de histórico do pg_net existe
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'net' AND table_name = '_http_response'
  ) THEN
    RETURN QUERY
    SELECT
      r.id::BIGINT,
      r.created::TIMESTAMPTZ,
      'POST'::TEXT as method,
      ''::TEXT as url,
      r.status_code::INT,
      r.error_msg::TEXT
    FROM net._http_response r
    ORDER BY r.created DESC
    LIMIT 20;
  ELSE
    -- Se não existe, verificar pg_net status
    RAISE NOTICE 'Tabela net._http_response nao encontrada';
    RETURN;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Erro ao verificar pg_net: %', SQLERRM;
  RETURN;
END;
$$;

-- Testar diretamente uma requisição pg_net
CREATE OR REPLACE FUNCTION test_pgnet_request()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  anon_key TEXT;
  request_id BIGINT;
BEGIN
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO anon_key FROM app_config WHERE key = 'supabase_service_key';

  IF supabase_url IS NULL OR anon_key IS NULL THEN
    RETURN 'ERRO: Configuracoes nao encontradas';
  END IF;

  -- Fazer uma requisição de teste
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/check-sync-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object('test', true)
  ) INTO request_id;

  RETURN 'Requisicao enviada com ID: ' || request_id::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERRO: ' || SQLERRM;
END;
$$;
