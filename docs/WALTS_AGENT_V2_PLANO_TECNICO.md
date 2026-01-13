# 🤖 WALTS AGENT V2 - PLANO DE IMPLEMENTAÇÃO TÉCNICO

**Versão:** 2.0  
**Data:** Janeiro 2025  
**Duração Estimada:** 4 semanas  
**Objetivo:** Transformar Walts em um agente autônomo com memória, raciocínio e ação proativa

---

## 📋 CONTEXTO DO PROJETO ATUAL

### O que já existe no Pocket:

- ✅ Base de dados Supabase com tabelas: `expenses`, `budgets`, `profiles`, `conversations`, `walts_memory`
- ✅ Sistema de Open Finance com Pluggy funcionando
- ✅ Chat básico usando DeepSeek (`lib/deepseek.ts`)
- ✅ Edge Functions para categorização e análises
- ✅ Estrutura de memória simples (tabela `walts_memory` com key-value)
- ✅ App React Native com Expo SDK 54

### O que está faltando (e será implementado):

- ❌ Sistema de raciocínio ReAct (Reasoning + Acting)
- ❌ Memória semântica com busca vetorial (pgvector)
- ❌ Orquestração inteligente de tools com OpenAI function calling
- ❌ Sistema proativo (background tasks + action cards)
- ❌ Aprendizado contínuo baseado em feedback
- ❌ Contexto dinâmico (só carrega o que é relevante)

---

## 🏗️ ARQUITETURA PROPOSTA

### Padrão ReAct (Reason → Act → Observe)

```
Loop do Agente:
WHILE não terminou AND iterações < 5:
  1. REASON (Raciocinar):
     - Buscar contexto relevante (memórias + dados financeiros)
     - Construir prompt com contexto
     - Chamar GPT-4o com função calling habilitada

  2. ACT (Agir):
     - Se GPT retornar tool_calls:
       → Executar cada tool
       → Salvar resultados
       → CONTINUAR loop

  3. OBSERVE (Observar):
     - Se GPT retornar mensagem final:
       → Salvar na memória
       → Retornar resposta
       → SAIR do loop
```

### Camadas do Sistema

```
MOBILE (React Native + Expo)
  ├─ Chat Interface
  ├─ Action Cards (proativo)
  └─ Background Worker (expo-task-manager)
        ↓↑ HTTPS
EDGE FUNCTIONS (Supabase Deno)
  ├─ walts-agent-v2 (orquestrador)
  ├─ walts-proactive-check (análise background)
  └─ walts-learn (aprendizado)
        ↓↑ SQL/RPC
DATABASE (PostgreSQL + pgvector)
  ├─ Tabelas existentes
  ├─ agent_memory_vectors (novo - embeddings)
  ├─ agent_actions_log (novo - histórico)
  └─ agent_state (novo - estado persistente)
        ↓↑ REST API
AI LAYER
  ├─ OpenAI GPT-4o (reasoning)
  ├─ OpenAI text-embedding-3-small (memória)
  └─ DeepSeek (backup)
```

---

## 📦 FASE 1: CORE DO AGENTE (Semana 1)

### Objetivo

Criar o motor central do agente com ReAct loop, system de tools e integração OpenAI GPT-4o.

---

### 1.1 - Banco de Dados: Criar Tabelas de Memória Vetorial

**Arquivo:** `supabase/migrations/20260115000000_create_vector_memory.sql`

**O que fazer:**

1. Ativar extensão `vector` do Postgres (pgvector)
2. Criar tabela `agent_memory_vectors` com:
   - Colunas: `id`, `user_id`, `content` (TEXT), `embedding` (vector(1536)), `metadata` (JSONB)
   - Índice IVFFlat para busca vetorial eficiente
   - RLS policies para segurança
3. Criar função RPC `search_similar_memories` que:
   - Recebe: `query_embedding` (vector), `match_threshold` (float), `match_count` (int), `filter_user_id` (uuid)
   - Retorna: Top K memórias mais similares usando distância de cosseno
   - SQL: `1 - (embedding <=> query_embedding)` para calcular similaridade
4. Criar trigger para atualizar `last_accessed_at` e `access_count` quando memória é usada

**Pontos críticos:**

- Vector dimension DEVE ser 1536 (OpenAI text-embedding-3-small)
- Usar `vector_cosine_ops` no índice (mais rápido para embeddings normalizados)
- `lists = 100` no IVFFlat é adequado para ~10k vetores (ajustar se crescer)
- SEMPRE filtrar por `user_id` na busca (segurança + performance)

---

### 1.2 - Banco de Dados: Log de Ações do Agente

**Arquivo:** `supabase/migrations/20260115000001_create_agent_actions_log.sql`

**O que fazer:**

1. Criar tabela `agent_actions_log` com:
   - Colunas: `id`, `user_id`, `session_id`, `action_type`, `tool_name`, `input_params` (JSONB), `output_result` (JSONB)
   - Colunas de feedback: `user_feedback` (enum: positive/negative/neutral), `feedback_comment`
   - Métricas: `execution_time_ms`, `status` (success/error/pending)
2. Criar índices em:
   - `user_id` + `created_at` (queries de histórico do usuário)
   - `tool_name` (análise de performance por tool)
   - `user_feedback` WHERE NOT NULL (aprendizado)
3. Criar função RPC `log_agent_action` com `SECURITY DEFINER` para permitir Edge Functions gravarem

**Pontos críticos:**

- Usar JSONB para flexibilidade (cada tool tem params diferentes)
- `session_id` agrupa ações de uma mesma conversa
- Não colocar RLS no INSERT (edge functions precisam escrever)
- Feedback é opcional inicialmente (fase 4 vai usar)

---

### 1.3 - Banco de Dados: Estado Persistente do Agente

**Arquivo:** `supabase/migrations/20260115000002_create_agent_state.sql`

**O que fazer:**

1. Criar tabela `agent_state` (1 linha por usuário):
   - `long_term_goals` (JSONB array): ["economizar R$ 1000/mês", "quitar cartão"]
   - `pending_tasks` (JSONB array): [{"task": "revisar orçamentos", "deadline": "..."}]
   - `last_proactive_check` (timestamp): última vez que rodou análise background
   - `agent_config` (JSONB): {"proactive_enabled": true, "notification_frequency": "daily"}
2. Trigger `updated_at` automático
3. Função `init_agent_state` para criar estado inicial na primeira interação

**Pontos críticos:**

- UNIQUE constraint em `user_id` (só 1 linha por usuário)
- Default config deve ter `proactive_enabled: true`
- Essa tabela será muito usada na Fase 3 (proativo)

---

### 1.4 - Banco de Dados: Funções RPC Auxiliares

**Arquivo:** `supabase/migrations/20260115000003_create_rpc_functions.sql`

