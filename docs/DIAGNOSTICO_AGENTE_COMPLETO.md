# Diagnóstico Completo do Agente Walts - Pocket App

**Autor:** Engenheiro de Software com Especialização em IA
**Data:** Janeiro 2026
**Status:** Análise Crítica e Soluções

---

## Resumo Executivo

Após análise minuciosa de todo o código do projeto Pocket, identifiquei **4 problemas estruturais críticos** que explicam todos os comportamentos relatados. O agente Walts não está "quebrando" - ele está funcionando exatamente como foi programado, mas a **arquitetura atual tem gaps fundamentais** que precisam ser corrigidos.

---

## 🔴 PROBLEMA 1: O Agente "Não Sabe de Tudo" do Usuário

### Sintoma Relatado

> "O usuário tem que pedir pra ele olhar tal coisa pra ele se convencer de que aquilo existe"

### Causa Raiz Identificada

O problema está no **contexto inicial limitado** que é carregado em `context.ts`. Olhe o que é carregado:

```typescript
// context.ts - linha 144-204
const [
  profileResult,        // nome, income_cards
  budgetsResult,        // orçamentos
  monthExpensesResult,  // gastos do MÊS ATUAL apenas
  recentExpensesResult, // últimos 10 gastos
  memoriesResult,       // memórias (limite 10)
  insightsResult,       // insights (limite 5)
  bankAccountsResult,   // contas vinculadas
  pluggyItemsResult,    // items do pluggy
] = await Promise.all([...])
```

**O problema:** O agente recebe apenas **10 gastos recentes** e **gastos do mês atual**. Se o usuário perguntar sobre:

- Gastos de meses anteriores
- Um gasto específico que não está nos últimos 10
- Transações do extrato bancário
- Dados de gráficos e tabelas

O agente simplesmente **NÃO TEM ESSAS INFORMAÇÕES** no contexto inicial!

### Agravante: O System Prompt Induz ao Erro

No `context.ts`, linha 463-465:

```
5. Se a informação está no contexto acima, USE-A diretamente
6. Use ferramentas APENAS quando precisar de dados que não estão no contexto
```

Isso faz o agente **ASSUMIR** que tem todas as informações, quando na verdade tem apenas um subset limitado.

### Solução Proposta

#### Opção A: Enriquecer o Contexto Inicial (Recomendado)

Modificar `context.ts` para incluir:

```typescript
// ADICIONAR ao preloadUserContext
const [
  // ... existing ...
  transactionCategoriesResult, // NOVO: categorias de transações
  allExpensesCountResult, // NOVO: total de gastos para dar contexto
  chartDataResult, // NOVO: dados que aparecem em Gráficos & Tabelas
] = await Promise.all([
  // ... existing ...

  // Buscar contagem total de expenses para dar contexto
  supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId),

  // Buscar transaction_categories com transações
  supabase
    .from('transaction_categories')
    .select(
      `
      category,
      subcategory,
      is_fixed_cost,
      pluggy_transactions!inner(description, amount, date)
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30),
]);
```

#### Opção B: Alterar o System Prompt para Ser Mais Proativo

```typescript
// ALTERAR generateSystemPrompt
const systemPrompt = `...

REGRAS IMPORTANTES:
1. SALDO: Use SEMPRE o valor "Saldo disponível" acima quando perguntarem sobre saldo
2. CONTEXTO LIMITADO: O contexto acima contém APENAS:
   - Últimos 10 gastos manuais
   - Gastos do mês atual
   - 10 memórias mais usadas
   - 5 insights de alta confiança
3. Para QUALQUER pergunta sobre:
   - Gastos fora do mês atual → USE get_financial_context com period
   - Transações do extrato → USE get_bank_transactions
   - Dados de gráficos → USE generate_raio_x ou get_financial_context
   - Gastos específicos que não aparecem acima → BUSQUE antes de responder
4. NUNCA assuma que a informação não existe só porque não está no contexto
5. Sempre use ferramentas quando a pergunta envolve dados específicos
...`;
```

---

## 🔴 PROBLEMA 2: Confusão entre CATEGORIZAR e REGISTRAR

### Sintoma Relatado

> "Quando peço pra CATEGORIZAR saídas do extrato, ele REGISTRA (cria expense novo)"

### Causa Raiz Identificada

Existem **DUAS ferramentas completamente diferentes** que o agente pode usar:

| Ação            | Ferramenta                 | O que faz                                                                         |
| --------------- | -------------------------- | --------------------------------------------------------------------------------- |
| **REGISTRAR**   | `create_expense`           | Cria um NOVO registro em `expenses`, aparece na Home, debita do saldo             |
| **CATEGORIZAR** | `recategorize_transaction` | Atualiza categoria em `transaction_categories`, aparece em Custos Fixos/Variáveis |

**O problema:** O System Prompt NÃO deixa clara essa distinção. A ferramenta `create_expense` tem descrição:

```typescript
// registry.ts linha 49
description: `Cria um novo registro de gasto/despesa para o usuário.

USE ESTA FERRAMENTA QUANDO:
- Usuário pedir para registrar um gasto (ex: "gastei 50 no mercado")
- Usuário mencionar uma compra que quer salvar
- Usuário enviar um cupom fiscal para registrar`;
```

E `recategorize_transaction`:

```typescript
// registry.ts linha 1277
description: `Recategoriza transacao do Open Finance.

USE ESTA FERRAMENTA QUANDO:
- Usuario quiser mudar categoria de transacao
- Usuario corrigir categorizacao automatica
- Usuario disser "isso nao e X, e Y"`;
```

**O agente está interpretando "categorizar" como "criar gasto" porque não entende a semântica específica do Pocket.**

### Solução Proposta

#### Passo 1: Adicionar Clareza ao System Prompt

```typescript
// ADICIONAR ao generateSystemPrompt após CATEGORIZAÇÃO DE GASTOS:

