# Plano de Implementação: Open Finance com Pluggy API REST

## 📋 Visão Geral

Este plano descreve a implementação do Open Finance no app Pocket usando a **API REST da Pluggy** diretamente, sem usar o Widget pré-construído. Esta abordagem oferece **controle total** sobre a UI e UX, mas requer mais código customizado.

---

## 🎯 Objetivos

1. Permitir que usuários conectem suas contas bancárias via Open Finance
2. Sincronizar automaticamente transações bancárias com os gastos do app
3. Exibir saldo e informações de contas conectadas
4. Manter a UI consistente com o design atual do Pocket

---

## 🏗️ Arquitetura

### Fluxo de Dados

```
┌─────────────────┐
│  React Native   │
│     (Expo)      │
└────────┬────────┘
         │
         │ 1. Request Connect Token
         ▼
┌─────────────────┐
│     Supabase    │
│  Edge Function  │
└────────┬────────┘
         │
         │ 2. Generate Token
         │    (usando API Key)
         ▼
┌─────────────────┐
│   Pluggy API    │
└────────┬────────┘
         │
         │ 3. User connects bank
         │    (via custom UI)
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   (Supabase)    │
└─────────────────┘
```

### Componentes Principais

1. **Supabase Edge Function** (Backend seguro)
   - Gerencia API Key da Pluggy (nunca exposta ao frontend)
   - Gera Connect Tokens para usuários
   - Busca dados de contas e transações
   - Processa webhooks da Pluggy

2. **React Native App** (Frontend)
   - UI customizada para selecionar banco
   - Formulário de credenciais
   - Autenticação MFA
   - Tela de contas conectadas
   - Sincronização de transações

3. **Banco de Dados** (Supabase PostgreSQL)
   - Armazena conexões (Items)
   - Cache de contas e transações
   - Mapeamento entre transações Pluggy e expenses

---

## 📊 Estrutura do Banco de Dados

### Novas Tabelas

```sql
-- Conexões com bancos (Items da Pluggy)
CREATE TABLE pluggy_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id TEXT NOT NULL UNIQUE,
  connector_id INTEGER NOT NULL,
  connector_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'UPDATING', 'UPDATED', 'LOGIN_ERROR', 'OUTDATED')),
  last_updated_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Contas bancárias e cartões
CREATE TABLE pluggy_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES pluggy_items(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('BANK', 'CREDIT')),
  subtype TEXT,
  name TEXT NOT NULL,
  number TEXT,
  balance NUMERIC(10, 2),
  currency_code TEXT DEFAULT 'BRL',
  credit_limit NUMERIC(10, 2),
  available_credit_limit NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transações sincronizadas
CREATE TABLE pluggy_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES pluggy_accounts(id) ON DELETE CASCADE,
  pluggy_transaction_id TEXT NOT NULL UNIQUE,
  expense_id UUID REFERENCES expenses(id),
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'POSTED')),
  type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
  category TEXT,
  provider_code TEXT,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_pluggy_items_user_id ON pluggy_items(user_id);
CREATE INDEX idx_pluggy_accounts_item_id ON pluggy_accounts(item_id);
CREATE INDEX idx_pluggy_transactions_account_id ON pluggy_transactions(account_id);
CREATE INDEX idx_pluggy_transactions_date ON pluggy_transactions(date);
CREATE INDEX idx_pluggy_transactions_synced ON pluggy_transactions(synced);

-- RLS Policies
ALTER TABLE pluggy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pluggy_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pluggy_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items" ON pluggy_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own accounts" ON pluggy_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own transactions" ON pluggy_transactions FOR SELECT USING (auth.uid() = user_id);
```

---

## 🔐 Backend: Supabase Edge Functions

### 1. `pluggy-create-token` - Gera Connect Token

```typescript
// supabase/functions/pluggy-create-token/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID')!;
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET')!;

serve(async (req) => {
  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      });
    }

    // Gerar API Key da Pluggy
    const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });

    const { apiKey } = await apiKeyResponse.json();

    // Gerar Connect Token
    const connectTokenResponse = await fetch(
      'https://api.pluggy.ai/connect_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
          clientUserId: user.id,
        }),
      }
    );

    const { accessToken } = await connectTokenResponse.json();

    return new Response(JSON.stringify({ connectToken: accessToken }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
```

### 2. `pluggy-sync-accounts` - Sincroniza contas

```typescript
// supabase/functions/pluggy-sync-accounts/index.ts
serve(async (req) => {
  const { itemId } = await req.json();

  // 1. Buscar API Key
  // 2. Fazer GET /accounts?itemId={itemId}
  // 3. Inserir/atualizar pluggy_accounts table
  // 4. Retornar contas sincronizadas
});
```

### 3. `pluggy-sync-transactions` - Sincroniza transações

```typescript
// supabase/functions/pluggy-sync-transactions/index.ts
serve(async (req) => {
  const { accountId, from, to } = await req.json();

  // 1. Buscar API Key
  // 2. Fazer GET /transactions?accountId={accountId}&from={from}&to={to}
  // 3. Inserir novas transações em pluggy_transactions
  // 4. Tentar fazer match automático com expenses existentes
  // 5. Retornar transações
});
```

