# 🔍 CHECKLIST TÉCNICO - IMPLEMENTAÇÃO PLUGGY OPEN FINANCE

Data: 2026-01-02
Status: Análise Técnica Completa

---

## 🔐 1. AUTENTICAÇÃO - SERVIDOR vs CLIENTE

### 1.1 Endpoint backend para gerar API Key usando CLIENT_ID e CLIENT_SECRET

**✅ SIM - IMPLEMENTADO CORRETAMENTE**

**Localização:** `supabase/functions/pluggy-get-api-key/index.ts`

**Código do endpoint POST /auth:**

```typescript
const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');

serve(async (req) => {
  // Gerar API Key da Pluggy
  const response = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    }),
  });

  const { apiKey } = await response.json();
  return new Response(JSON.stringify({ apiKey }), { headers });
});
```

---

### 1.2 Endpoint backend para gerar Connect Tokens

**✅ SIM - IMPLEMENTADO CORRETAMENTE**

**Localização:** `supabase/functions/pluggy-create-token/index.ts`

**Código do endpoint POST /connect_token:**

```typescript
// 1. Primeiro gera API Key
const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: PLUGGY_CLIENT_ID,
    clientSecret: PLUGGY_CLIENT_SECRET,
  }),
});

const { apiKey } = await apiKeyResponse.json();

// 2. Depois gera Connect Token usando o API Key
const connectTokenResponse = await fetch(
  'https://api.pluggy.ai/connect_token',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey, // ✅ USA API KEY NO HEADER
    },
    body: JSON.stringify({
      clientUserId: user.id,
    }),
  }
);

const { accessToken } = await connectTokenResponse.json();
return new Response(JSON.stringify({ connectToken: accessToken }), { headers });
```

**✅ CONFIRMADO:** Este endpoint usa o API Key (não CLIENT_ID/SECRET) no header X-API-KEY

---

### 1.3 CLIENT_ID/CLIENT_SECRET sendo passado para frontend?

**✅ NÃO - SEGURO**

- Credentials ficam **apenas no backend** (variáveis de ambiente Supabase)
- Frontend recebe apenas Connect Token ou API Key **temporários**
- **SEM VIOLAÇÃO DE SEGURANÇA**

---

### 1.4 Connect Token gerado com opções corretas?

**⚠️ PARCIALMENTE - FALTAM OPÇÕES IMPORTANTES**

**Código atual:**

```typescript
body: JSON.stringify({
  clientUserId: user.id, // ✅ OK
});
```

**❌ FALTAM:**

```typescript
{
  "clientUserId": user.id,                           // ✅ OK
  "webhookUrl": "https://seu-supabase.co/functions/v1/pluggy-webhook",  // ❌ AUSENTE
  "avoidDuplicates": true,                          // ❌ AUSENTE
  "oauthRedirectUrl": "myapp://oauth-callback"      // ❌ AUSENTE (CRÍTICO para OAuth)
}
```

**🚨 PROBLEMA IDENTIFICADO #1:** Falta configurar `webhookUrl` e `oauthRedirectUrl` no Connect Token

---

## 🔌 2. PLUGGY CONNECT WIDGET - INTEGRAÇÃO

### 2.1 Biblioteca/package usado para Pluggy Connect

**❌ NÃO ESTÁ USANDO PLUGGY CONNECT WIDGET**

- **Implementação atual:** API direta sem widget
- **Abordagem:** Custom UI com chamadas diretas à API Pluggy
- **Frontend:** React Native puro (não usa react-native-pluggy-connect)

**Fluxo atual:**

1. `connect.tsx` - Lista bancos via GET /connectors
2. `credentials.tsx` - Formulário manual de credenciais
3. POST /items direto via fetch

---

### 2.2 Inicialização do PluggyConnect Widget

**❌ NÃO APLICÁVEL - Widget não está sendo usado**

**Observação:** A implementação atual cria items diretamente via API, sem usar o Pluggy Connect Widget oficial.

---

### 2.3 Connect Token vs API Key no frontend

**⚠️ PROBLEMA IDENTIFICADO #2 - USO INCORRETO**

