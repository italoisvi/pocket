# Trigger de Criação Automática de Perfil

Este documento descreve o trigger que cria automaticamente um perfil quando um novo usuário se cadastra.

## Migration: `20260104000001_create_profile_trigger.sql`

### Função: `handle_new_user()`

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário'),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**O que faz:**

- Extrai o nome do metadata do usuário (`raw_user_meta_data->>'name'`)
- Se não houver nome, usa "Usuário" como padrão
- Cria um registro na tabela `profiles` com o ID do usuário

### Trigger: `on_auth_user_created`

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

**Quando executa:**

- Automaticamente após a inserção de um novo usuário em `auth.users`
- Garante que todo usuário tenha um perfil correspondente

## Fluxo de Cadastro

### 1. Cadastro com E-mail/Senha

```typescript
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      name: name, // ← Vai para raw_user_meta_data
    },
  },
});

// Trigger cria profile automaticamente
// App faz upsert para garantir que o nome está correto
await supabase
  .from('profiles')
  .upsert({ id: data.user.id, name: name }, { onConflict: 'id' });
```

**Sequência:**

1. `signUp()` cria usuário em `auth.users`
2. **Trigger `on_auth_user_created` dispara** ← Automático
3. Profile é criado com nome extraído do metadata
4. App faz `upsert` para garantir nome correto (redundância segura)

### 2. Cadastro com Apple

```typescript
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'apple',
  token: credential.identityToken,
});

// Trigger cria profile automaticamente
// App faz upsert com nome formatado do Apple
if (credential.fullName) {
  const formattedName = formatName(`${firstName} ${lastName}`);
  await supabase
    .from('profiles')
    .upsert({ id: data.user.id, name: formattedName }, { onConflict: 'id' });
}
```

**Sequência:**

1. `signInWithIdToken()` cria/autentica usuário
2. **Trigger `on_auth_user_created` dispara** (se for novo usuário)
3. Profile é criado com "Usuário" como padrão
4. App faz `upsert` com nome real do Apple

## Por que UPSERT?

O código do app usa `upsert` em vez de `update` por segurança:

```typescript
// ✅ UPSERT (atual)
.upsert({ id: data.user.id, name: name }, { onConflict: 'id' });

// ❌ UPDATE (anterior - poderia falhar)
.update({ name: name }).eq('id', data.user.id);
```

**Vantagens:**

- ✅ Funciona mesmo se o trigger falhar
- ✅ Funciona se o perfil já existir
- ✅ Funciona se o perfil não existir ainda
- ✅ Não há race condition

## Testando o Trigger

### Verificar se o trigger existe

```sql
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

### Verificar se a função existe

```sql
SELECT
  proname,
  prosrc
FROM pg_proc
WHERE proname = 'handle_new_user';
```

### Teste manual

```sql
-- 1. Criar usuário de teste (via SQL)
INSERT INTO auth.users (
  id,
  email,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'teste@exemplo.com',
  '{"name": "João Silva"}'::jsonb
);

-- 2. Verificar se o perfil foi criado
SELECT id, name, created_at
FROM public.profiles
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'teste@exemplo.com'
);
```

## Resolução de Problemas

### Profile não é criado

**Possíveis causas:**

1. Trigger não está ativo
2. Função tem erro de sintaxe
3. Permissões insuficientes

**Solução:**

```bash
# Reaplicar migration
supabase db push

# Verificar logs
supabase logs
```

### Nome não aparece no perfil

**Possíveis causas:**

1. Metadata não foi enviado no `signUp()`
2. Upsert não foi executado
3. Nome é `null` ou vazio

**Solução:**

```typescript
// Garantir que o nome está sendo enviado
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      name: name, // ← Verificar se não está vazio
    },
  },
});
```

## Estrutura do Profile

```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  name text, -- ← Preenchido pelo trigger ou upsert
  monthly_salary numeric,
  salary_payment_day integer DEFAULT 1,
  avatar_url text,
  income_source text,
  payment_day integer,
  income_cards jsonb DEFAULT '[]'::jsonb,
  debt_notifications_enabled boolean DEFAULT false
);
```

## Benefícios

✅ **Automático** - Não precisa criar perfil manualmente
✅ **Consistente** - Todo usuário sempre tem perfil
✅ **Seguro** - Trigger + upsert = redundância segura
✅ **Simples** - Extrai nome do metadata automaticamente

## Data de Criação

- **Migration criada**: 2026-01-04
- **Aplicada ao banco**: 2026-01-04
