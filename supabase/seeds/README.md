# Seeds para Sistema de Eval do Walts

## Setup Completo (primeira vez)

### 1. Criar usuário de teste no Supabase

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Vá em **Authentication** > **Users**
3. Clique em **Add user** > **Create new user**
4. Preencha:
   - Email: `eval-test@pocket.app`
   - Password: `EvalTest123!`
   - Marque **Auto Confirm User**
5. Clique em **Create user**
6. **Copie o UUID** do usuário criado

### 2. Executar seeds no SQL Editor

Execute na ordem:

```sql
-- 1. Primeiro: Criar tabelas de eval (se ainda não existem)
-- Cole o conteúdo de: migrations/agent_eval_tables.sql

-- 2. Segundo: Dados do usuário de teste
-- Cole o conteúdo de: seeds/eval-test-user.sql

-- 3. Terceiro: Casos de teste
-- Cole o conteúdo de: seeds/eval-cases.sql
```

### 3. Verificar setup

```sql
-- Verificar usuário de teste
SELECT id, email FROM auth.users WHERE email = 'eval-test@pocket.app';

-- Verificar dados do usuário
SELECT 'profiles' as tbl, count(*) FROM profiles WHERE id = 'SEU_UUID'
UNION ALL SELECT 'budgets', count(*) FROM budgets WHERE user_id = 'SEU_UUID'
UNION ALL SELECT 'expenses', count(*) FROM expenses WHERE user_id = 'SEU_UUID';

-- Verificar casos de eval
SELECT domain, count(*) FROM agent_eval_cases GROUP BY domain ORDER BY domain;
```

---

## Rodar Evals

### Via cURL

```bash
# Rodar todos os casos
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/walts-eval-runner" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "test_user_id": "UUID_DO_USUARIO_DE_TESTE",
    "run_group": "manual-2026-01-15"
  }'

# Rodar apenas um domínio
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/walts-eval-runner" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "test_user_id": "UUID_DO_USUARIO_DE_TESTE",
    "domain": "expenses"
  }'
```

### Via Supabase CLI

```bash
# Deploy das funções primeiro
supabase functions deploy walts-agent
supabase functions deploy walts-eval-runner

# Invocar localmente
supabase functions invoke walts-eval-runner --body '{
  "test_user_id": "UUID_DO_USUARIO_DE_TESTE",
  "run_group": "local-test"
}'
```

---

## Ver Resultados

```sql
-- Últimas execuções
SELECT
  r.run_group,
  c.name as case_name,
  c.domain,
  r.pass,
  r.score,
  r.error,
  r.finished_at
FROM agent_eval_runs r
JOIN agent_eval_cases c ON r.case_id = c.id
ORDER BY r.finished_at DESC
LIMIT 20;

-- Resumo por run_group
SELECT
  run_group,
  count(*) as total,
  sum(case when pass then 1 else 0 end) as passed,
  round(avg(score)::numeric, 2) as avg_score,
  min(started_at) as started,
  max(finished_at) as finished
FROM agent_eval_runs
GROUP BY run_group
ORDER BY max(finished_at) DESC;

-- Casos que mais falham
SELECT
  c.name,
  c.domain,
  count(*) as runs,
  sum(case when r.pass then 1 else 0 end) as passed,
  round(100.0 * sum(case when r.pass then 1 else 0 end) / count(*), 1) as pass_rate
FROM agent_eval_runs r
JOIN agent_eval_cases c ON r.case_id = c.id
GROUP BY c.id, c.name, c.domain
HAVING count(*) > 0
ORDER BY pass_rate ASC;
```

---

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `eval-cases.sql` | 20 casos de teste cobrindo todas as tools principais |
| `eval-test-user.sql` | Dados seed do usuário de teste (profile, budgets, expenses, etc) |
| `README.md` | Este arquivo |