**O que fazer:**

1. Criar função `get_user_financial_context(user_id UUID) RETURNS JSONB`:
   - Busca renda total do mês (assumindo que há tabela `incomes` ou similar)
   - Busca gastos totais do mês atual (`expenses` WHERE `date_trunc('month', date) = current_month`)
   - Busca orçamentos com quanto foi gasto em cada
   - Busca últimos 10 gastos
   - Retorna tudo em um único JSON: `{total_income, total_expenses, balance, budgets: [...], recent_expenses: [...]}`

2. Criar função `cleanup_old_memories(days_old INT)`:
   - Remove memórias com `created_at < NOW() - days_old` E `access_count = 0`
   - Retorna quantidade deletada
   - Para manutenção (rodar via cron mensal)

**Pontos críticos:**

- `get_user_financial_context` será chamada MUITAS vezes - otimizar queries
- Use `COALESCE(SUM(...), 0)` para evitar NULL
- Adicionar índices em `expenses.date` e `budgets.user_id` se não existirem

---

### 1.5 - Módulo Compartilhado: Types TypeScript

**Arquivo:** `supabase/functions/_shared/types.ts`

**O que fazer:**
Definir todas as interfaces TypeScript compartilhadas entre Edge Functions:

1. `Message` interface:
   - `role`: 'user' | 'assistant' | 'system' | 'tool'
   - `content`: string
   - `tool_calls?`: array de ToolCall
   - `tool_call_id?`: string (para respostas de tools)

2. `ToolCall` interface (formato OpenAI):
   - `id`, `type: 'function'`, `function: {name, arguments}`

3. `AgentContext` interface:
   - `userId`, `sessionId`
   - `financial`: FinancialContext
   - `memories`: Memory[]
   - `preferences`: Preference[]

4. Demais interfaces para estruturar dados

**Pontos críticos:**

- Seguir EXATAMENTE o formato de tool calling do OpenAI (documentação oficial)
- Usar tipos opcionais (`?`) onde apropriado
- Exportar tudo para reusar em múltiplas funções

---

### 1.6 - Módulo Compartilhado: Cliente OpenAI

**Arquivo:** `supabase/functions/_shared/openai-client.ts`

**O que fazer:**

1. Importar OpenAI SDK: `https://deno.land/x/openai@v4.20.1/mod.ts`
2. Criar singleton `getOpenAIClient()`:
   - Lê `Deno.env.get('OPENAI_API_KEY')`
   - Retorna instância única de OpenAI
3. Criar wrapper `createChatCompletion`:
   - Aceita: messages, tools (opcional), options
   - Default model: 'gpt-4o'
   - Default temperature: 0.7
   - Max tokens: 2000
   - Se `tools` fornecido: adiciona `tool_choice: 'auto'`
   - Faz logging de tempo de execução e finish_reason
   - Retorna completion

**Pontos críticos:**

- NUNCA expor API key no código (sempre `Deno.env`)
- Logar SEMPRE tempo de execução (para monitorar custos)
- Adicionar try-catch robusto
- Fazer retry em rate limit (429) com exponential backoff

---

### 1.7 - Módulo Compartilhado: Embeddings e Memória

**Arquivo:** `supabase/functions/_shared/embeddings.ts`

**O que fazer:**

1. Função `generateEmbedding(text: string)`:
   - Chama `openai.embeddings.create` com model `text-embedding-3-small`
   - Retorna array de 1536 floats
   - Logar tempo de execução

2. Função `saveToMemory(userId, supabase, options)`:
   - Gera embedding do `options.content`
   - Insere em `agent_memory_vectors` com metadata `{type: options.type, ...}`
   - Retorna ID da memória salva

3. Função `searchMemory(supabase, options)`:
   - Gera embedding da `options.query`
   - Chama RPC `search_similar_memories`
   - Retorna array de memórias similares com score

**Pontos críticos:**

- text-embedding-3-small é MUITO mais barato que ada-002 (considerar 3-large se precisar mais precisão)
- Normalizar textos antes de gerar embedding (lowercase, trim, remover caracteres especiais)
- Threshold default de 0.7 é bom, mas pode ajustar baseado em testes
- SEMPRE filtrar por user_id na busca (NUNCA retornar memórias de outros usuários)

---

### 1.8 - Core: System Prompts

**Arquivo:** `supabase/functions/walts-agent-v2/prompts.ts`

**O que fazer:**

1. Criar constante `SYSTEM_PROMPT` com:
   - Identidade: "Você é Walts, agente financeiro autônomo..."
   - Capacidades: listar todas as tools disponíveis
   - Diretrizes de uso de tools (QUANDO usar cada uma)
   - Estilo de resposta (conciso, markdown, emojis moderados)
   - Exemplos de interações (criar gasto, análise, usar memória)
   - Limitações (não pode fazer transações reais, max 5 tool calls)

2. Criar função `buildSystemMessage(context)`:
   - Recebe: `{financial?, memories?, preferences?, thoughts?}`
   - Concatena SYSTEM_PROMPT base com:
     - Seção de contexto financeiro (JSON do RPC)
     - Seção de memórias relevantes (lista bullet points)
     - Seção de preferências do usuário
     - Seção de pensamentos/ações já executadas nesta conversa
   - Retorna string completa

**Pontos críticos:**

- Prompt deve ter ~2000-3000 tokens (não explodir contexto)
- Ser MUITO específico sobre quando usar tools (evitar alucinações)
- Dar exemplos de formatos esperados de resposta
- Mencionar explicitamente que pode usar múltiplas tools em sequência
- Deixar claro o limite de 5 iterações (evitar loops infinitos)

---

### 1.9 - Core: Registry de Tools

**Arquivo:** `supabase/functions/walts-agent-v2/tools/registry.ts`

**O que fazer:**
Criar array `TOOL_DEFINITIONS` com objetos no formato OpenAI function calling.

Cada tool DEVE ter:

- `type: 'function'`
- `function.name`: nome snake_case
- `function.description`: MUITO descritiva (quando usar, o que retorna)
- `function.parameters`: JSON Schema completo com:
  - `type: 'object'`
  - `properties`: cada parâmetro com tipo e descrição
  - `required`: array de params obrigatórios

**Tools a definir (mínimo Fase 1):**

1. `get_financial_context`: sem params, retorna contexto completo
2. `search_memory`: param `query` (string)
3. `save_user_preference`: params `key`, `value`, `confidence`
4. `create_expense`: params `establishment_name`, `amount`, `date?`, `category?`, `notes?`
5. `create_budget`: params `category_id`, `amount`, `period_type`, `notifications_enabled`
6. `check_budget_status`: param `category_id?` (opcional)
7. `sync_open_finance`: params `days?`, `account_id?`

