-- Função para verificar status do cron job
CREATE OR REPLACE FUNCTION check_cron_status()
RETURNS TABLE (
  job_id BIGINT,
  job_name TEXT,
  schedule TEXT,
  command TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.jobid::BIGINT,
    j.jobname::TEXT,
    j.schedule::TEXT,
    j.command::TEXT,
    j.active::BOOLEAN
  FROM cron.job j
  WHERE j.jobname LIKE '%pluggy%' OR j.jobname LIKE '%sync%';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension may not be enabled: %', SQLERRM;
  RETURN;
END;
$$;

-- Função para executar sync manualmente (para teste)
CREATE OR REPLACE FUNCTION manual_trigger_sync()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result TEXT;
BEGIN
  PERFORM trigger_pluggy_sync();
  RETURN 'Sync triggered successfully';
EXCEPTION WHEN OTHERS THEN
  RETURN 'Error: ' || SQLERRM;
END;
$$;
