# Guia: Transformando o Walts em um Agente de IA de Verdade

## Problemas Identificados

### 1. System Prompt Muito Longo (100+ linhas)

O DeepSeek não consegue processar instruções tão extensas de forma consistente. Isso causa:

- Confusão sobre qual ferramenta usar
- Chamadas de ferramentas desnecessárias
- Loops infinitos

### 2. Muitas Ferramentas (20 tools)

É difícil para qualquer LLM decidir entre tantas opções. Recomendação:

- Máximo de 10-12 ferramentas bem definidas
- Ou agrupar ferramentas relacionadas em uma só

### 3. Falta de "Stop Condition" Explícita

O modelo não sabe quando PARAR de chamar ferramentas e responder ao usuário.

### 4. Ausência de Pré-carregamento de Contexto

O agente deveria ter os dados do usuário JÁ no contexto, não precisar buscar toda hora.

## Solução Proposta

### Arquitetura ReAct (Reason + Act)

```
1. Usuário envia mensagem
2. PRÉ-CARREGAR contexto essencial do usuário (1 chamada DB)
3. Injetar contexto no system prompt
4. Chamar LLM com contexto + mensagem
5. Se LLM chamar ferramenta → executar → voltar ao passo 4
6. Se LLM responder texto → retornar ao usuário
```

### System Prompt Otimizado (Novo)

```
Você é Walts, assistente financeiro do Pocket.

CONTEXTO DO USUÁRIO:
{user_context_here}

REGRAS:
1. SEMPRE responda diretamente se já tem a informação no contexto
2. Use ferramentas APENAS quando precisar de dados que não estão no contexto
3. Após executar UMA ferramenta, RESPONDA ao usuário (não chame mais ferramentas)
4. Para ações (criar/editar/deletar), execute e confirme
5. Seja direto e use 1-2 emojis no máximo

FERRAMENTAS DISPONÍVEIS:
- create_expense: Criar gasto manual
- sync_transactions: Buscar transações do banco
- manage_budget: Criar/atualizar/verificar orçamentos
- analyze_finances: Analisar gastos, sugerir economia, prever fim do mês
- manage_data: Editar/deletar gastos, exportar dados
```

### Mudanças no Loop Principal

```typescript
// ANTES (problemático)
let maxIterations = 5;
while (iteration < maxIterations) {
  // chama LLM
  // se tem tool_calls, executa todas
  // continua loop...
}

// DEPOIS (corrigido)
let maxIterations = 3; // Reduzido
let toolsExecutedThisRound = 0;

while (iteration < maxIterations) {
  const response = await callLLM(messages);

  // Se não tem tool calls, RETORNA IMEDIATAMENTE
  if (!response.tool_calls?.length) {
    return response.content;
  }

  // Executar APENAS A PRIMEIRA ferramenta
  const firstTool = response.tool_calls[0];
  const result = await executeTool(firstTool);

  // Adicionar resultado ao contexto
  messages.push({ role: 'tool', content: result });

  // Forçar resposta na próxima iteração
  if (toolsExecutedThisRound > 0) {
    // Adicionar instrução para responder
    messages.push({
      role: 'system',
      content:
        'Agora responda ao usuário com base nos dados obtidos. NÃO chame mais ferramentas.',
    });
  }

  toolsExecutedThisRound++;
  iteration++;
}
```

## Implementação Recomendada

### Passo 1: Criar função de pré-carregamento

```typescript
async function preloadUserContext(supabase: any, userId: string) {
  // Buscar tudo de uma vez
  const [profile, budgets, recentExpenses, preferences] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('budgets').select('*').eq('user_id', userId),
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(20),
    supabase.from('walts_memory').select('*').eq('user_id', userId).limit(10),
  ]);

  return {
    name: profile.data?.name,
    salary: profile.data?.monthly_salary,
    budgets: budgets.data || [],
    recentExpenses: recentExpenses.data || [],
    preferences: preferences.data || [],
  };
}
```

### Passo 2: Gerar system prompt dinâmico

```typescript
function generateSystemPrompt(userContext: any) {
  return `Você é Walts, assistente financeiro pessoal.

SOBRE O USUÁRIO:
- Nome: ${userContext.name || 'Não informado'}
- Salário: R$ ${userContext.salary?.toLocaleString('pt-BR') || 'Não informado'}
- Orçamentos ativos: ${userContext.budgets.length}
- Gastos recentes: ${userContext.recentExpenses.length}

ÚLTIMOS GASTOS:
${userContext.recentExpenses
  .slice(0, 5)
  .map((e) => `- ${e.establishment_name}: R$ ${e.amount} (${e.category})`)
  .join('\n')}

ORÇAMENTOS:
${userContext.budgets
  .map((b) => `- ${b.category_id}: R$ ${b.amount}/${b.period_type}`)
  .join('\n')}

REGRAS IMPORTANTES:
1. Se a informação está acima, USE-A diretamente
2. Use ferramentas APENAS se precisar de dados novos
3. Após 1 chamada de ferramenta, RESPONDA ao usuário
4. Seja conciso e direto
`;
}
```

### Passo 3: Consolidar ferramentas

Ao invés de 20 ferramentas, usar 5-6 agrupadas:

1. **manage_expense** - criar, editar, deletar gastos
2. **manage_budget** - criar, editar, deletar, verificar orçamentos
3. **sync_bank** - sincronizar e categorizar transações do banco
4. **analyze** - analisar padrões, sugerir economia, prever fim do mês
5. **get_data** - buscar qualquer dado específico
6. **export** - exportar dados

### Passo 4: Adicionar stop condition

```typescript
// Após executar ferramenta, forçar resposta
if (toolsExecuted > 0) {
  conversationMessages.push({
    role: 'system',
    content:
      'IMPORTANTE: Responda ao usuário agora. Não chame mais ferramentas.',
  });
}
```

## Arquitetura Final

```
┌─────────────────────────────────────────────────────────────┐
│                     WALTS AGENT v2                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Recebe mensagem do usuário                              │
│                    ↓                                        │
│  2. PRÉ-CARREGA contexto (perfil, orçamentos, gastos)      │
│                    ↓                                        │
│  3. Gera system prompt DINÂMICO com contexto               │
│                    ↓                                        │
│  4. Chama DeepSeek                                         │
│         ↓                    ↓                             │
│     [Texto]              [Tool Call]                       │
│         ↓                    ↓                             │
│     RETORNA           Executa ferramenta                   │
│                             ↓                              │
│                    Adiciona resultado                      │
│                             ↓                              │
│                    Força resposta final                    │
│                             ↓                              │
│                         RETORNA                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Benefícios

1. **Menos tokens** - contexto já está no prompt, não precisa buscar
2. **Menos loops** - stop condition explícita
3. **Mais rápido** - menos chamadas à API
4. **Mais confiável** - menos chance de erro

## Próximos Passos

1. Fazer backup do arquivo atual ✅
2. Implementar preloadUserContext
3. Reescrever system prompt
4. Consolidar ferramentas
5. Adicionar stop condition
6. Testar extensivamente
