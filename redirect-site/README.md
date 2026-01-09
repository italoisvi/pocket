# Pocket - Site de Redirecionamento para Reset de Senha

Este site é usado como intermediário entre o email de recuperação de senha e o app Pocket.

## Como fazer deploy no Vercel

### 1. Instale o Vercel CLI (se ainda não tiver)

```bash
npm install -g vercel
```

### 2. Faça login no Vercel

```bash
vercel login
```

### 3. Deploy

```bash
cd C:\Users\italo\source\repo\pocket\redirect-site
vercel --prod
```

### 4. Anote a URL do deploy

Após o deploy, você receberá uma URL como:

```
https://pocket-redirect-xxxxxxx.vercel.app
```

### 5. Atualize a URL no código

Abra o arquivo `app/(auth)/forgot-password.tsx` e substitua:

```typescript
const redirectUrl = 'https://pocket-redirect.vercel.app/';
```

Por:

```typescript
const redirectUrl = 'https://SUA-URL-DO-VERCEL.vercel.app/';
```

### 6. Configure no Supabase

1. Acesse: https://supabase.com/dashboard/project/yiwkuqihujjrxejeybeg
2. Vá em: **Authentication** → **URL Configuration** → **Redirect URLs**
3. Adicione sua URL do Vercel:
   ```
   https://SUA-URL-DO-VERCEL.vercel.app/
   ```
4. Clique em **Save**

### 7. Teste!

1. No app Pocket, vá em "Esqueci a senha"
2. Digite seu email
3. Abra o email
4. Clique no link
5. O app deve abrir automaticamente!

## Como funciona

1. Supabase envia email com link → `https://SUA-URL-DO-VERCEL.vercel.app/#access_token=...`
2. Site extrai tokens do hash da URL
3. Site cria deep link → `pocket://reset-password?tokens=...`
4. Site redireciona automaticamente para o app
5. App recebe tokens e abre tela de reset de senha
