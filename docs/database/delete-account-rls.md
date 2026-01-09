# Políticas RLS para Deleção de Conta

Este documento descreve as políticas de Row Level Security (RLS) implementadas para permitir que usuários deletem suas próprias contas e dados.

## Políticas Implementadas

### Migration: `20260104000000_add_delete_policies.sql`

As seguintes políticas DELETE foram criadas para permitir que usuários autenticados deletem apenas seus próprios dados:

### 1. Profiles

```sql
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (auth.uid() = id);
```

**Descrição:** Permite que usuários deletem seu próprio perfil.

### 2. Expenses

```sql
CREATE POLICY "Users can delete their own expenses"
ON public.expenses
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

**Descrição:** Permite que usuários deletem suas próprias despesas.

### 3. Budgets

```sql
CREATE POLICY "Users can delete their own budgets"
ON public.budgets
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

**Descrição:** Permite que usuários deletem seus próprios orçamentos.

### 4. Pluggy Items

```sql
CREATE POLICY "Users can delete their own pluggy items"
ON public.pluggy_items
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

**Descrição:** Permite que usuários deletem seus próprios itens do Pluggy (conexões bancárias).

### 5. Pluggy Accounts

```sql
CREATE POLICY "Users can delete their own pluggy accounts"
ON public.pluggy_accounts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

**Descrição:** Permite que usuários deletem suas próprias contas bancárias conectadas via Pluggy.

### 6. Pluggy Transactions

```sql
CREATE POLICY "Users can delete their own pluggy transactions"
ON public.pluggy_transactions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

**Descrição:** Permite que usuários deletem suas próprias transações sincronizadas do Pluggy.

### 7. Conversations

```sql
CREATE POLICY "Users can delete their own conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

**Descrição:** Permite que usuários deletem suas próprias conversas.

## Segurança

### Princípios Aplicados

1. **Autenticação Obrigatória**: Todas as políticas requerem que o usuário esteja autenticado (`TO authenticated`).

2. **Isolamento de Dados**: Cada usuário só pode deletar seus próprios dados através da verificação:
   - `auth.uid() = id` para tabela `profiles`
   - `auth.uid() = user_id` para todas as outras tabelas

3. **Proteção Contra Deleção Cruzada**: Um usuário não pode deletar dados de outro usuário, mesmo que conheça o ID.

## Fluxo de Deleção de Conta

Quando um usuário deleta sua conta através do app (Settings → Deletar Conta), o seguinte processo ocorre:

1. **Transações Pluggy** → Deletadas primeiro (FK para `pluggy_accounts` e `expenses`)
2. **Contas Pluggy** → Deletadas (FK para `pluggy_items`)
3. **Items Pluggy** → Deletados
4. **Orçamentos** → Deletados
5. **Despesas** → Deletadas
6. **Conversas** → Deletadas
7. **Perfil** → Deletado por último (FK para `auth.users`)
8. **Logout** → Remove a sessão de autenticação

### Ordem Importante

A ordem de deleção respeita as foreign keys e evita erros de constraint violation.

## Testando as Políticas

Para verificar se as políticas estão funcionando corretamente:

```sql
-- 1. Verificar se RLS está habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'profiles', 'expenses', 'budgets',
  'pluggy_items', 'pluggy_accounts',
  'pluggy_transactions', 'conversations'
);

-- 2. Listar todas as políticas DELETE
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
AND cmd = 'DELETE';
```

## Limitações

- O registro do usuário na tabela `auth.users` **não** é deletado automaticamente
- Para deletar completamente o usuário do sistema de autenticação, seria necessário:
  - Uma Supabase Edge Function com permissões admin, ou
  - Acesso direto ao dashboard do Supabase

## Aplicando a Migration

```bash
# Aplicar a migration no banco remoto
supabase db push

# Verificar o status das migrations
supabase migration list
```

## Data de Criação

- **Migration criada**: 2026-01-04
- **Aplicada ao banco**: 2026-01-04
