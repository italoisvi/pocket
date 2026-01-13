-- Tabela para logar ações executadas pelo Walts Agent
-- Usada para analytics, debugging e aprendizado (Fase 4)
CREATE TABLE IF NOT EXISTS public.agent_actions_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  action_type text NOT NULL DEFAULT 'tool_call',
  tool_name text NOT NULL,
  input_params jsonb,
  output_result jsonb,
  execution_time_ms integer,
  status text NOT NULL CHECK (status = ANY (ARRAY['success', 'error', 'pending'])),
  user_feedback text CHECK (user_feedback = ANY (ARRAY['positive', 'negative', 'neutral'])),
  feedback_comment text,
  feedback_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT agent_actions_log_pkey PRIMARY KEY (id),
  CONSTRAINT agent_actions_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS agent_actions_log_user_id_created_at_idx
  ON public.agent_actions_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_actions_log_session_id_idx
  ON public.agent_actions_log(session_id);

CREATE INDEX IF NOT EXISTS agent_actions_log_tool_name_idx
  ON public.agent_actions_log(tool_name);

CREATE INDEX IF NOT EXISTS agent_actions_log_user_feedback_idx
  ON public.agent_actions_log(user_feedback)
  WHERE user_feedback IS NOT NULL;

-- RLS
ALTER TABLE public.agent_actions_log ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver apenas seus próprios logs
CREATE POLICY "Users can view their own action logs"
  ON public.agent_actions_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Permitir INSERT via service role (Edge Functions)
-- Edge Functions usam service role, então não precisa de política específica para INSERT
-- Mas adicionamos para completude
CREATE POLICY "Service can insert action logs"
  ON public.agent_actions_log
  FOR INSERT
  WITH CHECK (true);

-- Política: Usuários podem atualizar feedback dos próprios logs
CREATE POLICY "Users can update feedback on their logs"
  ON public.agent_actions_log
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Comentários
COMMENT ON TABLE public.agent_actions_log IS 'Log de ações executadas pelo Walts Agent para analytics e aprendizado';
COMMENT ON COLUMN public.agent_actions_log.session_id IS 'Agrupa ações de uma mesma conversa/sessão';
COMMENT ON COLUMN public.agent_actions_log.action_type IS 'Tipo de ação (tool_call, proactive_alert, etc)';
COMMENT ON COLUMN public.agent_actions_log.tool_name IS 'Nome da ferramenta executada';
COMMENT ON COLUMN public.agent_actions_log.input_params IS 'Parâmetros de entrada da ferramenta (JSONB)';
COMMENT ON COLUMN public.agent_actions_log.output_result IS 'Resultado da execução (JSONB)';
COMMENT ON COLUMN public.agent_actions_log.execution_time_ms IS 'Tempo de execução em milissegundos';
COMMENT ON COLUMN public.agent_actions_log.user_feedback IS 'Feedback do usuário (positive/negative/neutral)';