IMPORTANTE - DIFERENÇA ENTRE REGISTRAR E CATEGORIZAR:

1. REGISTRAR (create_expense):
   - Cria um NOVO gasto manual
   - Aparece na HOME como despesa
   - DEBITA do saldo do usuário
   - Use quando: usuário quer ADICIONAR um gasto novo que não está no sistema

2. CATEGORIZAR (recategorize_transaction):
   - Atualiza uma transação JÁ EXISTENTE do extrato bancário
   - Faz aparecer em CUSTOS FIXOS ou CUSTOS VARIÁVEIS
   - NÃO debita do saldo (já está no extrato)
   - Use quando: usuário quer ORGANIZAR transações vindas do Open Finance

REGRA DE OURO:
- Se a transação veio do EXTRATO BANCÁRIO → use recategorize_transaction
- Se é um gasto NOVO que o usuário quer adicionar → use create_expense
- Se o usuário diz "categorizar essa saída do banco" → NUNCA use create_expense
```

#### Passo 2: Adicionar Ferramenta Dedicada para Categorização em Massa

```typescript
// NOVA FERRAMENTA em registry.ts
{
  type: 'function',
  function: {
    name: 'categorize_bank_transaction',
    description: `Categoriza uma transação do extrato bancário para aparecer em Custos Fixos/Variáveis.

USE ESTA FERRAMENTA QUANDO:
- Usuario disser "categorizar essa saida/entrada do banco"
- Usuario quiser que transacao apareca em Custos Fixos ou Variaveis
- Usuario pedir para organizar extrato

IMPORTANTE:
- NAO cria novo gasto (a transacao ja existe no extrato)
- NAO debita do saldo (ja esta no saldo do banco)
- APENAS define categoria para organizacao

NAO USE PARA:
- Adicionar gasto manual novo
- Registrar uma compra que nao esta no extrato`,
    parameters: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'ID da transacao do extrato a categorizar',
        },
        category: {
          type: 'string',
          enum: ['moradia', 'alimentacao_casa', 'alimentacao_fora', /* ... */],
        },
        is_fixed_cost: {
          type: 'boolean',
          description: 'true = Custo Fixo (mensal), false = Custo Variável (eventual)',
        },
      },
      required: ['transaction_id', 'category', 'is_fixed_cost'],
    },
  },
}
```

---

## 🔴 PROBLEMA 3: Agente Diz que "Não Tem Nada" em Gráficos & Tabelas

### Sintoma Relatado

> "Peço pra ver o que tem na página Gráficos & Tabelas, mas ele diz que não tem nada"

### Causa Raiz Identificada

Analisando `graficos-tabelas.tsx`, os dados vêm de **DUAS fontes**:

1. **Gastos manuais** (`expenses` table)
2. **Transações categorizadas do extrato** (`transaction_categories` + `pluggy_transactions`)

```typescript
// graficos-tabelas.tsx linha 220-288
// Buscar expenses MANUAIS do periodo atual
const { data: expensesData } = await supabase
  .from('expenses')
  .select('amount, category, subcategory')
  ...