**No arquivo `connect.tsx` (linha 94-103):**

```typescript
// ❌ ERRADO: Chama getConnectToken mas usa como API Key
const connectToken = await getConnectToken();
setApiKey(connectToken); // ❌ Nome da variável está errado

// Buscar lista de connectors
const response = await fetch('https://api.pluggy.ai/connectors?countries=BR', {
  headers: {
    'X-API-KEY': connectToken, // ❌ USANDO CONNECT TOKEN COMO API KEY
  },
});
```

**🚨 PROBLEMA CRÍTICO:** Connect Token tem permissões limitadas. Para buscar `/connectors`, deve usar **API Key**, não Connect Token.

**No arquivo `credentials.tsx` (linha 122-133):**

```typescript
// ❌ ERRADO: Usa o "apiKey" (que é na verdade Connect Token) para criar item
const createItemResponse = await fetch('https://api.pluggy.ai/items', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-KEY': apiKey, // ❌ Está usando Connect Token aqui também
  },
  body: JSON.stringify({
    connectorId: parseInt(connectorId),
    parameters: cleanedFormData,
  }),
});
```

**🚨 PROBLEMA CRÍTICO #3:** Está usando Connect Token para criar items diretamente. Isso pode funcionar mas **não é a arquitetura recomendada pela Pluggy**.

---

### 2.4 Callbacks essenciais configurados?

**❌ NÃO APLICÁVEL - Widget não está sendo usado**

Não há `onSuccess`, `onError` callbacks pois não está usando o widget oficial.

---

### 2.5 Filtro de conectores Open Finance

**❌ NÃO CONFIGURADO**

**Código atual em `connect.tsx` (linha 116-119):**

```typescript
// Filtrar apenas bancos (PERSONAL_BANK e BUSINESS_BANK)
const bankConnectors = results.filter(
  (c: Connector) => c.type === 'PERSONAL_BANK' || c.type === 'BUSINESS_BANK'
);
```

**❌ FALTAM:**

```typescript
// ❌ Não filtra por isOpenFinance=true
// ❌ Não filtra por oauth=true
// ❌ Não separa conectores diretos de Open Finance
```

**🚨 PROBLEMA #4:** Não está filtrando apenas conectores Open Finance, pode listar conectores diretos também.

---

## 🔄 3. FLUXO OAUTH - OPEN FINANCE

### 3.1 Identificação de conectores Open Finance com oauth: true

**❌ NÃO IDENTIFICADO NO CÓDIGO**

**Deveria ter:**

```typescript
const connector = results.find((c) => c.id === 601); // Itaú Open Finance
console.log(connector.oauth); // true
console.log(connector.isOpenFinance); // true
```

**Código atual:** Não verifica essas propriedades ao listar bancos.

---

### 3.2 Credenciais enviadas para Open Finance

**✅ CORRETO - Apenas CPF**

**Em `credentials.tsx` (linha 107-118):**

```typescript
// Remove formatação do CPF antes de enviar
const cleanedFormData: Record<string, string> = {};
for (const [key, value] of Object.entries(formData)) {
  const field = credentials.find((f) => f.name === key);
  const isCPFField =
    field?.label.toLowerCase().includes('cpf') ||
    field?.name.toLowerCase().includes('cpf') ||
    field?.name.toLowerCase().includes('document');

  // Se for CPF, remover formatação (deixar só números)
  cleanedFormData[key] = isCPFField ? value.replace(/\D/g, '') : value;
}
```

**✅ CONFIRMADO:** Para Open Finance, apenas CPF/CNPJ é enviado (não senha).

---

### 3.3 Após criar Item, recebe oauthUrl na resposta?

**⚠️ NÃO TESTADO - Precisa de exemplo real**

**Código esperado no parâmetro:**

```typescript
{
  "parameter": {
    "name": "oauth_code",
    "data": "https://oauth.pluggy.ai/v1/..." // OU
    "data": {
      "url": "https://oauth.pluggy.ai/v1/..."
    }
  }
}
```

**Código atual em `credentials.tsx` (linha 177-183):**

