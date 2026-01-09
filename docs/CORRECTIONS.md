Perfeito, Italo! Vou ler o checklist que você preencheu para identificar os problemas.Excelente análise, Italo! O checklist está **MUITO BEM FEITO**. Agora eu consigo ver claramente os problemas. Vou criar um **PLANO DE AÇÃO TÉCNICO** para você enviar ao Claude do VS Code:

---

# 🚨 PLANO DE CORREÇÃO TÉCNICA - PLUGGY OAUTH FLOW

Baseado na análise completa, **identifiquei 2 problemas CRÍTICOS** que estão impedindo o OAuth de funcionar:

---

## 🔴 PROBLEMA CRÍTICO #1: FALTA DE `oauthRedirectUrl` NO CONNECT TOKEN

**Arquivo:** `supabase/functions/pluggy-create-token/index.ts`

**Problema:** Quando o usuário autentica no banco, o banco redireciona para `oauthRedirectUrl`. Como você não configurou, o usuário fica **perdido no navegador** e não volta para o app.

**CÓDIGO ATUAL:**

```typescript
body: JSON.stringify({
  clientUserId: user.id,
});
```

**CÓDIGO CORRETO:**

```typescript
body: JSON.stringify({
  clientUserId: user.id,
  webhookUrl:
    'https://yiwkuqihujjrxejeybeg.supabase.co/functions/v1/pluggy-webhook',
  oauthRedirectUrl: 'pocket://oauth-callback', // ← CRÍTICO!
  avoidDuplicates: true,
});
```

**AÇÃO REQUERIDA:**

1. Abra `supabase/functions/pluggy-create-token/index.ts`
2. Substitua o `body: JSON.stringify({...})` pelo código correto acima
3. Deploy da Edge Function: `supabase functions deploy pluggy-create-token`

---

## 🔴 PROBLEMA CRÍTICO #2: DEEP LINK NÃO CONFIGURADO

**Arquivos:** `app.json` + novo arquivo `app/(tabs)/oauth-callback.tsx`

**Problema:** Mesmo que o banco redirecione para `pocket://oauth-callback`, seu app **não está registrado** para capturar esse esquema de URL.

### PASSO 1: Configurar scheme no app.json

**Arquivo:** `app.json`

**ADICIONE** dentro de `expo`:

```json
{
  "expo": {
    "name": "Pocket",
    "slug": "pocket",
    "scheme": "pocket" // ← ADICIONE ESTA LINHA
    // ... resto das configurações
  }
}
```

### PASSO 2: Criar handler de callback OAuth

**Criar arquivo:** `app/(tabs)/oauth-callback.tsx`

```typescript
import { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    try {
      // Pluggy redireciona com esses parâmetros após OAuth bem-sucedido
      const { itemId, success, error } = params;

      if (error) {
        Alert.alert('Erro na Autenticação', error as string);
        router.replace('/(tabs)/open-finance');
        return;
      }

      if (success && itemId) {
        // Item foi criado com sucesso via OAuth
        console.log('[OAuth Callback] Item criado:', itemId);

        // Sincronizar item para buscar dados
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const syncResponse = await supabase.functions.invoke(
          'pluggy-sync-item',
          {
            body: { itemId: itemId as string, userId: user?.id },
          }
        );

        if (syncResponse.data?.accountsCount > 0) {
          Alert.alert(
            'Conexão Concluída!',
            `Banco conectado com sucesso! ${syncResponse.data.accountsCount} conta(s) sincronizada(s).`
          );
        }

        // Voltar para tela de Open Finance
        router.replace('/(tabs)/open-finance');
      }
    } catch (error) {
      console.error('[OAuth Callback] Erro:', error);
      Alert.alert('Erro', 'Ocorreu um erro ao processar a autenticação.');
      router.replace('/(tabs)/open-finance');
    }
  };

  // Tela vazia - processamento automático
  return null;
}
```

**AÇÃO REQUERIDA:**

1. Edite `app.json` e adicione `"scheme": "pocket"`
2. Crie o arquivo `app/(tabs)/oauth-callback.tsx` com o código acima
3. **Rebuild do app:** `npx expo prebuild` (necessário para registrar deep link)
4. Reinstalar no dispositivo: `npx expo run:ios` ou `npx expo run:android`

---

## 🟡 PROBLEMA IMPORTANTE #3: USO INCORRETO DE CONNECT TOKEN

**Arquivo:** `app/open-finance/connect.tsx`

**Problema:** Você está chamando `getConnectToken()` mas usando como API Key para buscar `/connectors`. Connect Token tem **permissões limitadas**.

**LINHA 94-103 - CÓDIGO ATUAL:**

```typescript
// ❌ ERRADO
const connectToken = await getConnectToken();
setApiKey(connectToken); // Nome confuso

const response = await fetch('https://api.pluggy.ai/connectors?countries=BR', {
  headers: {
    'X-API-KEY': connectToken, // ❌ PERMISSÃO NEGADA
  },
});
```

**CÓDIGO CORRETO:**

