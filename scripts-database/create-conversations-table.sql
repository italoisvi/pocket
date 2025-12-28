-- Criar tabela para armazenar conversas do chat por usuário
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Criar índice para buscar conversas por usuário
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Criar índice para ordenar por data de atualização
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Habilitar Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

-- Política: Usuários só podem ver suas próprias conversas
CREATE POLICY "Users can view their own conversations"
  ON conversations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Usuários só podem inserir suas próprias conversas
CREATE POLICY "Users can insert their own conversations"
  ON conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuários só podem atualizar suas próprias conversas
CREATE POLICY "Users can update their own conversations"
  ON conversations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Política: Usuários só podem deletar suas próprias conversas
CREATE POLICY "Users can delete their own conversations"
  ON conversations
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE conversations IS 'Armazena conversas do chat Walts individualizadas por usuário';
COMMENT ON COLUMN conversations.id IS 'ID único da conversa (timestamp)';
COMMENT ON COLUMN conversations.user_id IS 'ID do usuário dono da conversa';
COMMENT ON COLUMN conversations.title IS 'Título da conversa (primeiras palavras)';
COMMENT ON COLUMN conversations.messages IS 'Array de mensagens em formato JSON';
COMMENT ON COLUMN conversations.created_at IS 'Timestamp de criação (milliseconds)';
COMMENT ON COLUMN conversations.updated_at IS 'Timestamp da última atualização (milliseconds)';