```typescript
if (isOAuth) {
  // OAuth: Abrir URL de autenticação do banco
  const authUrl = fullItem.parameter.data?.url || fullItem.parameter.data;

  if (authUrl && typeof authUrl === 'string') {
    console.log('[credentials] OAuth URL:', authUrl);
    setOauthUrl(authUrl);
    setOauthVisible(true);
  }
}
```

**✅ IMPLEMENTADO:** Código detecta e extrai OAuth URL corretamente.

**❓ NÃO CONFIRMADO:** Precisa testar com banco real Open Finance para ver resposta exata.

---

### 3.4 Redirecionamento do usuário para oauthUrl

**✅ IMPLEMENTADO**

**Arquivo:** `components/OAuthModal.tsx`

```typescript
const handleOpenOAuth = async () => {
  const canOpen = await Linking.canOpenURL(oauthUrl);

  if (!canOpen) {
    Alert.alert('Erro', 'Não foi possível abrir o link de autenticação...');
    return;
  }

  await Linking.openURL(oauthUrl); // ✅ Abre URL OAuth

  Alert.alert(
    'Aguardando Autenticação',
    `Você será redirecionado para o ${connectorName}...`
  );
};
```

**✅ IMPLEMENTADO CORRETAMENTE**

---

### 3.5 oauthRedirectUrl configurado no Connect Token

**❌ NÃO CONFIGURADO**

**Código atual em `pluggy-create-token/index.ts`:**

```typescript
body: JSON.stringify({
  clientUserId: user.id,
  // ❌ FALTA: oauthRedirectUrl: "myapp://oauth-callback"
});
```

**🚨 PROBLEMA CRÍTICO #5:** Sem `oauthRedirectUrl`, o usuário NÃO CONSEGUE VOLTAR ao app após autenticar no banco.

**Deveria ter:**

```typescript
body: JSON.stringify({
  clientUserId: user.id,
  webhookUrl:
    'https://yiwkuqihujjrxejeybeg.supabase.co/functions/v1/pluggy-webhook',
  oauthRedirectUrl: 'pocket://oauth-callback', // ❌ AUSENTE
  avoidDuplicates: true,
});
```

---

### 3.6 Deep link (mobile) ou callback OAuth implementado

**❌ NÃO IMPLEMENTADO**

**Procurado em:**

- `app.json` / `app.config.js` - Não encontrado esquema de deep link
- `app/_layout.tsx` - Sem handler de deep link
- Nenhum arquivo com "oauth-callback" ou deep link handler

**🚨 PROBLEMA CRÍTICO #6:** Usuário será redirecionado ao banco mas **não conseguirá voltar ao app** após autenticar.

**Precisa implementar:**

1. Configurar deep link em `app.json`:

```json
{
  "expo": {
    "scheme": "pocket"
  }
}
```

2. Criar handler de deep link:

```typescript
// app/oauth-callback.tsx
import { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';

export default function OAuthCallback() {
  const params = useLocalSearchParams();

  useEffect(() => {
    // Extrair itemId da query string
    const itemId = params.itemId;

    // Redirecionar de volta para open-finance
    router.replace('/open-finance');
  }, []);
}
```

---

## 📊 4. RECUPERAÇÃO DE DADOS

### 4.1 itemId armazenado após conexão bem-sucedida

**✅ SIM - Via Edge Function**

**Em `credentials.tsx` após criar item:**

```typescript
const itemData = await createItemResponse.json();
console.log('[credentials] Item created:', itemData.id);

// Sincronizar Item e Accounts no Supabase
const syncResult = await syncItem(itemData.id); // ✅ Passa itemId
```

**Edge Function `pluggy-sync-item` salva no banco:**

```typescript
const { error: itemError } = await supabase.from('pluggy_items').upsert(
  {
    pluggy_item_id: item.id, // ✅ Salva itemId da Pluggy
    user_id: user.id, // ✅ Vincula ao usuário
    connector_id: item.connector.id,
    connector_name: item.connector.name,
    status: item.status,
  },
  { onConflict: 'pluggy_item_id' }
);
```

**✅ IMPLEMENTADO CORRETAMENTE**

