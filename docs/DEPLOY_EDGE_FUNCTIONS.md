# Como fazer Deploy das Edge Functions no Supabase

## 📋 Pré-requisitos

1. Ter o Supabase CLI instalado
2. Estar logado no Supabase CLI

---

## 🚀 Passo a Passo

### 1. Instalar Supabase CLI (se ainda não tiver)

**Windows (PowerShell):**

```powershell
scoop install supabase
```

Ou via NPM:

```bash
npm install -g supabase
```

**Verificar instalação:**

```bash
supabase --version
```

---

### 2. Fazer Login no Supabase

```bash
supabase login
```

Isso abrirá o navegador para você fazer login.

---

### 3. Linkar o projeto local com o projeto do Supabase

```bash
supabase link --project-ref SEU_PROJECT_REF
```

**Como encontrar o PROJECT_REF:**

1. Acesse https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings** → **General**
4. Copie o **Reference ID**

**Exemplo:**

```bash
supabase link --project-ref abcdefghijklmnop
```

---

### 4. Deploy das Edge Functions

**Deploy TODAS as funções de uma vez:**

```bash
supabase functions deploy
```

**Ou deploy individual:**

```bash
supabase functions deploy pluggy-create-token
supabase functions deploy pluggy-sync-item
supabase functions deploy pluggy-sync-transactions
```

---

## ✅ Verificar Deploy

Após o deploy, você pode verificar se as funções estão ativas:

1. Acesse https://app.supabase.com
2. Vá em **Edge Functions** no menu lateral
3. Você deve ver as 3 funções listadas:
   - `pluggy-create-token`
   - `pluggy-sync-item`
   - `pluggy-sync-transactions`

---

## 🧪 Testar as Funções

Você pode testar diretamente no Supabase Dashboard:

1. Clique em uma função
2. Vá na aba **Invocations**
3. Clique em **Invoke function**
4. Adicione o body (se necessário)
5. Clique em **Send request**

**Exemplo de teste para `pluggy-create-token`:**

- Método: POST
- Body: (vazio, usa o token do usuário logado)
- Headers: Authorization com token do Supabase

---

## 🔧 Comandos Úteis

### Ver logs em tempo real:

```bash
supabase functions logs pluggy-create-token --tail
```

### Deletar uma função:

```bash
supabase functions delete pluggy-create-token
```

### Listar funções:

```bash
supabase functions list
```

---

## ⚠️ Importante

1. **Variáveis de Ambiente**: Certifique-se de que as variáveis `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` estão configuradas em:
   - **Settings** → **Edge Functions** → **Environment Variables**

2. **CORS**: As funções já estão configuradas para aceitar requisições do app

3. **Autenticação**: Todas as funções verificam o token do Supabase antes de executar

---

## 📚 Documentação Oficial

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli/introduction)
