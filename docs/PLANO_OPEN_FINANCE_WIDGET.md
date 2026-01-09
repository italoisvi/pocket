# Plano de Implementação: Open Finance com Pluggy Widget

## 📋 Visão Geral

Este plano descreve a implementação do Open Finance no app Pocket usando o **Pluggy Connect Widget**, uma solução pré-construída que simplifica significativamente o processo de conexão bancária. Esta abordagem é **mais rápida e requer menos código**, mas oferece menos customização visual.

---

## 🎯 Objetivos

1. Permitir que usuários conectem suas contas bancárias via Open Finance
2. Sincronizar automaticamente transações bancárias com os gastos do app
3. Exibir saldo e informações de contas conectadas
4. Usar o Widget oficial da Pluggy para conexão bancária

---

## ✅ Vantagens do Widget

### 👍 Prós

- ✅ **Menos código**: Widget gerencia toda a UI de conexão
- ✅ **Manutenção reduzida**: Pluggy atualiza o widget automaticamente
- ✅ **UI/UX testada**: Interface otimizada e testada pela Pluggy
- ✅ **Suporte a MFA**: Widget já gerencia autenticação multifator
- ✅ **Responsivo**: Funciona bem em mobile e web
- ✅ **Atualizações automáticas**: Novos bancos adicionados automaticamente

### 👎 Contras

- ❌ **Menos customização visual**: Limitado às opções do widget
- ❌ **Dependência externa**: Depende do serviço da Pluggy estar online
- ❌ **Tamanho do bundle**: Adiciona biblioteca ao app

---

## 🏗️ Arquitetura

### Fluxo de Dados

```
┌─────────────────┐
│  React Native   │
│     (Expo)      │
│                 │
│  [Pluggy Widget]│ ◄─── Widget gerencia:
│                 │      - Seleção de banco
└────────┬────────┘      - Formulário de credenciais
         │               - MFA
         │               - Comunicação com Pluggy API
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
│                 │
│ Widget ◄────────┤ 3. Widget connects
│                 │    to Pluggy directly
└────────┬────────┘
         │
         │ 4. onSuccess callback
         │    (Item created)
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   (Supabase)    │
└─────────────────┘
```

### Componentes Principais

1. **Pluggy Connect Widget** (Biblioteca externa)
   - UI de seleção de banco
   - Formulário de credenciais
   - Gerenciamento de MFA
   - Comunicação direta com Pluggy

2. **Supabase Edge Function** (Backend seguro)
   - Gera Connect Tokens
   - Sincroniza dados após conexão
   - Processa webhooks

3. **React Native App** (Frontend)
   - Integra o widget
   - Exibe contas conectadas
   - Gerencia transações

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
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_pluggy_items_user_id ON pluggy_items(user_id);
CREATE INDEX idx_pluggy_accounts_item_id ON pluggy_accounts(item_id);
CREATE INDEX idx_pluggy_transactions_account_id ON pluggy_transactions(account_id);
CREATE INDEX idx_pluggy_transactions_date ON pluggy_transactions(date);