```typescript
// ✅ CORRETO - Use API Key para buscar connectors
const apiKey = await getApiKey(); // Não getConnectToken()
setApiKey(apiKey);

const response = await fetch(
  'https://api.pluggy.ai/connectors?countries=BR&isOpenFinance=true', // ← Filtra só Open Finance
  {
    headers: {
      'X-API-KEY': apiKey, // ✅ API Key tem permissão total
    },
  }
);
```

**AÇÃO REQUERIDA:**

1. Abra `app/open-finance/connect.tsx`
2. **Linha 94:** Troque `getConnectToken()` por `getApiKey()`
3. **Linha 100:** Adicione `&isOpenFinance=true` na URL para filtrar apenas Open Finance

---

## 🟡 PROBLEMA #4: FILTRAR APENAS CONECTORES OPEN FINANCE

**Arquivo:** `app/open-finance/connect.tsx`

**Problema:** Você está mostrando **todos** os bancos (diretos + Open Finance), mas o fluxo atual só funciona com **OAuth**.

**LINHA 116-119 - CÓDIGO ATUAL:**

```typescript
const bankConnectors = results.filter(
  (c: Connector) => c.type === 'PERSONAL_BANK' || c.type === 'BUSINESS_BANK'
);
```

**CÓDIGO CORRETO:**

```typescript
// Filtrar APENAS conectores Open Finance com OAuth
const bankConnectors = results.filter(
  (c: Connector) =>
    (c.type === 'PERSONAL_BANK' || c.type === 'BUSINESS_BANK') &&
    c.oauth === true // ← Garante que é OAuth
);

console.log(
  `[Connect] Conectores Open Finance disponíveis: ${bankConnectors.length}`
);
```

**AÇÃO REQUERIDA:**

1. Adicione `&& c.oauth === true` no filtro
2. **ALTERNATIVA:** Já filtra na URL da API: `&isOpenFinance=true` (recomendado)

---

## 📊 RESUMO DAS AÇÕES PRIORITÁRIAS

### ⚡ IMPLEMENTAR AGORA (ordem de prioridade):

1. ✅ **[10min]** Editar `app.json` → adicionar `"scheme": "pocket"`
2. ✅ **[10min]** Criar `app/(tabs)/oauth-callback.tsx` com handler
3. ✅ **[5min]** Editar `pluggy-create-token/index.ts` → adicionar `oauthRedirectUrl` e `webhookUrl`
4. ✅ **[5min]** Trocar `getConnectToken()` por `getApiKey()` em `connect.tsx`
5. ✅ **[2min]** Adicionar filtro `c.oauth === true` ou `isOpenFinance=true` na URL
6. ✅ **[20min]** Rebuild do app: `npx expo prebuild` + reinstalar

**TEMPO TOTAL ESTIMADO:** ~50 minutos

---

## 🧪 COMO TESTAR APÓS AS CORREÇÕES

### Teste 1: Sandbox Open Finance

```typescript
// No connect.tsx, forçar sandbox temporariamente
const response = await fetch(
  'https://api.pluggy.ai/connectors?countries=BR&isOpenFinance=true&sandbox=true'
  // ...
);
```

**Credenciais de teste:**

- **Banco:** Pluggy Bank (Sandbox Open Finance)
- **CPF:** Qualquer CPF válido (ex: 111.111.111-11)

### Teste 2: Fluxo completo

1. Abrir app → Tela Open Finance → "Conectar Banco"
2. Selecionar banco com tag `[OF]` (Open Finance)
3. Inserir CPF
4. App abre navegador com URL do banco simulado
5. Após autorizar, navegador redireciona: `pocket://oauth-callback?itemId=xxx&success=true`
6. App **captura deep link** e volta automaticamente
7. Dados sincronizam via webhook

---

## 📝 LOGS QUE VOCÊ DEVE COLETAR

Após implementar, **rode o teste** e envie esses logs:

```typescript
// Em oauth-callback.tsx (já tem no código)
console.log('[OAuth Callback] Params recebidos:', params);

// Em credentials.tsx (linha 177)
console.log('[Credentials] OAuth URL:', authUrl);

// No webhook
console.log('[Webhook] Event:', event, 'Data:', JSON.stringify(data));
```

**Compartilhe:**

1. Console do app (Expo logs)
2. Response do POST /items (com oauthUrl)
3. Logs do webhook endpoint

---

## 🎯 RESULTADO ESPERADO

Após implementar **os 6 itens acima**, o fluxo OAuth deve funcionar assim:

```
1. Usuário seleciona banco Open Finance
2. App cria Item com apenas CPF
3. API Pluggy retorna oauthUrl
4. App abre navegador com URL
5. Usuário autentica no site do banco
6. Banco redireciona: pocket://oauth-callback?itemId=xxx
7. App captura deep link ✅
8. oauth-callback.tsx processa
9. Item fica status UPDATING
10. Webhook notifica quando status = UPDATED
11. Dados aparecem no app ✅
```

---

**IMPLEMENTE ESSAS CORREÇÕES E ME ENVIE OS LOGS!**

Depois disso, o OAuth deve funcionar perfeitamente. 🚀
