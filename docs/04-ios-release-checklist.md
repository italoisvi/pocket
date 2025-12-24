# Checklist: iOS Release Safety

Este checklist garante que o app não quebre no iOS release (TestFlight/App Store).

## ✅ Antes de Fazer Build

### 1. Variáveis de Ambiente

- [ ] Todas as env vars estão em `app.config.js` → `extra`
- [ ] Nenhum `process.env` usado diretamente no código
- [ ] Usar sempre `Constants.expoConfig.extra`

### 2. Imports Críticos

- [ ] Nenhum import síncrono de Supabase em `_layout.tsx`
- [ ] Usar `await import()` para módulos que acessam env vars
- [ ] Validação de env vars com `try/catch`

### 3. Navegação

- [ ] Nenhum `<Redirect>` síncrono em `index.tsx`
- [ ] Usar `useEffect` + `setTimeout` para navegação
- [ ] Mínimo 50ms de delay antes de `router.replace()`

### 4. Auth Flow

- [ ] `supabase.auth.getSession()` só dentro de `useEffect`
- [ ] Session state com loading indicator
- [ ] Fallback se session não carregar

### 5. Fontes

- [ ] Loading de fontes com `useState` + `useEffect`
- [ ] Renderizar loading screen até fontes carregarem
- [ ] Não renderizar UI principal sem fontes

### 6. Error Boundaries

- [ ] `ErrorBoundary` envolvendo `<App />`
- [ ] Fallback UI em caso de erro
- [ ] Console.error para debugging

## ✅ Padrões Safe

### ✅ Supabase Init (CORRETO)

```ts
// lib/supabase.ts
const extra = Constants.expoConfig?.extra ?? {};
const url = extra.supabaseUrl;

if (!url) {
  throw new Error('supabaseUrl missing');
}
```

### ✅ Dynamic Import (CORRETO)

```ts
// _layout.tsx
useEffect(() => {
  import('@/lib/supabase').then(({ supabase }) => {
    // usar supabase aqui
  });
}, []);
```

### ✅ Navegação (CORRETO)

```ts
// index.tsx
useEffect(() => {
  setTimeout(() => router.replace('/home'), 50);
}, []);
```

## ❌ Anti-Patterns

### ❌ Supabase Import Síncrono

```ts
// _layout.tsx - ERRADO
import { supabase } from '@/lib/supabase'; // ❌ Crash
```

### ❌ Redirect Síncrono

```tsx
// index.tsx - ERRADO
return <Redirect href="/home" />; // ❌ Race condition
```

### ❌ process.env Direto

```ts
// ERRADO
const url = process.env.EXPO_PUBLIC_SUPABASE_URL; // ❌ undefined no iOS
```

## 🧪 Como Testar

### Teste Local (iOS Release)

```bash
npx expo run:ios --configuration Release
```

### Teste no TestFlight

1. Fazer build: `eas build --platform ios --profile production`
2. Aguardar upload automático para TestFlight
3. Instalar via TestFlight no dispositivo físico
4. Verificar:
   - App abre sem crash
   - Login funciona
   - Navegação funciona
   - Câmera funciona

## 🚨 Red Flags

Se você vir isso, PARE e corrija:

- ❌ `router.push()` fora de `useEffect`
- ❌ `await` no top-level de arquivo
- ❌ Import de módulo que acessa env vars no topo de `_layout.tsx`
- ❌ `<Redirect>` sem delay
- ❌ Acesso a APIs nativas (câmera, storage) no module scope

## 📊 Sintomas de Problema

| Sintoma                             | Causa Provável                         |
| ----------------------------------- | -------------------------------------- |
| App fecha instantaneamente          | Import-time error (env vars undefined) |
| "App Falhou" sem log                | Hermes crash antes do React montar     |
| Red screen no dev, crash no release | process.env undefined                  |
| Funciona em Android, quebra iOS     | Hermes optimization diferente          |

## 🛡️ Defesa em Profundidade

1. **Layer 1**: Validação de env vars com erro explícito
2. **Layer 2**: Dynamic imports para módulos críticos
3. **Layer 3**: setTimeout em navegação
4. **Layer 4**: ErrorBoundary como último recurso

## ✅ Checklist Final Antes de Submit

- [ ] Build de teste instalado via TestFlight
- [ ] App abre sem crash
- [ ] Login/Signup funcionam
- [ ] Navegação entre telas funciona
- [ ] Câmera abre e funciona
- [ ] Dados são salvos no Supabase
- [ ] Dark mode funciona
- [ ] Sem warnings no console

## 🎯 Lembre-se

> **iOS Release não perdoa erros que Development tolera.**

**Sempre teste em Release antes de submeter!**