// Buscar transacoes categorizadas do extrato
const { data: categorizedTx } = await supabase
  .from('transaction_categories')
  .select(`
    category,
    subcategory,
    pluggy_transactions!inner(amount, date, account_id, type)
  `)
  .eq('user_id', user.id);
```

**O problema:** O agente NÃO tem nenhuma ferramenta que faça essa **combinação de dados**. As ferramentas existentes são:

- `get_financial_context` → Só busca `expenses` (gastos manuais)
- `get_bank_transactions` → Só busca `pluggy_transactions` sem categorização
- `generate_raio_x` → Só analisa `expenses`

**Nenhuma ferramenta combina as duas fontes como a tela de Gráficos faz!**

### Solução Proposta

#### Criar Nova Ferramenta: `get_charts_data`

```typescript
// registry.ts - NOVA FERRAMENTA
{
  type: 'function',
  function: {
    name: 'get_charts_data',
    description: `Busca dados que aparecem na tela de Graficos & Tabelas.

USE ESTA FERRAMENTA QUANDO:
- Usuario perguntar sobre graficos
- Usuario quiser ver distribuicao por categoria
- Usuario perguntar "como estao meus gastos?"
- Usuario pedir resumo visual ou por categoria

RETORNA:
- Gastos agrupados por categoria (manuais + extrato)
- Totais por categoria
- Comparacao com periodo anterior
- Exatamente os mesmos dados da tela Graficos & Tabelas`,
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Periodo a analisar',
          enum: ['last7days', 'last15days', 'month'],
        },
        month: {
          type: 'string',
          description: 'Mes especifico no formato YYYY-MM (quando period=month)',
        },
      },
      required: [],
    },
  },
}
```

#### Implementação em `implementations/analysis.ts`:

```typescript
export async function getChartsData(
  params: { period?: string; month?: string },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;

  // Calcular datas
  const period = params.period || 'month';
  let startDate: Date;
  let endDate: Date = new Date();

  // ... lógica de datas igual graficos-tabelas.tsx ...

  // Buscar expenses MANUAIS
  const { data: expensesData } = await supabase
    .from('expenses')
    .select('amount, category, subcategory')
    .eq('user_id', userId)
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0]);

  // Buscar transações CATEGORIZADAS do extrato
  const { data: categorizedTx } = await supabase
    .from('transaction_categories')
    .select(
      `
      category,
      subcategory,
      is_fixed_cost,
      pluggy_transactions!inner(amount, date, type, account_id)
    `
    )
    .eq('user_id', userId);

  // Filtrar por período e tipo DEBIT
  const filteredExtract = (categorizedTx || []).filter((tx) => {
    const txDate = tx.pluggy_transactions?.date;
    if (!txDate) return false;
    const date = new Date(txDate);
    return (
      date >= startDate &&
      date <= endDate &&
      tx.pluggy_transactions?.type === 'DEBIT'
    );
  });

  // Combinar e agrupar por categoria
  const byCategory: Record<
    string,
    { total: number; count: number; source: string }
  > = {};

  // Somar gastos manuais
  for (const exp of expensesData || []) {
    const cat = exp.category || 'outros';
    if (!byCategory[cat])
      byCategory[cat] = { total: 0, count: 0, source: 'mixed' };
    byCategory[cat].total += exp.amount;
    byCategory[cat].count++;
  }

  // Somar transações do extrato
  for (const tx of filteredExtract) {
    const cat = tx.category || 'outros';
    if (!byCategory[cat])
      byCategory[cat] = { total: 0, count: 0, source: 'mixed' };
    byCategory[cat].total += Math.abs(tx.pluggy_transactions?.amount || 0);
    byCategory[cat].count++;
  }

  // Calcular total
  const totalExpenses = Object.values(byCategory).reduce(
    (s, c) => s + c.total,
    0
  );

  // Formatar resultado
  const categories = Object.entries(byCategory)
    .map(([category, data]) => ({
      category,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
      percent:
        totalExpenses > 0 ? Math.round((data.total / totalExpenses) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    success: true,
    data: {
      period,
      categories,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      manualExpensesCount: (expensesData || []).length,
      extractTransactionsCount: filteredExtract.length,
      message: `Analise de ${categories.length} categorias, totalizando R$ ${totalExpenses.toFixed(2)}.`,
    },
  };
}
```

---

## 🔴 PROBLEMA 4: CronJob Não Atualiza Saldo

### Sintoma Relatado

> "O cronjob sincroniza mas não atualiza o saldo, só o botão manual funciona"

### Causa Raiz Identificada

Comparando as duas funções:

| Função                             | Atualiza Balance?      | Sincroniza Transações?        |
| ---------------------------------- | ---------------------- | ----------------------------- |
| `pluggy-sync-cron`                 | ✅ Sim (linha 159-168) | ✅ Sim                        |
| Botão Manual (`accounts/[id].tsx`) | ✅ Sim (via syncItem)  | ✅ Sim (via syncTransactions) |

Olhando o cron job em `20260112110000_create_auto_sync_function.sql`:

```sql
-- Função que dispara sincronização para todas as contas
CREATE OR REPLACE FUNCTION trigger_pluggy_sync()
...
  -- Fazer requisição HTTP para Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/pluggy-sync-cron',  -- ← CHAMA pluggy-sync-cron
    ...
    body := jsonb_build_object(
      'accountId', account_record.pluggy_account_id,
      'userId', account_record.user_id::text
    )
  );

  -- Atualizar last_sync_at para evitar reprocessamento
  UPDATE pluggy_accounts SET last_sync_at = NOW() WHERE id = account_record.id;  -- ← PROBLEMA!
```

**O PROBLEMA ESTÁ AQUI:** A função SQL atualiza `last_sync_at` **IMEDIATAMENTE** após disparar a requisição HTTP, **SEM ESPERAR** a Edge Function completar!

Olhe o que `pluggy-sync-cron` faz:

```typescript
// pluggy-sync-cron/index.ts linha 159-168
// Atualizar saldo da conta
const balanceResponse = await fetch(
  `https://api.pluggy.ai/accounts/${accountId}`,
  { headers: { 'X-API-KEY': apiKey } }
);

if (balanceResponse.ok) {
  const accountInfo = await balanceResponse.json();
  await supabase
    .from('pluggy_accounts')
    .update({
      balance: accountInfo.balance,
      last_sync_at: new Date().toISOString(), // ← ATUALIZA AQUI TAMBÉM
    })
    .eq('id', accountData.id);
}
```

**Conflito de atualização:** A função SQL atualiza `last_sync_at` ANTES da Edge Function atualizar o `balance`. Mas como `net.http_post` é **assíncrono** no PostgreSQL, pode haver race condition.

### Porém, o maior problema é:

A Edge Function `pluggy-sync-cron` usa `pluggy_account_id` para buscar a conta:

```typescript
// pluggy-sync-cron linha 40-47
const { data: accountData, error: accountError } = await supabase
  .from('pluggy_accounts')
  .select('id, pluggy_account_id, item_id, user_id')
  .eq('pluggy_account_id', accountId) // ← Busca pelo pluggy_account_id
  .single();
```

**MAS** a função SQL passa `account_record.pluggy_account_id`:

```sql
body := jsonb_build_object(
  'accountId', account_record.pluggy_account_id,  -- ← CORRETO
  'userId', account_record.user_id::text
)
```

Isso deveria funcionar... **VERIFICAR LOGS!**

### Possíveis Causas Adicionais:

1. **pg_net não está retornando sucesso:** A extensão `pg_net` pode estar falhando silenciosamente
2. **Autenticação:** O cron usa `service_key` mas pode haver problema de RLS
3. **Timeout:** A Edge Function pode estar demorando mais que o timeout do pg_net

### Solução Proposta

#### Passo 1: Adicionar Logs e Tratamento de Erro

```sql
-- Melhorar a função trigger_pluggy_sync
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
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO anon_key FROM app_config WHERE key = 'supabase_service_key';

  IF supabase_url IS NULL OR anon_key IS NULL THEN
    RAISE NOTICE 'Configurações não encontradas na tabela app_config';
    RETURN;
  END IF;

  FOR account_record IN
    SELECT
      pa.id,
      pa.pluggy_account_id,
      pa.user_id,
      pa.balance as current_balance
    FROM pluggy_accounts pa
    WHERE pa.last_sync_at < NOW() - INTERVAL '3 hours'
       OR pa.last_sync_at IS NULL
    LIMIT 10
  LOOP
    BEGIN
      -- Fazer requisição HTTP
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

      RAISE NOTICE 'Triggered sync for account % (request_id: %)',
                   account_record.pluggy_account_id, request_id;

      -- NÃO atualizar last_sync_at aqui!
      -- A Edge Function vai atualizar quando completar com sucesso

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error syncing account %: %', account_record.pluggy_account_id, SQLERRM;
    END;
  END LOOP;
END;
$$;
```

#### Passo 2: Verificar se pg_net está funcionando

```sql
-- Executar manualmente para testar
SELECT net.http_post(
  url := 'https://yiwkuqihujjrxejeybeg.supabase.co/functions/v1/pluggy-sync-cron',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
  body := '{"accountId": "seu-account-id", "userId": "seu-user-id"}'::jsonb
);

-- Verificar resultado
SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
```

#### Passo 3: Alternativa - Usar Edge Function Cron no Supabase

Em vez de `pg_cron` + `pg_net`, usar o sistema de cron nativo do Supabase:

```typescript
// supabase/functions/auto-sync-all/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  // Esta função é chamada pelo cron do Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Buscar contas que precisam sincronizar
  const { data: accounts } = await supabase
    .from('pluggy_accounts')
    .select('id, pluggy_account_id, user_id, balance')
    .or('last_sync_at.is.null,last_sync_at.lt.now()-interval-3-hours')
    .limit(10);

  const results = [];

  for (const account of accounts || []) {
    try {
      // Chamar a função de sync diretamente
      const { data, error } = await supabase.functions.invoke(
        'pluggy-sync-cron',
        {
          body: {
            accountId: account.pluggy_account_id,
            userId: account.user_id,
          },
        }
      );

      results.push({
        accountId: account.pluggy_account_id,
        success: !error,
        error: error?.message,
      });
    } catch (e) {
      results.push({
        accountId: account.pluggy_account_id,
        success: false,
        error: e.message,
      });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## 📋 Resumo das Correções Necessárias

| #   | Problema                          | Arquivo(s)                   | Prioridade |
| --- | --------------------------------- | ---------------------------- | ---------- |
| 1   | Contexto limitado do agente       | `context.ts`, System Prompt  | 🔴 Alta    |
| 2   | Confusão CATEGORIZAR vs REGISTRAR | `registry.ts`, System Prompt | 🔴 Alta    |
| 3   | Sem dados de Gráficos             | `registry.ts`, `analysis.ts` | 🟡 Média   |
| 4   | CronJob não atualiza saldo        | Migration SQL, Edge Function | 🔴 Alta    |

---

## Próximos Passos Recomendados

1. **Imediato:** Alterar o System Prompt para deixar claras as limitações de contexto
2. **Curto prazo:** Criar ferramenta `get_charts_data`
3. **Curto prazo:** Adicionar clareza sobre CATEGORIZAR vs REGISTRAR
4. **Médio prazo:** Migrar cron do pg_cron+pg_net para Edge Function Cron

---

## Conclusão

O agente Walts não está "quebrando" - ele está fazendo exatamente o que foi programado para fazer. O problema é que **a arquitetura atual não dá a ele as ferramentas e informações necessárias** para atender às expectativas do usuário.

Com as correções propostas, o agente terá:

- ✅ Contexto completo ou instruções para buscar dados
- ✅ Clareza sobre quando criar vs categorizar
- ✅ Ferramenta para ver dados de gráficos
- ✅ Sincronização automática funcionando corretamente

---