Adicionar mais conforme necessário (analyze_pattern, suggest_savings, forecast_month_end - podem ser Fase 2)

**Pontos críticos:**

- Descrições PRECISAM ser claras (GPT usa isso pra decidir qual tool usar)
- Exemplos de valores nos `description` ajudam muito
- Usar enums quando há valores fixos (ex: category_id)
- Evitar ambiguidade (duas tools fazendo coisas similares)
- Default values quando faz sentido

---

### 1.10 - Core: Executor de Tools

**Arquivo:** `supabase/functions/walts-agent-v2/tools/executor.ts`

**O que fazer:**

1. Criar função `executeTool(toolName, parameters, context)`:
   - `context` tem: `userId`, `sessionId`, `supabase`
   - Usa switch/case para rotear para implementação específica
   - Mede tempo de execução (startTime, endTime)
   - Envolve em try-catch
   - Sempre chama `logAction` no final (sucesso ou erro)
   - Retorna: `{success, data?, error?, execution_time_ms}`

2. Criar funções auxiliares:
   - `isFinancialTool(name)`: true se for expenses, budgets, analysis
   - `isOpenFinanceTool(name)`: true se for sync, statements
   - `isMemoryTool(name)`: true se for search/save memory
   - `logAction`: wrapper para chamar RPC `log_agent_action`

3. Implementar roteamento:
   ```typescript
   if (isFinancialTool(toolName)) {
     result = await executeFinancialTool(toolName, params, context);
   } else if (isOpenFinanceTool(toolName)) {
     result = await executeOpenFinanceTool(toolName, params, context);
   } else if (isMemoryTool(toolName)) {
     result = await executeMemoryTool(toolName, params, context);
   }
   ```

**Pontos críticos:**

- SEMPRE logar ação (mesmo em erro) para analytics
- Não deixar exceções subirem sem tratamento
- Timeouts: se tool demorar >30s, abortar e retornar erro
- Validar params básicos (user_id nunca null, amounts positivos, etc)

---

### 1.11 - Core: Implementação de Financial Tools

**Arquivo:** `supabase/functions/walts-agent-v2/tools/financial-tools.ts`

**O que fazer:**
Implementar cada tool financeira. Exemplos:

1. **`get_financial_context`:**
   - Chamar RPC `get_user_financial_context(userId)`
   - Retornar JSON direto

2. **`create_expense`:**
   - Inserir em `expenses` table com dados do param
   - Se `date` não fornecido, usar `new Date().toISOString()`
   - Se `category` não fornecido, usar 'outros' (ou chamar categorização automática)
   - Retornar: `{success: true, expense_id, amount}`

3. **`create_budget`:**
   - Validar se categoria existe
   - Calcular `start_date` e `end_date` baseado em `period_type`
   - Inserir em `budgets` table
   - Retornar: `{success: true, budget_id}`

4. **`check_budget_status`:**
   - Se `category_id` fornecido: buscar apenas aquele budget
   - Senão: buscar todos budgets do usuário
   - Para cada budget:
     - Calcular quanto foi gasto (SUM de expenses naquele período)
     - Calcular porcentagem: `(spent / limit) * 100`
     - Calcular saldo: `limit - spent`
   - Retornar array: `[{category, spent, limit, percentage, remaining}]`

**Pontos críticos:**

- Validar SEMPRE user_id (nunca permitir acesso cross-user)
- Amounts sempre como number/decimal (nunca string na lógica)
- Datas em ISO format
- Erros descritivos (ex: "Budget já existe para esta categoria")

---

### 1.12 - Core: Implementação de Memory Tools

**Arquivo:** `supabase/functions/walts-agent-v2/tools/memory-tools.ts`

**O que fazer:**

1. **`search_memory(query)`:**
   - Chamar `searchMemory` de `_shared/embeddings.ts`
   - Passar query, userId, limit=5, threshold=0.7
   - Retornar array de memórias com conteúdo e similaridade

2. **`save_user_preference(key, value, confidence)`:**
   - Validar key (sem espaços, lowercase, snake_case)
   - Salvar em DUAS tabelas:
     - `walts_memory` (tabela existente) com `memory_type='preference'`
     - `agent_memory_vectors` (para busca semântica)
   - Content para embedding: `"Preferência do usuário: {key} = {JSON.stringify(value)}"`
   - Retornar: `{success: true, key, saved_at}`

**Pontos críticos:**

- Preferências devem ser buscáveis semanticamente ("meta de economia" deve achar "savings_goal")
- Upsert em `walts_memory` (se key já existe, atualizar)
- Confidence score: 1.0 para afirmações diretas, 0.7-0.9 para inferências
- Metadados úteis: timestamp, source (ex: "conversation_2026-01-15")

---

### 1.13 - Core: Context Builder

**Arquivo:** `supabase/functions/walts-agent-v2/context-builder.ts`

**O que fazer:**
Criar função `buildContext(messages, thoughts, userId, supabase)` que retorna array de mensagens para OpenAI:

1. Buscar contexto financeiro:

   ```typescript
   const financial = await supabase.rpc('get_user_financial_context', {
     p_user_id: userId,
   });
   ```

2. Buscar memórias relevantes:

   ```typescript
   const lastUserMsg = messages[messages.length - 1].content;
   const memories = await searchMemory(supabase, {
     query: lastUserMsg,
     userId,
     limit: 5,
   });
   ```

3. Buscar preferências:

   ```typescript
   const { data: prefs } = await supabase
     .from('walts_memory')
     .select('*')
     .eq('user_id', userId)
     .eq('memory_type', 'preference');
   ```

4. Montar mensagens:
   ```typescript
   return [
     {
       role: 'system',
       content: buildSystemMessage({financial, memories, preferences: prefs, thoughts})
     },
     ...messages.map(m => ({role: m.role, content: m.content, ...}))
   ]
   ```

**Pontos críticos:**

- Contexto deve ser dinâmico (só incluir o relevante)
- Se sem memórias relevantes, não incluir seção vazia
- Limitar tamanho total do prompt (~8k tokens para deixar espaço pra response)
- Cache quando possível (se usuário fizer múltiplas perguntas seguidas, não rebuscar financial context)

---

### 1.14 - Core: ReAct Loop

**Arquivo:** `supabase/functions/walts-agent-v2/react-loop.ts`

**O que fazer:**
Implementar a função principal `reactLoop(messages, userId, supabase)`:

```typescript
async function reactLoop(messages, userId, supabase) {
  const sessionId = crypto.randomUUID();
  const thoughts: AgentThought[] = [];
  const maxIterations = 5;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // 1. REASON: Build context
    const contextMessages = await buildContext(
      messages,
      thoughts,
      userId,
      supabase
    );

    // 2. Call GPT-4o
    const completion = await createChatCompletion(
      contextMessages,
      TOOL_DEFINITIONS,
      { model: 'gpt-4o', temperature: 0.7 }
    );

    const response = completion.choices[0].message;

    // 3. ACT: Execute tools if any
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        const result = await executeTool(
          toolCall.function.name,
          JSON.parse(toolCall.function.arguments),
          { userId, sessionId, supabase }
        );

        thoughts.push({
          tool: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
          output: result,
        });
      }
      // Continue loop to let GPT see tool results
      continue;
    }

    // 4. OBSERVE: No more tools, return final response
    const finalMessage = response.content;

    // Save conversation to memory
    await saveToMemory(userId, supabase, {
      content: `User: ${messages[messages.length - 1].content}\nWalts: ${finalMessage}`,
      type: 'conversation',
    });

    return {
      message: finalMessage,
      thoughts,
      actions: thoughts.map((t) => t.tool),
      session_id: sessionId,
    };
  }

  throw new Error('Max iterations reached without completion');
}
```

**Pontos críticos:**

- Max 5 iterações evita loops infinitos
- Salvar thoughts a cada iteração (para debugging)
- Se chegar no max sem resposta final: retornar erro amigável
- Tool results devem ser adicionados como mensagens `role: 'tool'` no próximo loop
- Session ID agrupa todas as ações desta conversa

---

### 1.15 - Core: Entry Point (Index)

**Arquivo:** `supabase/functions/walts-agent-v2/index.ts`

