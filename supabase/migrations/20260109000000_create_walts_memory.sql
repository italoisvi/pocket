-- Tabela para armazenar memória e preferências do usuário aprendidas pelo Walts
CREATE TABLE public.walts_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  memory_type text NOT NULL CHECK (memory_type = ANY (ARRAY['preference'::text, 'context'::text, 'insight'::text])),
  key text NOT NULL,
  value jsonb NOT NULL,
  confidence numeric NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone,
  use_count integer NOT NULL DEFAULT 0,
  CONSTRAINT walts_memory_pkey PRIMARY KEY (id),
  CONSTRAINT walts_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT walts_memory_user_key_unique UNIQUE (user_id, memory_type, key)
);

-- Índices para melhor performance
CREATE INDEX walts_memory_user_id_idx ON public.walts_memory(user_id);
CREATE INDEX walts_memory_type_idx ON public.walts_memory(memory_type);
CREATE INDEX walts_memory_last_used_idx ON public.walts_memory(last_used_at DESC);

-- RLS (Row Level Security)
ALTER TABLE public.walts_memory ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver apenas suas próprias memórias
CREATE POLICY "Users can view their own memories"
  ON public.walts_memory
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Usuários podem inserir suas próprias memórias
CREATE POLICY "Users can insert their own memories"
  ON public.walts_memory
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem atualizar suas próprias memórias
CREATE POLICY "Users can update their own memories"
  ON public.walts_memory
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Política: Usuários podem deletar suas próprias memórias
CREATE POLICY "Users can delete their own memories"
  ON public.walts_memory
  FOR DELETE
  USING (auth.uid() = user_id);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_walts_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_walts_memory_updated_at
  BEFORE UPDATE ON public.walts_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_walts_memory_updated_at();

-- Comentários para documentação
COMMENT ON TABLE public.walts_memory IS 'Armazena preferências e contextos aprendidos pelo Walts Agent';
COMMENT ON COLUMN public.walts_memory.memory_type IS 'Tipo de memória: preference (preferência), context (contexto), insight (insight aprendido)';
COMMENT ON COLUMN public.walts_memory.key IS 'Chave identificadora da memória (ex: favorite_category, spending_pattern, etc)';
COMMENT ON COLUMN public.walts_memory.value IS 'Valor da memória em formato JSON';
COMMENT ON COLUMN public.walts_memory.confidence IS 'Nível de confiança da memória (0.0 a 1.0)';
COMMENT ON COLUMN public.walts_memory.source IS 'Fonte/contexto de onde a memória foi aprendida';
COMMENT ON COLUMN public.walts_memory.use_count IS 'Número de vezes que esta memória foi utilizada';