---

### 4.2 Buscar contas do backend (não frontend)

**✅ SIM - Backend**

**Arquivo:** `supabase/functions/pluggy-sync-item/index.ts` (linha 122-175)

```typescript
// Buscar contas do Item
const accountsResponse = await fetch(
  `https://api.pluggy.ai/accounts?itemId=${itemId}`,
  { headers: { 'X-API-KEY': apiKey } } // ✅ Usa API Key no backend
);

const { results: accounts } = await accountsResponse.json();

// Salvar contas no banco
for (const account of accounts) {
  await supabase.from('pluggy_accounts').upsert({
    pluggy_account_id: account.id,
    user_id: user.id,
    item_id: itemData.id,
    type: account.type,
    balance: account.balance,
    // ...
  });
}
```

**✅ IMPLEMENTADO CORRETAMENTE - Tudo no backend**

---

### 4.3 Buscar transações do backend (não frontend)

**✅ SIM - Backend**

**Arquivo:** `supabase/functions/pluggy-sync-transactions/index.ts` (linha 78-156)

```typescript
// Construir URL com filtros opcionais
let transactionsUrl = `https://api.pluggy.ai/transactions?accountId=${accountId}&pageSize=500`;
if (from) transactionsUrl += `&from=${from}`;
if (to) transactionsUrl += `&to=${to}`;

// Buscar transações
const transactionsResponse = await fetch(transactionsUrl, {
  headers: { 'X-API-KEY': apiKey }, // ✅ Usa API Key no backend
});

const { results: transactions } = await transactionsResponse.json();

// Salvar transações no banco
for (const transaction of transactions) {
  await supabase.from('pluggy_transactions').insert({
    pluggy_transaction_id: transaction.id,
    user_id: user.id,
    account_id: accountData.id,
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date.split('T')[0],
    // ...
  });
}
```

**✅ IMPLEMENTADO CORRETAMENTE - Tudo no backend**

---

### 4.4 Confirmação: NÃO buscando transações do frontend com Connect Token

**✅ CONFIRMADO - Tudo via backend com API Key**

- Frontend chama Edge Functions autenticadas
- Edge Functions usam API Key
- Connect Token **não está sendo usado** para buscar dados

---

## 🔔 5. WEBHOOKS - SINCRONIZAÇÃO

### 5.1 Endpoint HTTPS para receber webhooks configurado

**✅ SIM - CONFIGURADO**

**URL:** `https://yiwkuqihujjrxejeybeg.supabase.co/functions/v1/pluggy-webhook`

**Arquivo:** `supabase/functions/pluggy-webhook/index.ts`

**Código do endpoint:**

```typescript
serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  const webhookEvent = await req.json();
  const { event, data, itemId, accountId } = webhookEvent;

  switch (event) {
    case 'item/created':
      await handleItemCreated(supabase, eventData);
      break;
    case 'item/updated':
      await handleItemUpdated(supabase, eventData);
      break;
    case 'transactions/created':
      await handleTransactionsCreated(supabase, eventData);
      break;
    // ...
  }

  return new Response(JSON.stringify({ success: true }), { headers });
});
```

**✅ IMPLEMENTADO CORRETAMENTE**

---

### 5.2 Endpoint responde 2XX em menos de 5 segundos?

**⚠️ POTENCIAL PROBLEMA**

**Código atual:**

```typescript
// handleTransactionsCreated faz:
const transactionsResponse = await fetch(/* busca API Pluggy */);
const { results: transactions } = await transactionsResponse.json();

// Loop síncrono salvando transações
for (const transaction of transactions) {
  await supabase.from('pluggy_transactions').upsert(...);  // ❌ Sequencial
}
```

**🚨 PROBLEMA #7:** Para muitas transações (500+), pode demorar mais de 5 segundos.

**Deveria ter:**

```typescript
// Responder 200 imediatamente
return new Response(JSON.stringify({ success: true }), { headers });

// Processar em background (queue/async job)
```

---

### 5.3 Webhooks configurados para eventos essenciais

**✅ SIM - IMPLEMENTADO**