**O que fazer:**
Criar o handler HTTP principal:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reactLoop } from './react-loop.ts';

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Autenticar
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      });
    }

    // 2. Parse body
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), {
        status: 400,
      });
    }

    // 3. Run ReAct loop
    const result = await reactLoop(messages, user.id, supabase);

    // 4. Return response
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('[walts-agent-v2] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
```

**Pontos críticos:**

- SEMPRE autenticar (sem JWT válido, retornar 401)
- Validar input (messages deve ser array não vazio)
- Try-catch global para pegar qualquer erro
- Logging adequado para debugging
- Response sempre JSON com Content-Type correto
- CORS headers para permitir chamadas do mobile

---

### 1.16 - Deploy e Testes

**O que fazer:**

1. **Configurar variáveis de ambiente:**

   ```bash
   # No Supabase Dashboard > Edge Functions > Secrets
   OPENAI_API_KEY=sk-...
   SUPABASE_URL=https://...
   SUPABASE_ANON_KEY=eyJ...
   ```

2. **Deploy:**

   ```bash
   supabase functions deploy walts-agent-v2
   ```

3. **Testar localmente (opcional):**

   ```bash
   supabase functions serve walts-agent-v2
   # Em outro terminal:
   curl -X POST http://localhost:54321/functions/v1/walts-agent-v2 \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"messages": [{"role": "user", "content": "Quanto gastei esse mês?"}]}'
   ```

4. **Testar no mobile:**
   - Criar cliente simples em `lib/walts-agent-client.ts`:
     ```typescript
     export async function sendMessageToAgent(messages: Message[]) {
       const session = await supabase.auth.getSession();
       const response = await supabase.functions.invoke('walts-agent-v2', {
         body: { messages },
         headers: {
           Authorization: `Bearer ${session.data.session?.access_token}`,
         },
       });
       return response.data;
     }
     ```
   - Testar no chat atual do app

**Critérios de sucesso Fase 1:**

- ✅ Agente responde perguntas usando get_financial_context
- ✅ Agente executa create_expense quando solicitado
- ✅ Agente busca e usa memórias de conversas passadas
- ✅ Agente salva preferências do usuário
- ✅ Logs aparecem em agent_actions_log
- ✅ Tempo de resposta < 5 segundos (maioria dos casos)

---

## 📦 FASE 2: SISTEMA DE MEMÓRIA AVANÇADO (Semana 2)

### Objetivo

Otimizar e expandir o sistema de memória com funcionalidades avançadas.

---

### 2.1 - Otimização de Busca Vetorial

**O que fazer:**

1. Ajustar índice IVFFlat baseado em volume real:
   - Se >10k memórias: aumentar `lists` para 200
   - Se >100k memórias: considerar migrar para HNSW

   ```sql
   -- Recriar índice com mais lists
   DROP INDEX IF EXISTS agent_memory_vectors_embedding_idx;
   CREATE INDEX agent_memory_vectors_embedding_idx
   ON agent_memory_vectors
   USING ivfflat (embedding vector_cosine_ops)
   WITH (lists = 200);
   ```

2. Implementar cache de embeddings frequentes:
   - Queries repetidas (ex: "gastos do mês") devem ter embedding cacheado
   - Cache em Redis/Upstash ou AsyncStorage (mobile)

3. Adicionar índice em metadata para filtros específicos:
   ```sql
   CREATE INDEX agent_memory_metadata_type_idx
   ON agent_memory_vectors((metadata->>'type'));
   ```

**Pontos críticos:**

- Rebuild de índice IVFFlat exige VACUUM ANALYZE depois
- Cache TTL: 1 hora (embeddings não mudam)
- Monitorar tamanho da tabela (1M vetores ~2GB)

---

### 2.2 - Contexto Inteligente (Compressão)

**O que fazer:**
Implementar `compressContext()` em `context-builder.ts`:

1. Se contexto total > 6000 tokens:
   - Remover memórias com menor similaridade (threshold dinâmico)
   - Resumir dados financeiros (só totais, sem breakdown detalhado)
   - Remover thoughts mais antigos (manter só últimos 3)

2. Usar tiktoken para contar tokens real:

   ```typescript
   import { encoding_for_model } from 'tiktoken';
   const enc = encoding_for_model('gpt-4o');
   const tokens = enc.encode(text).length;
   ```

3. Priorizar informações:
   - Última mensagem do usuário: SEMPRE incluir
   - Contexto financeiro: SEMPRE incluir (mas pode resumir)
   - Memórias: incluir top 3-5 mais relevantes
   - Preferências: incluir top 5 mais usadas
   - Thoughts: últimos 3

**Pontos críticos:**

- Nunca comprimir a ponto de perder informação crítica
- Logar quando compressão acontecer (para debugging)
- Testar com prompts longos (10k+ tokens)

---

### 2.3 - Memória Episódica (Conversas Completas)

**O que fazer:**

1. Modificar `saveToMemory` para salvar conversas completas:

   ```typescript
   // Ao final de cada conversa bem-sucedida:
   await saveToMemory(userId, supabase, {
     content: summarizeConversation(messages), // Resumo gerado por GPT
     type: 'conversation',
     metadata: {
       session_id: sessionId,
       messages_count: messages.length,
       tools_used: thoughts.map((t) => t.tool),
       timestamp: new Date().toISOString(),
     },
   });
   ```

2. Criar função `summarizeConversation`:
   - Chama GPT-4o-mini (mais barato) com prompt:
     "Resuma em 2-3 frases a conversa a seguir: [messages]"
   - Retorna resumo textual

3. Na busca de memória, priorizar:
   - Conversas recentes (últimos 7 dias) com peso +0.1 no score
   - Conversas onde usuário deu feedback positivo: peso +0.2

**Pontos críticos:**

- Resumos devem ser informativos (não genéricos tipo "usuário perguntou sobre gastos")
- Incluir valores e decisões importantes no resumo
- Batch summarization: resumir 10 conversas de uma vez (mais eficiente)

---

### 2.4 - Esquecimento Seletivo (Pruning)

**O que fazer:**
Implementar lógica de "esquecer" memórias irrelevantes:

1. Criar função `pruneMemories()` que roda diariamente:

   ```typescript
   // Deletar memórias que:
   // - Têm mais de 90 dias
   // - E access_count = 0 (nunca foram usadas)
   // - E similarity média com conversas recentes < 0.5

   DELETE FROM agent_memory_vectors
   WHERE user_id = $1
     AND created_at < NOW() - INTERVAL '90 days'
     AND access_count = 0
   ```

2. Criar score de "importância":

   ```sql
   -- Coluna calculada
   importance_score =
     (access_count * 0.3) +
     (CASE WHEN metadata->>'type' = 'preference' THEN 0.5 ELSE 0 END) +
     (1 / EXTRACT(day FROM NOW() - created_at) * 0.2)
   ```

3. Manter sempre:
   - Preferências explícitas (type='preference')
   - Memórias com alta similaridade a objetivos de longo prazo
   - Últimas 100 memórias (independente de score)

**Pontos críticos:**

- Nunca deletar preferências sem confirmação do usuário
- Logar o que foi deletado (para poder restaurar se necessário)
- Fazer backup antes de pruning massivo

---

### 2.5 - Multi-turn Conversations (Threads)

**O que fazer:**
Adicionar suporte a conversas multi-turn (threads):

1. Modificar `conversations` table:

   ```sql
   ALTER TABLE conversations ADD COLUMN parent_id UUID REFERENCES conversations(id);
   ALTER TABLE conversations ADD COLUMN thread_depth INTEGER DEFAULT 0;
   ```

2. No agente, quando detectar follow-up:
   - Buscar conversa anterior (parent)
   - Incluir contexto completo no prompt
   - Salvar nova conversa com parent_id

3. Heurística para detectar follow-up:
   - Mensagem do usuário < 10 palavras
   - E contém pronomes ("isso", "aquilo", "ele")
   - E última conversa foi < 5 minutos atrás

**Pontos críticos:**

- Limitar profundidade de thread (max 10 níveis)
- Ao buscar parent, incluir também siblings (conversas paralelas)
- UI mobile deve mostrar threading (como WhatsApp)

---

## 📦 FASE 3: INTERFACE PROATIVA (Semana 3)

### Objetivo

Agente não apenas responde, mas age proativamente com background tasks e action cards.

---

### 3.1 - Background Worker (Mobile)

**Arquivo:** `lib/agent-worker.ts`

**O que fazer:**

1. Configurar expo-task-manager:

   ```typescript
   import * as BackgroundFetch from 'expo-background-fetch';
   import * as TaskManager from 'expo-task-manager';

   const AGENT_TASK = 'WALTS_AGENT_BACKGROUND';

   TaskManager.defineTask(AGENT_TASK, async () => {
     try {
       // 1. Chamar edge function proativa
       const { data } = await supabase.functions.invoke(
         'walts-proactive-check'
       );

       // 2. Salvar action cards no AsyncStorage
       if (data?.actions) {
         await AsyncStorage.setItem(
           'walts_action_cards',
           JSON.stringify(data.actions)
         );
       }

       // 3. Enviar notificação se houver alertas
       if (data?.alerts) {
         await sendNotification(data.alerts[0]);
       }

       return BackgroundFetch.BackgroundFetchResult.NewData;
     } catch (error) {
       console.error('[agent-worker] Error:', error);
       return BackgroundFetch.BackgroundFetchResult.Failed;
     }
   });
   ```

2. Registrar task no app startup:

   ```typescript
   export async function registerAgentWorker() {
     await BackgroundFetch.registerTaskAsync(AGENT_TASK, {
       minimumInterval: 60 * 15, // 15 minutos
       stopOnTerminate: false,
       startOnBoot: true,
     });
   }
   ```

3. Chamar no `_layout.tsx`:
   ```typescript
   useEffect(() => {
     registerAgentWorker();
   }, []);
   ```

**Pontos críticos:**

- iOS: Background fetch funciona mas não é garantido (pode demorar horas)
- Android: Mais confiável mas drena bateria se mal implementado
- Minimizar uso de bateria: usar mínimumInterval alto (15-30min)
- Não fazer operações pesadas (só chamar edge function)
- Testar com app em background e device em sleep

---

### 3.2 - Edge Function Proativa

**Arquivo:** `supabase/functions/walts-proactive-check/index.ts`

**O que fazer:**
Criar endpoint que analisa e gera action cards:

```typescript
serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  // Autenticar...

  const actions = []

  // 1. Verificar orçamentos próximos do limite
  const {data: budgets} = await supabase.rpc('get_user_financial_context', {p_user_id: user.id})

  for (const budget of budgets.budgets) {
    const percentage = (budget.spent / parseFloat(budget.amount)) * 100

    if (percentage > 80 && percentage < 100) {
      actions.push({
        id: `budget-alert-${budget.id}`,
        type: 'budget_alert',
        priority: 'high',
        title: `⚠️ Orçamento de ${budget.category_id}`,
        message: `Você já usou ${percentage.toFixed(0)}% do orçamento. Restam R$ ${(parseFloat(budget.amount) - budget.spent).toFixed(2)}`,
        actions: [
          {label: 'Ver detalhes', action: 'navigate', target: '/orcamentos'},
          {label: 'Ajustar orçamento', action: 'navigate', target: `/budget/${budget.id}'}
        ],
        dismissible: true
      })
    }
  }

  // 2. Detectar gastos anormais
  // (comparar gasto do dia com média dos últimos 30 dias)
  const today = await getTodayExpenses(user.id, supabase)
  const avg = await getAverageDaily(user.id, supabase, 30)

  if (today > avg * 2) {
    actions.push({
      id: 'anomaly-high-spending',
      type: 'anomaly',
      priority: 'medium',
      title: '📈 Gasto acima do normal',
      message: `Hoje você gastou R$ ${today.toFixed(2)}, o dobro da sua média diária (R$ ${avg.toFixed(2)})`,
      actions: [
        {label: 'Ver gastos de hoje', action: 'navigate', target: '/expenses?date=today'}
      ],
      dismissible: true
    })
  }

  // 3. Sugerir sincronização Open Finance
  const {data: lastSync} = await supabase
    .from('pluggy_items')
    .select('last_updated')
    .eq('user_id', user.id)
    .order('last_updated', {ascending: false})
    .limit(1)
    .single()

  if (lastSync) {
    const daysSince = (Date.now() - new Date(lastSync.last_updated).getTime()) / (1000 * 60 * 60 * 24)

    if (daysSince > 3) {
      actions.push({
        id: 'sync-suggestion',
        type: 'sync_suggestion',
        priority: 'low',
        title: '🏦 Sincronizar bancos',
        message: `Há ${Math.floor(daysSince)} dias sem sincronizar. Quer atualizar?`,
        actions: [
          {label: 'Sincronizar agora', action: 'sync_open_finance', params: {days: 7}}
        ],
        dismissible: true
      })
    }
  }

  // 4. Atualizar last_proactive_check
  await supabase
    .from('agent_state')
    .upsert({
      user_id: user.id,
      last_proactive_check: new Date().toISOString()
    }, {onConflict: 'user_id'})

  return new Response(JSON.stringify({actions}), {
    headers: {'Content-Type': 'application/json'}
  })
})
```

**Pontos críticos:**

- Priorizar ações (high/medium/low)
- Dismissible: true permite usuário fechar card
- Actions podem ser: navigate, call_tool, open_url
- Não gerar cards demais (max 3-4 por vez)
- Cache: se rodou há menos de 1h, retornar mesmo resultado

---

### 3.3 - Action Cards UI

**Arquivo:** `components/AgentActionCard.tsx`

**O que fazer:**
Criar componente para exibir action cards:

```tsx
interface ActionCardProps {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  actions: Array<{
    label: string;
    action: string;
    target?: string;
    params?: any;
  }>;
  dismissible: boolean;
  onDismiss: (id: string) => void;
  onAction: (action: any) => void;
}

export function AgentActionCard({
  title,
  message,
  actions,
  priority,
  dismissible,
  onDismiss,
  onAction,
  id,
}: ActionCardProps) {
  const priorityColor = {
    high: '#FF4444',
    medium: '#FFAA00',
    low: '#4444FF',
  };

  return (
    <View
      style={{
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: priorityColor[priority],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', flex: 1 }}>
          {title}
        </Text>
        {dismissible && (
          <TouchableOpacity onPress={() => onDismiss(id)}>
            <Text style={{ fontSize: 20, color: '#999' }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Message */}
      <Text style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
        {message}
      </Text>

      {/* Actions */}
      <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
        {actions.map((action, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => onAction(action)}
            style={{
              backgroundColor: idx === 0 ? '#4A90E2' : '#EEE',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: idx === 0 ? '#FFF' : '#333',
                fontSize: 14,
                fontWeight: '500',
              }}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
```

**Pontos críticos:**

- Design seguir padrão do app (usar ThemeContext)
- Animação ao entrar/sair (Animated.View)
- Swipe to dismiss (PanResponder)
- Vibration feedback ao pressionar botão
- Accessibility labels

---

### 3.4 - Integração na Home

**Arquivo:** `app/(tabs)/home.tsx`

**O que fazer:**

1. Criar hook `useAgentActionCards`:

   ```typescript
   export function useAgentActionCards() {
     const [actionCards, setActionCards] = useState([]);
     const router = useRouter();

     useEffect(() => {
       // Carregar cards do AsyncStorage (salvos pelo background worker)
       AsyncStorage.getItem('walts_action_cards').then((data) => {
         if (data) setActionCards(JSON.parse(data));
       });

       // Atualizar quando app volta ao foreground
       const subscription = AppState.addEventListener('change', (state) => {
         if (state === 'active') {
           AsyncStorage.getItem('walts_action_cards').then((data) => {
             if (data) setActionCards(JSON.parse(data));
           });
         }
       });

       return () => subscription.remove();
     }, []);

     const dismissCard = async (id: string) => {
       const updated = actionCards.filter((c) => c.id !== id);
       setActionCards(updated);
       await AsyncStorage.setItem(
         'walts_action_cards',
         JSON.stringify(updated)
       );
     };

     const executeAction = async (card: any, action: any) => {
       if (action.action === 'navigate') {
         router.push(action.target);
       } else if (action.action === 'sync_open_finance') {
         // Chamar edge function de sync
         await supabase.functions.invoke('pluggy-sync-item', {
           body: action.params,
         });
       }
       // Remover card após ação
       dismissCard(card.id);
     };

     return { actionCards, dismissCard, executeAction };
   }
   ```

2. Adicionar na home:

   ```tsx
   export default function Home() {
     const { actionCards, dismissCard, executeAction } = useAgentActionCards();

     return (
       <ScrollView>
         {/* Action Cards Section */}
         {actionCards.length > 0 && (
           <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
             <Text
               style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}
             >
               💡 Walts sugere
             </Text>
             {actionCards.map((card) => (
               <AgentActionCard
                 key={card.id}
                 {...card}
                 onDismiss={dismissCard}
                 onAction={(action) => executeAction(card, action)}
               />
             ))}
           </View>
         )}

         {/* Resto da home... */}
       </ScrollView>
     );
   }
   ```

**Pontos críticos:**

- Cards aparecem NO TOPO da home (primeira coisa que usuário vê)
- Max 3 cards visíveis (se tiver mais, mostrar "Ver todos")
- Cards persistem entre sessões (AsyncStorage)
- Remover cards expirados (>7 dias)

---

## 📦 FASE 4: APRENDIZADO E OTIMIZAÇÃO (Semana 4)

### Objetivo

Agente aprende com feedback e melhora ao longo do tempo.

---

### 4.1 - Sistema de Feedback

**O que fazer:**

1. Adicionar botões de feedback no chat:

   ```tsx
   // components/AgentFeedbackButtons.tsx
   export function AgentFeedbackButtons({ messageId, onFeedback }) {
     return (
       <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
         <TouchableOpacity onPress={() => onFeedback(messageId, 'positive')}>
           <Text style={{ fontSize: 20 }}>👍</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={() => onFeedback(messageId, 'negative')}>
           <Text style={{ fontSize: 20 }}>👎</Text>
         </TouchableOpacity>
       </View>
     );
   }
   ```

2. Salvar feedback no banco:

   ```typescript
   async function provideFeedback(
     messageId: string,
     feedback: 'positive' | 'negative'
   ) {
     // Buscar ações relacionadas a esta mensagem
     const { data: actions } = await supabase
       .from('agent_actions_log')
       .select('*')
       .eq('session_id', sessionId) // obtido da mensagem
       .order('created_at', { ascending: true });

     // Atualizar todas as ações com o feedback
     for (const action of actions) {
       await supabase
         .from('agent_actions_log')
         .update({
           user_feedback: feedback,
           feedback_at: new Date().toISOString(),
         })
         .eq('id', action.id);
     }
   }
   ```

**Pontos críticos:**

- Feedback é opcional (não forçar)
- Mostrar thumbs embaixo de cada mensagem do agente
- Feedback se aplica a TODAS as ações daquela mensagem
- Permitir comentário textual opcional (popup se der thumbs down)

---

### 4.2 - Pattern Extraction

**Arquivo:** `supabase/functions/walts-learn/index.ts`

**O que fazer:**
Criar edge function que roda semanalmente (via cron) para aprender padrões:

```typescript
serve(async (req) => {
  // Esta função deve rodar via cron, não precisa autenticação por usuário
  // Processar todos os usuários

  const { data: users } = await supabase.from('profiles').select('id');

  for (const user of users) {
    // 1. Buscar ações com feedback positivo (últimas 100)
    const { data: positiveActions } = await supabase
      .from('agent_actions_log')
      .select('*')
      .eq('user_id', user.id)
      .eq('user_feedback', 'positive')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!positiveActions || positiveActions.length < 5) continue;

    // 2. Extrair padrões
    const patterns = extractPatterns(positiveActions);

    // 3. Salvar como insights na walts_memory
    for (const pattern of patterns) {
      await supabase.from('walts_memory').upsert(
        {
          user_id: user.id,
          memory_type: 'insight',
          key: pattern.key,
          value: pattern.value,
          confidence: pattern.confidence,
          source: 'learning_system',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,memory_type,key' }
      );
    }
  }

  return new Response(JSON.stringify({ processed: users.length }));
});

function extractPatterns(actions) {
  const patterns = [];

  // PADRÃO 1: Categorização preferida
  // Se usuário sempre categoriza "Uber" como "transporte" (não "lazer")
  const categorizationActions = actions.filter(
    (a) => a.tool_name === 'create_expense'
  );
  const establishmentCategories = {};

  for (const action of categorizationActions) {
    const establishment =
      action.input_params?.establishment_name?.toLowerCase();
    const category = action.output_result?.category;

    if (establishment && category) {
      if (!establishmentCategories[establishment]) {
        establishmentCategories[establishment] = {};
      }
      establishmentCategories[establishment][category] =
        (establishmentCategories[establishment][category] || 0) + 1;
    }
  }

  for (const [establishment, categories] of Object.entries(
    establishmentCategories
  )) {
    const total = Object.values(categories).reduce(
      (sum, count) => sum + count,
      0
    );
    if (total >= 3) {
      // Mínimo 3 ocorrências
      const mostCommon = Object.entries(categories).sort(
        ([, a], [, b]) => b - a
      )[0];

      if (mostCommon[1] / total >= 0.8) {
        // 80%+ consistência
        patterns.push({
          key: `category_preference_${establishment}`,
          value: {
            establishment,
            preferred_category: mostCommon[0],
            confidence_data: {
              occurrences: total,
              consistency: mostCommon[1] / total,
            },
          },
          confidence: mostCommon[1] / total,
        });
      }
    }
  }

  // PADRÃO 2: Horário preferido para ações
  // Se usuário sempre usa agente pela manhã (7-10h)
  const timeDistribution = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];
  for (const action of actions) {
    const hour = new Date(action.created_at).getHours();
    timeDistribution[hour]++;
  }

  const maxHour = timeDistribution.indexOf(Math.max(...timeDistribution));
  const maxCount = timeDistribution[maxHour];

  if (maxCount / actions.length > 0.4) {
    // 40%+ em uma faixa de 3h
    patterns.push({
      key: 'preferred_usage_time',
      value: {
        hour_range: [maxHour - 1, maxHour + 1],
        percentage: maxCount / actions.length,
      },
      confidence: maxCount / actions.length,
    });
  }

  // PADRÃO 3: Limites de alerta personalizados
  // Se usuário sempre dá feedback positivo quando alerta aparece em 85% (não 80%)
  const budgetAlerts = actions.filter(
    (a) =>
      a.action_type === 'proactive_alert' &&
      a.input_params?.alert_type === 'budget'
  );

  if (budgetAlerts.length >= 5) {
    const thresholds = budgetAlerts.map((a) => a.input_params?.threshold);
    const avgThreshold =
      thresholds.reduce((sum, t) => sum + t, 0) / thresholds.length;

    patterns.push({
      key: 'budget_alert_threshold',
      value: {
        preferred_threshold: avgThreshold,
        sample_size: budgetAlerts.length,
      },
      confidence: 0.7,
    });
  }

  return patterns;
}
```

**Pontos críticos:**

- Rodar via Supabase Cron (semanal)
- Minimum sample size: 5 ações para extrair padrão
- Confidence score baseado em consistência
- Não sobrescrever insights com baixa confidence
- Logar patterns extraídos para análise

---

### 4.3 - Aplicação de Insights Aprendidos

**O que fazer:**
Modificar `context-builder.ts` para incluir insights:

```typescript
// Em buildContext(), adicionar:
const { data: insights } = await supabase
  .from('walts_memory')
  .select('*')
  .eq('user_id', userId)
  .eq('memory_type', 'insight')
  .order('confidence', { ascending: false })
  .limit(10);

// No prompt:
if (insights && insights.length > 0) {
  contextSection += '\n## Insights Aprendidos\n';
  insights.forEach((insight) => {
    contextSection += `- ${insight.key}: ${JSON.stringify(insight.value)} (conf: ${insight.confidence})\n`;
  });
}
```

E usar nos tools:

```typescript
// Em create_expense, antes de inserir:
const categoryInsight = await supabase
  .from('walts_memory')
  .select('value')
  .eq('user_id', userId)
  .eq('key', `category_preference_${params.establishment_name.toLowerCase()}`)
  .single();

if (categoryInsight && !params.category) {
  // Usar categoria aprendida
  params.category = categoryInsight.data.value.preferred_category;
}
```

**Pontos críticos:**

- Insights com confidence < 0.6 devem ser ignorados
- Sempre preferir parâmetro explícito do usuário vs insight
- Mencionar ao usuário que está usando preferência aprendida
- Permitir override (ex: "desta vez categoriza como lazer, não transporte")

---

### 4.4 - Métricas e Monitoring

**O que fazer:**
Criar dashboard de métricas (pode ser separado do app):

1. Queries úteis para analytics:

   ```sql
   -- Tools mais usadas
   SELECT tool_name, COUNT(*) as usage_count
   FROM agent_actions_log
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY tool_name
   ORDER BY usage_count DESC;

   -- Taxa de sucesso por tool
   SELECT
     tool_name,
     COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) as success_rate
   FROM agent_actions_log
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY tool_name;

   -- Tempo médio de execução
   SELECT
     tool_name,
     AVG(execution_time_ms) as avg_time_ms,
     MAX(execution_time_ms) as max_time_ms
   FROM agent_actions_log
   WHERE created_at > NOW() - INTERVAL '7 days'
   GROUP BY tool_name;

   -- Feedback positivo vs negativo
   SELECT
     user_feedback,
     COUNT(*) as count
   FROM agent_actions_log
   WHERE user_feedback IS NOT NULL
   GROUP BY user_feedback;
   ```

2. Criar alerts:
   - Se taxa de erro > 10% em 1h → alerta Sentry
   - Se tempo médio > 5s → alerta performance
   - Se feedback negativo > 30% → revisar prompts

3. Adicionar tracing (opcional):
   - Usar Sentry para tracing de requests
   - Adicionar custom breadcrumbs em cada etapa do ReAct loop

**Pontos críticos:**

- Não coletar PII (remover dados sensíveis dos logs)
- GDPR compliance: permitir usuário pedir deleção de logs
- Retention: manter logs por 90 dias, depois deletar
- Cost monitoring: rastrear gastos OpenAI por usuário/tool

---

### 4.5 - Otimizações Finais

**O que fazer:**

1. **Cache de contexto financeiro:**

   ```typescript
   // Em context-builder.ts
   const cacheKey = `financial_context:${userId}`;
   let financial = await cache.get(cacheKey);

   if (!financial) {
     financial = await supabase.rpc('get_user_financial_context', {
       p_user_id: userId,
     });
     await cache.set(cacheKey, financial, { ttl: 60 }); // 1 minuto
   }
   ```

2. **Batch processing de memórias:**
   - Gerar embeddings em batch (10 por vez) se houver fila
   - Usar `Promise.all` para paralelizar buscas

3. **Lazy loading de tools:**
   - Não carregar código de todos os tools no startup
   - Importar dinamicamente: `await import(./tools/${toolName}.ts)`

4. **Rate limiting por usuário:**
   ```typescript
   // Limitar a 10 mensagens por minuto
   const rateLimitKey = `rate_limit:${userId}`;
   const count = await cache.incr(rateLimitKey);
   if (count === 1) await cache.expire(rateLimitKey, 60);
   if (count > 10) {
     throw new Error('Rate limit exceeded');
   }
   ```

**Pontos críticos:**

- Cache deve invalidar quando dados mudam (ex: novo gasto criado)
- Rate limiting previne abuse mas não deve afetar uso normal
- Monitorar impacto de otimizações (antes vs depois)

---

## 🎯 CHECKLIST FINAL DE VERIFICAÇÃO

Antes de considerar o projeto completo, verificar:

### Funcionalidades Core

- [ ] Agente responde perguntas usando contexto financeiro
- [ ] Agente cria gastos quando solicitado
- [ ] Agente cria e atualiza orçamentos
- [ ] Agente sincroniza Open Finance
- [ ] Agente busca e usa memórias de conversas passadas
- [ ] Agente salva preferências do usuário
- [ ] ReAct loop funciona (múltiplas iterações)
- [ ] Máximo 5 iterações respeitado

### Memória

- [ ] Busca vetorial funciona (pgvector)
- [ ] Memórias relevantes aparecem no contexto
- [ ] Preferências são salvas e recuperadas
- [ ] Conversas são resumidas e salvas
- [ ] Pruning de memórias antigas funciona

### Proatividade

- [ ] Background worker roda a cada 15min
- [ ] Action cards aparecem na home
- [ ] Alertas de orçamento funcionam
- [ ] Detecção de anomalias funciona
- [ ] Sugestão de sync Open Finance funciona
- [ ] Notificações push funcionam (opcional)

### Aprendizado

- [ ] Feedback (thumbs up/down) salva no banco
- [ ] Pattern extraction roda semanalmente
- [ ] Insights aprendidos são aplicados
- [ ] Categorização automática melhora com tempo

### Performance

- [ ] Tempo de resposta < 5s (maioria dos casos)
- [ ] Cache de contexto funciona
- [ ] Rate limiting implementado
- [ ] Logs de performance coletados

### Segurança

- [ ] RLS habilitado em todas as tabelas
- [ ] User_id sempre validado
- [ ] Sem cross-user data leakage
- [ ] API keys não expostas
- [ ] CORS configurado corretamente

### UX

- [ ] Loading indicators durante raciocínio
- [ ] Erros tratados com mensagens amigáveis
- [ ] Action cards têm bom design
- [ ] Feedback buttons visíveis
- [ ] Chat history persiste

---

## 📚 REFERÊNCIAS TÉCNICAS

### Documentação Essencial

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Expo Task Manager](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [ReAct Pattern Paper](https://arxiv.org/abs/2210.03629)

### Exemplos de Código

- [Langchain ReAct Agent](https://python.langchain.com/docs/modules/agents/agent_types/react)
- [OpenAI Function Calling Examples](https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models)
- [Supabase Embeddings Guide](https://supabase.com/docs/guides/ai/vector-columns)

### Best Practices

- Sempre validar input de usuário
- Logar tudo (com privacidade)
- Fail gracefully (erros não devem quebrar app)
- Testar com usuários reais
- Iterar baseado em feedback

---

## 🚀 PRÓXIMOS PASSOS APÓS CONCLUSÃO

### Melhorias Futuras

1. **Voice Input/Output:** Integrar TTS e STT
2. **Multi-modal:** Aceitar imagens no chat (ex: foto de cardápio)
3. **Collaborative:** Múltiplos usuários no mesmo budget
4. **Gamification:** Achievements por metas atingidas
5. **Integrations:** Conectar com mais serviços (Google Calendar, Notion)

### Escalabilidade

- Migrar para HNSW index quando >100k vectors
- Sharding de banco por região geográfica
- CDN para cache de respostas comuns
- Fine-tuning de modelo específico para finanças

### Monetização (se aplicável)

- Features premium: análises avançadas, previsões ML
- API para desenvolvedores
- White-label para bancos

---

**FIM DO PLANO TÉCNICO**

Este documento deve ser usado como referência pelo desenvolvedor que está implementando o sistema. Cada seção contém detalhes técnicos suficientes para implementação sem ambiguidade, mas assume conhecimento em TypeScript, PostgreSQL, React Native e conceitos de IA.

Para dúvidas ou clarificações, consultar a documentação oficial das tecnologias mencionadas ou criar issues específicas no repositório do projeto.