### 4. `pluggy-webhook` - Recebe webhooks da Pluggy

```typescript
// supabase/functions/pluggy-webhook/index.ts
serve(async (req) => {
  const event = await req.json();

  // Processar eventos:
  // - item/updated: Atualizar status do item
  // - item/error: Marcar erro
  // - item/created: Sincronizar contas
  // - transactions/created: Sincronizar transações
});
```

---

## 📱 Frontend: React Native

### 1. Criar componente OpenFinanceIcon

```typescript
// components/OpenFinanceIcon.tsx
import Svg, { Path } from 'react-native-svg';

export function OpenFinanceIcon({ size = 24, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 800 800" fill="none">
      <Path
        d="M407.58,584.99c-40.85,0-76.6-13.77-106.3-40.92l-2.33-2.14l54.73-54.75l2.13,1.98c14.11,12.99,31.77,19.57,52.46,19.57..."
        fill={color}
      />
      {/* Adicionar outros paths do SVG */}
    </Svg>
  );
}
```

### 2. Adicionar tab no menu inferior

```typescript
// app/(tabs)/_layout.tsx
<Tabs.Screen
  name="open-finance"
  options={{
    title: 'Open Finance',
    tabBarIcon: ({ focused, color }) => (
      <OpenFinanceIcon size={24} color={color} />
    ),
  }}
/>
```

### 3. Tela principal: Open Finance