```typescript
switch (event) {
  case 'item/created': // ✅
  case 'item/updated': // ✅
  case 'item/error': // ✅
  case 'transactions/created': // ✅
  case 'item/deleted': // ✅
  case 'item/waiting_user_input': // ✅
  case 'transactions/deleted': // ✅
}
```

**Como configurou:** Precisa configurar no Connect Token (faltando - ver item 1.4)

---

### 5.4 Usa createdTransactionsLink para buscar novas transações

**❌ NÃO IMPLEMENTADO**

**Código atual:**

```typescript
// handleTransactionsCreated busca TODAS as transações do account
const transactionsResponse = await fetch(
  `https://api.pluggy.ai/transactions?accountId=${data.account.id}&pageSize=500`,
  { headers: { 'X-API-KEY': apiKey } }
);
```

**🚨 INEFICIENTE:** Busca todas transações novamente ao invés de usar o link das novas.

**Deveria ter:**

```typescript
// Webhook envia createdTransactionsLink
const { createdTransactionsLink } = webhookEvent;

// Buscar apenas transações novas via link
const transactionsResponse = await fetch(createdTransactionsLink, {
  headers: { 'X-API-KEY': apiKey },
});
```

---

## ⚠️ 6. STATUS & ERRO HANDLING

### 6.1 Aguarda status = UPDATED após criar/atualizar Item

**✅ SIM - Via webhooks**

**Código em `credentials.tsx` (linha 198-209):**

```typescript
} else if (syncResult.item.status === 'UPDATING') {
  Alert.alert(
    'Aguarde!',
    'Banco conectado com sucesso! Suas contas estão sendo sincronizadas...'
  );
} else if (syncResult.accountsCount > 0) {
  Alert.alert('Sucesso', `Banco conectado! ${syncResult.accountsCount} conta(s)...`);
}
```

**✅ IMPLEMENTADO:** Webhook atualiza status automaticamente quando fica UPDATED.

---

### 6.2 Trata estado WAITING_USER_INPUT para MFA

**✅ SIM - IMPLEMENTADO**

**Código em `credentials.tsx` (linha 151-208):**

```typescript
if (syncResult.item.status === 'WAITING_USER_INPUT') {
  const fullItem = await itemResponse.json();

  if (fullItem.parameter) {
    const isOAuth = fullItem.parameter.name === 'oauth_code';

    if (isOAuth) {
      // Abre OAuth modal
      setOauthUrl(authUrl);
      setOauthVisible(true);
    } else {
      // Abre MFA modal
      setMfaItemId(syncResult.item.databaseId);
      setMfaParameter(fullItem.parameter);
      setMfaVisible(true);
    }
  }
}
```

**✅ IMPLEMENTADO CORRETAMENTE - Trata MFA e OAuth**

---

### 6.3 Tratamento de LOGIN_ERROR

**✅ SIM - IMPLEMENTADO**

**Código em `open-finance.tsx` (linha 164-173):**

```typescript
} else if (
  result.item.status === 'OUTDATED' ||
  result.item.status === 'LOGIN_ERROR'
) {
  const errorMsg = result.item.error?.message || 'Credenciais inválidas ou expiradas';
  Alert.alert(
    'Erro de Conexão',
    `${connectorName}: ${errorMsg}\n\nReconecte o banco com suas credenciais atualizadas.`
  );
}
```

**✅ PERMITE RECONEXÃO:** Usuário pode tentar conectar novamente.

---

### 6.4 Verifica executionStatus

**⚠️ PARCIALMENTE**

**Código retorna executionStatus:**

```typescript
// pluggy-sync-item/index.ts
return new Response(
  JSON.stringify({
    item: {
      status: item.status,
      executionStatus: item.executionStatus || null, // ✅ Retorna
    },
  })
);
```

**❌ NÃO TRATA:** Frontend não verifica `PARTIAL_SUCCESS` ou `statusDetail`.

---

## 🧪 7. AMBIENTE DE TESTES

### 7.1 Testando em Sandbox primeiro

**❓ NÃO CONFIRMADO**

Não há código que filtre `sandbox=true` ou force uso de conectores sandbox.

---

### 7.2 Testou fluxo Open Finance sandbox

**❓ NÃO CONFIRMADO**

Precisa de logs reais de teste para confirmar.

---

### 7.3 LOGS COMPLETOS

**❌ NÃO FORNECIDOS**

Precisamos de:

- Request completo de criação do Item
- Response com oauthUrl (se Open Finance)
- Status do Item após criação
- Mensagem de erro específica

---

## 🎯 RESUMO DOS PROBLEMAS IDENTIFICADOS

### 🔴 CRÍTICOS (Impedem funcionalidade OAuth)

1. **❌ #5 - `oauthRedirectUrl` AUSENTE no Connect Token**
   - **Impacto:** Usuário não consegue voltar ao app após autenticar
   - **Arquivo:** `supabase/functions/pluggy-create-token/index.ts`
   - **Fix:** Adicionar `oauthRedirectUrl: "pocket://oauth-callback"`

2. **❌ #6 - Deep Link NÃO IMPLEMENTADO**
   - **Impacto:** App não captura retorno do OAuth
   - **Arquivos:** `app.json`, `app/oauth-callback.tsx`
   - **Fix:** Configurar scheme e criar handler de callback

3. **❌ #3 - Usando Connect Token como API Key**
   - **Impacto:** Pode causar erros de permissão
   - **Arquivo:** `app/open-finance/connect.tsx`
   - **Fix:** Trocar `getConnectToken()` por `getApiKey()`

### 🟡 IMPORTANTES (Afetam qualidade/desempenho)

4. **⚠️ #1 - Falta `webhookUrl` no Connect Token**
   - **Impacto:** Webhooks podem não funcionar automaticamente
   - **Fix:** Adicionar `webhookUrl` ao criar Connect Token

5. **⚠️ #4 - Não filtra conectores Open Finance**
   - **Impacto:** Usuário pode ver conectores diretos (não OAuth)
   - **Fix:** Filtrar por `isOpenFinance: true` ou `oauth: true`

6. **⚠️ #7 - Webhook pode demorar >5s**
   - **Impacto:** Pluggy pode retentar webhook desnecessariamente
   - **Fix:** Processar transações em background

7. **⚠️ #8 - Não usa `createdTransactionsLink`**
   - **Impacto:** Busca todas transações novamente (ineficiente)
   - **Fix:** Usar link fornecido pelo webhook

---

## ✅ PONTOS POSITIVOS

1. ✅ Arquitetura servidor/cliente correta (credentials no backend)
2. ✅ Edge Functions implementadas corretamente
3. ✅ Webhook endpoint funcionando
4. ✅ MFA handling implementado
5. ✅ OAuth URL detection implementada
6. ✅ Dados salvos no backend (não frontend)
7. ✅ Autenticação de usuário funcionando

---

## 🔧 PRÓXIMOS PASSOS RECOMENDADOS

### Prioridade ALTA (Implementar AGORA)

1. **Configurar Deep Link**

   ```json
   // app.json
   {
     "expo": {
       "scheme": "pocket"
     }
   }
   ```

2. **Adicionar `oauthRedirectUrl` e `webhookUrl` ao Connect Token**

   ```typescript
   body: JSON.stringify({
     clientUserId: user.id,
     webhookUrl:
       'https://yiwkuqihujjrxejeybeg.supabase.co/functions/v1/pluggy-webhook',
     oauthRedirectUrl: 'pocket://oauth-callback',
     avoidDuplicates: true,
   });
   ```

3. **Criar handler de OAuth callback**

   ```typescript
   // app/oauth-callback.tsx
   export default function OAuthCallback() {
     const params = useLocalSearchParams();
     // Processar retorno do OAuth
   }
   ```

4. **Trocar Connect Token por API Key em `connect.tsx`**
   ```typescript
   const apiKey = await getApiKey(); // Não getConnectToken()
   ```

### Prioridade MÉDIA

5. Filtrar apenas conectores Open Finance
6. Usar `createdTransactionsLink` no webhook
7. Processar transações em background no webhook

---

**FIM DO CHECKLIST TÉCNICO**