-- RLS Policies
ALTER TABLE pluggy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pluggy_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pluggy_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items" ON pluggy_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own items" ON pluggy_items FOR INSERT WITH CHECK (auth.uid() = user_id);
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

    if (!apiKeyResponse.ok) {
      throw new Error('Failed to generate API key');
    }

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

    if (!connectTokenResponse.ok) {
      throw new Error('Failed to generate connect token');
    }

    const { accessToken } = await connectTokenResponse.json();

    return new Response(JSON.stringify({ connectToken: accessToken }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating connect token:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

### 2. `pluggy-sync-item` - Sincroniza após conexão

```typescript
// supabase/functions/pluggy-sync-item/index.ts
serve(async (req) => {
  try {
    const { itemId } = await req.json();

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

    // Gerar API Key
    const apiKeyResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });

    const { apiKey } = await apiKeyResponse.json();

    // Buscar informações do Item
    const itemResponse = await fetch(`https://api.pluggy.ai/items/${itemId}`, {
      headers: { 'X-API-KEY': apiKey },
    });

    const item = await itemResponse.json();

    // Salvar/atualizar item no banco
    await supabase.from('pluggy_items').upsert({
      pluggy_item_id: item.id,
      user_id: user.id,
      connector_id: item.connector.id,
      connector_name: item.connector.name,
      status: item.status,
      last_updated_at: item.lastUpdatedAt,
    });

    // Buscar e salvar contas
    const accountsResponse = await fetch(
      `https://api.pluggy.ai/accounts?itemId=${itemId}`,
      { headers: { 'X-API-KEY': apiKey } }
    );

    const { results: accounts } = await accountsResponse.json();

    for (const account of accounts) {
      await supabase.from('pluggy_accounts').upsert({
        pluggy_account_id: account.id,
        user_id: user.id,
        item_id: item.id,
        type: account.type,
        subtype: account.subtype,
        name: account.name,
        number: account.number,
        balance: account.balance,
        currency_code: account.currencyCode,
        credit_limit: account.creditData?.creditLimit,
        available_credit_limit: account.creditData?.availableCreditLimit,
      });
    }

    return new Response(JSON.stringify({ success: true, accounts }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error syncing item:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
```

### 3. `pluggy-sync-transactions` - Sincroniza transações

```typescript
// supabase/functions/pluggy-sync-transactions/index.ts
serve(async (req) => {
  const { accountId, from, to } = await req.json();

  // Similar ao anterior:
  // 1. Autenticar usuário
  // 2. Gerar API Key
  // 3. Buscar transações da Pluggy
  // 4. Inserir em pluggy_transactions
  // 5. Retornar sucesso
});
```

---

## 📱 Frontend: React Native

### 1. Instalar dependências

```bash
npm install react-pluggy-connect
```

### 2. Criar componente OpenFinanceIcon

```typescript
// components/OpenFinanceIcon.tsx
import Svg, { Path, G } from 'react-native-svg';

type OpenFinanceIconProps = {
  size?: number;
  color?: string;
};

export function OpenFinanceIcon({ size = 24, color = '#000' }: OpenFinanceIconProps) {
  // Calcular escala para ajustar viewBox 800x800 para o tamanho desejado
  const scale = size / 24;
  const viewBoxSize = 800;
  const displaySize = size;

  return (
    <Svg width={displaySize} height={displaySize} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
      <G>
        <Path
          className="st0"
          d="M407.58,584.99c-40.85,0-76.6-13.77-106.3-40.92l-2.33-2.14l54.73-54.75l2.13,1.98c14.11,12.99,31.77,19.57,52.46,19.57c22.66,0,41.77-7.97,56.78-23.67c15.05-15.75,22.68-36.34,22.68-61.19c0-24.86-7.49-45.31-22.27-60.78c-12.89-13.47-29.14-21.17-48.31-22.87l-2.76-0.25v-77.09l3.21,0.19c24.98,1.52,48.93,8.7,71.2,21.36c25.32,14.4,45.38,34.2,59.59,58.89l0,0c14.4,25.02,21.6,52.44,21.39,81.49c-0.19,27.63-7.49,55.01-21.11,79.14c-14.34,25.4-34.24,45.51-59.17,59.78C464.86,577.84,437.3,584.99,407.58,584.99z M307.74,541.72c28.06,24.7,61.64,37.21,99.84,37.21c28.64,0,55.2-6.88,78.93-20.46c23.96-13.72,43.11-33.07,56.9-57.51c13.12-23.23,20.14-49.58,20.33-76.2c0.2-27.95-6.72-54.34-20.59-78.41c-13.66-23.74-32.95-42.8-57.33-56.64c-20.51-11.66-42.47-18.49-65.35-20.35v65.11c19.48,2.31,36.08,10.53,49.38,24.44c15.89,16.63,23.95,38.5,23.95,64.98s-8.19,48.46-24.37,65.38c-16.2,16.94-36.77,25.54-61.16,25.54c-21.22,0-39.5-6.48-54.39-19.24L307.74,541.72z"
          fill={color}
        />
        <G>
          <Path
            className="st0"
            d="M352.56,362.94l-78.54-78.54l1.62-2.11c30.49-39.63,74.36-63.45,123.56-67.06l3.26-0.24v125.01l-2.73,0.27c-17.42,1.68-32.57,8.62-45.03,20.6L352.56,362.94z M282.08,283.89l70.6,70.59c12.36-11.09,27.04-17.79,43.71-19.93V221.54C351.13,225.74,310.74,247.76,282.08,283.89z"
            fill={color}
          />
          <Path
            className="st0"
            d="M329.71,419.65h-97.8l-0.37-2.62c-5.6-40.57,6.35-87.33,31.2-122.02l2.08-2.9l80.05,80.05l-1.39,2.07c-8.04,12.04-12.62,26.37-13.6,42.58L329.71,419.65z M237.22,413.59h86.82c1.33-15.21,5.71-28.86,13.06-40.62l-71.48-71.49C243.55,333.87,232.8,376.25,237.22,413.59z"
            fill={color}
          />
          <Path
            className="st0"
            d="M290.88,533.09l-2.12-1.74c-21.71-17.81-49.26-48.96-57.19-96.21l-0.6-3.53h98.88l0.25,2.76c1.42,16.05,6.22,30.08,14.27,41.71l1.43,2.08L290.88,533.09z M238.18,437.67c8.09,41.94,32.32,70.29,52.31,87.23l47.48-47.48c-7.35-11.38-11.92-24.73-13.63-39.76H238.18z"
            fill={color}
          />
        </G>
      </G>
    </Svg>
  );
}
```

### 3. Adicionar tab no menu inferior

```typescript
// app/(tabs)/_layout.tsx
import { OpenFinanceIcon } from '@/components/OpenFinanceIcon';

// Dentro do Tabs component, adicionar entre dividir-conta e walts:
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

### 4. Tela principal: Open Finance

```typescript
// app/(tabs)/open-finance.tsx
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { OpenFinanceIcon } from '@/components/OpenFinanceIcon';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';

type PluggyItem = {
  id: string;
  connector_name: string;
  status: string;
  last_updated_at: string;
};

export default function OpenFinanceScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<PluggyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConnectedBanks();
  }, []);

  const loadConnectedBanks = async () => {
    try {
      const { data, error } = await supabase
        .from('pluggy_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading banks:', error);
      Alert.alert('Erro', 'Não foi possível carregar bancos conectados');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectBank = () => {
    router.push('/open-finance/connect');
  };

  const handleViewAccounts = (itemId: string) => {
    router.push({
      pathname: '/open-finance/accounts',
      params: { itemId }
    });
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Open Finance</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={handleConnectBank}
        >
          <Text style={styles.addButtonText}>+ Conectar</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de bancos */}
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
        ) : items.length > 0 ? (
          items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
              onPress={() => handleViewAccounts(item.id)}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardLeft}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {item.connector_name}
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                    Status: {item.status}
                  </Text>
                  {item.last_updated_at && (
                    <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
                      Atualizado: {new Date(item.last_updated_at).toLocaleDateString('pt-BR')}
                    </Text>
                  )}
                </View>
                <View style={styles.cardRight}>
                  <Text style={[styles.viewText, { color: theme.primary }]}>Ver contas</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <OpenFinanceIcon size={80} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhum banco conectado
            </Text>
            <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
              Conecte sua conta bancária para sincronizar transações automaticamente
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
              onPress={handleConnectBank}
            >
              <Text style={styles.emptyButtonText}>Conectar Banco</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 40,
  },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 2,
  },
  cardDate: {
    fontSize: 12,
    fontFamily: 'CormorantGaramond-Regular',
  },
  cardRight: {
    marginLeft: 12,
  },
  viewText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginTop: 24,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
```

### 5. Modal de conexão com Widget

```typescript
// app/open-finance/connect.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { PluggyConnect } from 'react-pluggy-connect';

export default function ConnectBankScreen() {
  const { theme } = useTheme();
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    generateConnectToken();
  }, []);

  const generateConnectToken = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pluggy-create-token');

      if (error) throw error;
      setConnectToken(data.connectToken);
    } catch (error) {
      console.error('Error generating token:', error);
      Alert.alert('Erro', 'Não foi possível gerar token de conexão');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = async (itemData: any) => {
    console.log('Item created:', itemData);

    try {
      // Sincronizar item e contas no banco
      const { error } = await supabase.functions.invoke('pluggy-sync-item', {
        body: { itemId: itemData.item.id }
      });

      if (error) throw error;

      Alert.alert(
        'Sucesso!',
        'Banco conectado com sucesso! As transações serão sincronizadas automaticamente.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error syncing item:', error);
      Alert.alert('Atenção', 'Banco conectado, mas houve um erro ao sincronizar dados');
      router.back();
    }
  };

  const handleError = (error: any) => {
    console.error('Pluggy Connect error:', error);
    Alert.alert('Erro', 'Não foi possível conectar o banco. Tente novamente.');
  };

  const handleClose = () => {
    router.back();
  };

  if (loading || !connectToken) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Preparando conexão...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <PluggyConnect
        connectToken={connectToken}
        includeSandbox={__DEV__} // Incluir bancos sandbox apenas em desenvolvimento
        onSuccess={handleSuccess}
        onError={handleError}
        onClose={handleClose}
        // Opcional: filtrar por país
        countries={['BR']}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    marginTop: 16,
  },
});
```

### 6. Tela de contas

```typescript
// app/open-finance/accounts.tsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { formatCurrency } from '@/lib/formatCurrency';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  number: string;
};

export default function AccountsScreen() {
  const { theme } = useTheme();
  const { itemId } = useLocalSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('pluggy_accounts')
        .select('*')
        .eq('item_id', itemId);

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
      Alert.alert('Erro', 'Não foi possível carregar contas');
    } finally {
      setLoading(false);
    }
  };

  const handleViewTransactions = (accountId: string) => {
    router.push({
      pathname: '/open-finance/transactions',
      params: { accountId }
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeftIcon size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Contas</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Lista de contas */}
      <ScrollView style={styles.content}>
        {accounts.map((account) => (
          <TouchableOpacity
            key={account.id}
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
            onPress={() => handleViewTransactions(account.id)}
          >
            <Text style={[styles.accountName, { color: theme.text }]}>
              {account.name}
            </Text>
            <Text style={[styles.accountNumber, { color: theme.textSecondary }]}>
              {account.type} • {account.number}
            </Text>
            <Text style={[styles.balance, { color: theme.text }]}>
              {formatCurrency(account.balance)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  accountName: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  accountNumber: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Regular',
    marginBottom: 12,
  },
  balance: {
    fontSize: 24,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
```

---

## 📋 Checklist de Implementação

### Configuração Inicial

- [ ] Criar conta na Pluggy (https://dashboard.pluggy.ai)
- [ ] Obter Client ID e Client Secret
- [ ] Adicionar variáveis de ambiente no Supabase:
  - `PLUGGY_CLIENT_ID`
  - `PLUGGY_CLIENT_SECRET`

### Backend (Supabase)

- [ ] Executar script SQL para criar tabelas
- [ ] Criar Edge Function `pluggy-create-token`
- [ ] Criar Edge Function `pluggy-sync-item`
- [ ] Criar Edge Function `pluggy-sync-transactions`
- [ ] Testar Edge Functions no Supabase Dashboard
- [ ] Deploy das Edge Functions

### Frontend (React Native)

- [ ] Instalar `react-pluggy-connect`: `npm install react-pluggy-connect`
- [ ] Criar componente `OpenFinanceIcon`
- [ ] Adicionar tab "Open Finance" no menu inferior
- [ ] Criar tela `/open-finance` (lista de bancos)
- [ ] Criar tela `/open-finance/connect` (widget)
- [ ] Criar tela `/open-finance/accounts` (contas por item)
- [ ] Criar tela `/open-finance/transactions` (transações por conta)
- [ ] Testar fluxo completo de conexão

### Testes

- [ ] Testar conexão com banco sandbox (Pluggy Sandbox)
- [ ] Testar callback onSuccess
- [ ] Testar sincronização de contas
- [ ] Testar sincronização de transações
- [ ] Testar tratamento de erros
- [ ] Testar desconexão de banco
- [ ] Testar em iOS
- [ ] Testar em Android

### Produção

- [ ] Usar Client ID/Secret de produção
- [ ] Remover `includeSandbox: true`
- [ ] Configurar webhooks (opcional)
- [ ] Monitorar erros
- [ ] Documentar para usuários

---

## 🎨 Customização do Widget (Limitada)

O Widget oferece algumas opções de customização:

```typescript
<PluggyConnect
  connectToken={connectToken}

  // Filtros
  includeSandbox={false}
  countries={['BR']}
  connectorTypes={['PERSONAL_BANK', 'BUSINESS_BANK']} // Opcional

  // Callbacks
  onSuccess={handleSuccess}
  onError={handleError}
  onClose={handleClose}
  onOpen={() => console.log('Widget opened')}
  onEvent={(event) => console.log('Widget event:', event)}

  // Atualizar item existente
  updateItem="item-id-to-update" // Opcional
/>
```

---

## ⚠️ Considerações de Segurança

1. **NUNCA expor API Key no frontend**
   - Sempre usar Edge Functions
   - Connect Token tem permissões limitadas (apenas criar Items)

2. **Validar autenticação**
   - Verificar token Supabase em todas as Edge Functions
   - Garantir que user_id corresponde ao usuário logado

3. **RLS (Row Level Security)**
   - Implementado nas tabelas
   - Usuários só veem seus próprios dados

4. **Armazenamento de credenciais**
   - Pluggy armazena credenciais (não você)
   - Nunca salvar senhas bancárias no seu banco

---

## 💰 Custos

### Pluggy

- **Plano Free**: 100 Items (conexões), sem categorização
- **Plano Pro**: A partir de R$ 199/mês, com categorização

### Supabase

- **Edge Functions**: Gratuito até 500K invocations/mês
- **Database**: Gratuito até 500MB
- **Bandwidth**: Gratuito até 5GB/mês

---

## 🚀 Próximos Passos Recomendados

### Fase 1: Setup (1-2 dias)

1. Criar conta Pluggy
2. Configurar Supabase
3. Criar tabelas no banco

### Fase 2: Backend (2-3 dias)

1. Implementar Edge Function de token
2. Implementar Edge Function de sync
3. Testar com Postman

### Fase 3: Widget Integration (1-2 dias)

1. Instalar biblioteca
2. Criar tela de conexão
3. Integrar callbacks

### Fase 4: UI Completa (2-3 dias)

1. Tela principal Open Finance
2. Tela de contas
3. Tela de transações
4. Polimento visual

### Fase 5: Testes & Deploy (1-2 dias)

1. Testes completos
2. Correções de bugs
3. Deploy para produção

**Tempo Total Estimado**: 7-12 dias

---

## 📚 Referências

- [Pluggy Docs](https://docs.pluggy.ai/)
- [Pluggy Connect Widget](https://docs.pluggy.ai/docs/connect-widget)
- [React Pluggy Connect](https://www.npmjs.com/package/react-pluggy-connect)
- [GitHub Quickstart](https://github.com/pluggyai/quickstart)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

---

## 🎉 Conclusão

A abordagem com **Widget é recomendada** para a maioria dos casos, pois:

✅ Reduz significativamente o tempo de desenvolvimento
✅ Mantém a UI consistente e testada
✅ Atualizações automáticas quando novos bancos são adicionados
✅ Gerenciamento de MFA já implementado
✅ Menos código para manter

A única razão para usar a abordagem API REST direta seria se você precisasse de customização visual extrema ou integrações muito específicas.
