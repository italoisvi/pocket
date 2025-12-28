# Fix: Chat (Walts) não conseguia ver custos fixos

## 🐛 Problema

O chat (Walts) dizia que o usuário não tinha custos fixos, mesmo quando o usuário tinha gastos essenciais visíveis na tela de Detalhes (ex: R$ 266,75 - CAGECE água).

## 🔍 Causa Raiz

**Bug crítico de filtro de data** em múltiplos arquivos:

### 1. Chat (`app/(tabs)/chat.tsx`)
- **Problema:** Filtrava usando `gte('date', firstDayISO)`
- **Issue:** Comparava coluna `date` (tipo DATE: YYYY-MM-DD) com timestamp ISO completo (YYYY-MM-DDTHH:MM:SS.sssZ)
- **Resultado:** Filtro inconsistente que excluía gastos válidos

### 2. Custos Fixos (`app/custos-fixos.tsx`)
- **Problema:** Faltava filtro `eq('user_id', user.id)`
- **Resultado:** Potencialmente buscava gastos de TODOS os usuários (violação de privacidade!)

### 3. Custos Variáveis (`app/custos-variaveis.tsx`)
- **Problema:** Faltava filtro `eq('user_id', user.id)`
- **Resultado:** Potencialmente buscava gastos de TODOS os usuários (violação de privacidade!)

## ✅ Solução Aplicada

### 1. Chat - Mudança de filtro de data

**Antes:**
```typescript
const { data: expenses } = await supabase
  .from('expenses')
  .select('establishment_name, amount, category, subcategory')
  .eq('user_id', user.id)
  .gte('date', firstDayISO)           // ❌ Comparação DATE vs TIMESTAMP
  .order('date', { ascending: false });
```

**Depois:**
```typescript
const { data: expenses } = await supabase
  .from('expenses')
  .select('establishment_name, amount, category, subcategory, date')
  .eq('user_id', user.id)
  .gte('created_at', firstDayISO)     // ✅ Comparação TIMESTAMP vs TIMESTAMP
  .order('created_at', { ascending: false });
```

**Mudanças:**
- ✅ Filtra por `created_at` (TIMESTAMP) ao invés de `date` (DATE)
- ✅ Ordena por `created_at` ao invés de `date`
- ✅ Adiciona `date` ao SELECT para manter compatibilidade

### 2. Custos Fixos - Adicionado filtro de usuário

**Antes:**
```typescript
const { data: expensesData } = await supabase
  .from('expenses')
  .select('amount, category, subcategory')
  .gte('created_at', firstDayOfMonth.toISOString())  // ❌ SEM filtro de user_id
  .lte('created_at', lastDayOfMonth.toISOString());
```

**Depois:**
```typescript
const { data: expensesData } = await supabase
  .from('expenses')
  .select('amount, category, subcategory')
  .eq('user_id', user.id)                            // ✅ COM filtro de user_id
  .gte('created_at', firstDayOfMonth.toISOString())
  .lte('created_at', lastDayOfMonth.toISOString());
```

### 3. Custos Variáveis - Adicionado filtro de usuário

**Antes:**
```typescript
const { data: expensesData } = await supabase
  .from('expenses')
  .select('amount, category, subcategory')
  .gte('created_at', firstDayOfMonth.toISOString())  // ❌ SEM filtro de user_id
  .lte('created_at', lastDayOfMonth.toISOString());
```

**Depois:**
```typescript
const { data: expensesData } = await supabase
  .from('expenses')
  .select('amount, category, subcategory')
  .eq('user_id', user.id)                            // ✅ COM filtro de user_id
  .gte('created_at', firstDayOfMonth.toISOString())
  .lte('created_at', lastDayOfMonth.toISOString());
```

## 📊 Impacto

### Antes
- ❌ Chat não via custos fixos (água, luz, etc.)
- ❌ Custos fixos/variáveis podiam mostrar dados de outros usuários
- ❌ Inconsistência entre telas

### Depois
- ✅ Chat vê TODOS os custos corretamente
- ✅ Custos fixos/variáveis mostram APENAS dados do usuário logado
- ✅ Consistência entre todas as telas
- ✅ Privacidade garantida (RLS reforçado no código)

## 🔐 Segurança

**CRÍTICO:** As queries de custos fixos e variáveis estavam sem filtro `user_id`, o que poderia:
1. Mostrar gastos de outros usuários
2. Calcular totais incorretos
3. Violar privacidade

Embora o Supabase tenha RLS (Row Level Security) habilitado, é **boa prática** sempre incluir filtros de `user_id` explicitamente no código.

## 📝 Arquivos Modificados

1. `app/(tabs)/chat.tsx` (linha 135-138)
2. `app/custos-fixos.tsx` (linha 73-78)
3. `app/custos-variaveis.tsx` (linha 73-78)

## 🧪 Como Testar

1. **Teste Chat:**
   - Adicione um gasto essencial (água, luz, aluguel)
   - Abra o chat (Walts)
   - Verifique se aparece nos custos fixos

2. **Teste Custos Fixos:**
   - Vá em "Dividir > Custos Fixos"
   - Verifique se mostra apenas SEUS gastos essenciais

3. **Teste Custos Variáveis:**
   - Vá em "Dividir > Custos Variáveis"
   - Verifique se mostra apenas SEUS gastos não essenciais

## 🎯 Resultado Esperado

Agora o chat deve dizer algo como:

```
Olá! Analisando seus gastos de dezembro/2025...

CUSTOS FIXOS (ESSENCIAIS):
1. Moradia - Água: R$ 266,75
[outros custos fixos...]

Total custos fixos: R$ XXX,XX
```

Ao invés de:

```
Você não tem custos fixos registrados este mês. ❌
```