```typescript
// app/(tabs)/open-finance.tsx
export default function OpenFinanceScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<PluggyItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConnectedBanks = async () => {
    const { data } = await supabase
      .from('pluggy_items')
      .select('*')
      .order('created_at', { ascending: false });

    setItems(data || []);
  };

  const handleConnectBank = () => {
    router.push('/open-finance/connect');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Open Finance</Text>
        <TouchableOpacity onPress={handleConnectBank}>
          <Text style={styles.addButton}>+ Conectar Banco</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de bancos conectados */}
      <ScrollView>
        {items.map((item) => (
          <BankCard key={item.id} item={item} />
        ))}

        {items.length === 0 && (
          <EmptyState
            icon={<OpenFinanceIcon size={80} color={theme.textSecondary} />}
            title="Nenhum banco conectado"
            description="Conecte sua conta bancária para sincronizar transações automaticamente"
            actionLabel="Conectar Banco"
            onAction={handleConnectBank}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

### 4. Tela de conexão: Selecionar banco

```typescript
// app/open-finance/connect.tsx
export default function ConnectBankScreen() {
  const [connectors, setConnectors] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadConnectors();
  }, []);

  const loadConnectors = async () => {
    // Buscar lista de bancos disponíveis
    // GET https://api.pluggy.ai/connectors?countries=BR
  };

  const handleSelectBank = (connector) => {
    router.push({
      pathname: '/open-finance/credentials',
      params: { connectorId: connector.id, name: connector.name }
    });
  };

  return (
    <SafeAreaView>
      <SearchBar value={search} onChangeText={setSearch} />

      <FlatList
        data={connectors.filter(c =>
          c.name.toLowerCase().includes(search.toLowerCase())
        )}
        renderItem={({ item }) => (
          <BankOption
            logo={item.imageUrl}
            name={item.name}
            onPress={() => handleSelectBank(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}
```

### 5. Tela de credenciais

```typescript
// app/open-finance/credentials.tsx
export default function CredentialsScreen() {
  const { connectorId, name } = useLocalSearchParams();
  const [credentials, setCredentials] = useState({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // 1. Gerar Connect Token
      const { data: tokenData } = await supabase.functions.invoke(
        'pluggy-create-token'
      );

      // 2. Criar Item com credenciais
      const response = await fetch('https://api.pluggy.ai/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': tokenData.connectToken,
        },
        body: JSON.stringify({
          connectorId,
          parameters: credentials,
        }),
      });

      const item = await response.json();

      // 3. Salvar no banco
      await supabase.from('pluggy_items').insert({
        pluggy_item_id: item.id,
        connector_id: connectorId,
        connector_name: name,
        status: item.status,
      });

      // 4. Sincronizar contas
      await supabase.functions.invoke('pluggy-sync-accounts', {
        body: { itemId: item.id }
      });

      router.back();
      Alert.alert('Sucesso', 'Banco conectado com sucesso!');
    } catch (error) {
      Alert.alert('Erro', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView>
      <Text>Conectar {name}</Text>

      {/* Campos dinâmicos baseados no connector */}
      <TextInput
        placeholder="CPF"
        value={credentials.cpf}
        onChangeText={(text) => setCredentials({ ...credentials, cpf: text })}
      />
      <TextInput
        placeholder="Senha"
        secureTextEntry
        value={credentials.password}
        onChangeText={(text) => setCredentials({ ...credentials, password: text })}
      />

      <Button onPress={handleSubmit} loading={loading}>
        Conectar
      </Button>
    </KeyboardAvoidingView>
  );
}
```

### 6. Lib helper para Pluggy

```typescript
// lib/pluggy.ts
import { supabase } from './supabase';

export async function getConnectToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    'pluggy-create-token'
  );

  if (error) throw error;
  return data.connectToken;
}

export async function syncAccounts(itemId: string) {
  const { data, error } = await supabase.functions.invoke(
    'pluggy-sync-accounts',
    {
      body: { itemId },
    }
  );

  if (error) throw error;
  return data;
}

export async function syncTransactions(
  accountId: string,
  from: string,
  to: string
) {
  const { data, error } = await supabase.functions.invoke(
    'pluggy-sync-transactions',
    {
      body: { accountId, from, to },
    }
  );

  if (error) throw error;
  return data;
}
```

---

## 🔄 Sincronização Automática

### Background Sync (usando Webhooks)

1. **Configurar webhook na Pluggy**
   - URL: `https://your-project.supabase.co/functions/v1/pluggy-webhook`
   - Eventos: `item.updated`, `transactions.created`

2. **Processar eventos**
   - Quando transação nova chega, inserir em `pluggy_transactions`
   - Tentar fazer match automático com `expenses` existentes
   - Notificar usuário de novas transações

### Manual Sync

```typescript
// Botão "Sincronizar" em cada conta
const handleSync = async (itemId: string) => {
  await supabase.functions.invoke('pluggy-sync-accounts', {
    body: { itemId },
  });

  // Recarregar lista de contas
  loadConnectedBanks();
};
```

---

## 📋 Checklist de Implementação

### Backend

- [ ] Criar conta na Pluggy e obter Client ID/Secret
- [ ] Adicionar variáveis de ambiente no Supabase
- [ ] Criar tabelas no banco de dados
- [ ] Implementar Edge Function `pluggy-create-token`
- [ ] Implementar Edge Function `pluggy-sync-accounts`
- [ ] Implementar Edge Function `pluggy-sync-transactions`
- [ ] Implementar Edge Function `pluggy-webhook`
- [ ] Configurar webhook na Pluggy Dashboard
- [ ] Testar autenticação e geração de tokens

### Frontend

- [ ] Criar componente `OpenFinanceIcon`
- [ ] Adicionar tab "Open Finance" no menu inferior
- [ ] Criar tela principal `/open-finance`
- [ ] Criar tela de seleção de banco `/open-finance/connect`
- [ ] Criar tela de credenciais `/open-finance/credentials`
- [ ] Criar tela de contas `/open-finance/accounts/[id]`
- [ ] Criar tela de transações `/open-finance/transactions/[accountId]`
- [ ] Implementar componente `BankCard`
- [ ] Implementar componente `AccountCard`
- [ ] Implementar lib helper `lib/pluggy.ts`
- [ ] Adicionar indicadores de loading
- [ ] Adicionar tratamento de erros
- [ ] Implementar sincronização manual
- [ ] Testar fluxo completo

### Testes

- [ ] Testar conexão com banco sandbox
- [ ] Testar sincronização de contas
- [ ] Testar sincronização de transações
- [ ] Testar webhooks
- [ ] Testar desconexão de banco
- [ ] Testar erros de credenciais
- [ ] Testar MFA

---

## ⚠️ Considerações de Segurança

1. **NUNCA expor API Key no frontend**
   - Sempre usar Edge Functions
   - Connect Tokens têm permissões limitadas

2. **Validar tokens**
   - Verificar autenticação Supabase em todas as Edge Functions
   - Validar que user_id corresponde ao usuário logado

3. **Criptografar dados sensíveis**
   - Não armazenar credenciais bancárias
   - Pluggy gerencia credenciais

4. **Rate limiting**
   - Implementar rate limiting nas Edge Functions
   - Evitar abusos da API

5. **Logs e auditoria**
   - Logar todas as operações importantes
   - Monitorar erros e falhas

---

## 💰 Custos Estimados

### Pluggy

- **Plano Free**: 100 items, sem transações categorizadas
- **Plano Pro**: A partir de R$ 199/mês, transações categorizadas

### Supabase

- **Edge Functions**: Incluído no plano gratuito até 500K invocations/mês
- **Database**: Incluído no plano gratuito até 500MB

---

## 🚀 Próximos Passos

1. **Fase 1**: Backend + Autenticação
   - Criar Edge Functions
   - Configurar banco de dados
   - Testar geração de tokens

2. **Fase 2**: UI Básica
   - Criar tela principal
   - Implementar seleção de banco
   - Implementar formulário de credenciais

3. **Fase 3**: Sincronização
   - Implementar sync de contas
   - Implementar sync de transações
   - Configurar webhooks

4. **Fase 4**: Integração com Expenses
   - Match automático de transações
   - Sugestões de categorização
   - Reconciliação

5. **Fase 5**: Polimento
   - Melhorar UI/UX
   - Adicionar animações
   - Otimizar performance
   - Testes completos

---

## 📚 Referências

- [Pluggy API Docs](https://docs.pluggy.ai/)
- [Pluggy API Reference](https://docs.pluggy.ai/reference)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [React Native Best Practices](https://reactnative.dev/docs/getting-started)
