# Solução para Biometria sem Loop Infinito

## Problema Identificado

O loop infinito acontecia porque:

1. App iniciava → pedia biometria
2. Biometria autenticava → voltava pro app
3. App "reiniciava" algum state → pedia biometria novamente
4. Loop infinito 🔁

## Como a Nova Solução Funciona

### 1. **Controle de Sessão**

```typescript
const hasAuthenticatedThisSession = useRef(false);
```

- Mantém registro se o usuário JÁ autenticou nesta sessão do app
- Usa `useRef` para não causar re-renders
- Uma vez autenticado, não pede novamente até que o app vá para background

### 2. **Detecção de Background/Foreground**

```typescript
AppState.addEventListener('change', handleAppStateChange);
```

- Monitora quando o app vai para background ou retorna
- **SÓ bloqueia** quando:
  - App estava em background E voltou para ativo
  - Biometria está habilitada
  - Usuário já tinha autenticado antes (ou seja, não é primeira vez)

### 3. **Primeira Montagem do Componente**

```typescript
const isFirstMount = useRef(true);
```

- Identifica se é a primeira vez que o componente está montando
- Na primeira vez + biometria habilitada → bloqueia e pede autenticação
- Aguarda 500ms antes de mostrar o prompt (para não conflitar com splash)

### 4. **Proteção contra Múltiplas Autenticações**

```typescript
if (isAuthenticating) {
  return;
}
```

- Evita que múltiplos prompts de biometria apareçam ao mesmo tempo
- Se já está autenticando, ignora novas tentativas

## Fluxo Completo

### Cenário 1: Primeira Abertura do App (Biometria Habilitada)

```
1. App abre
2. Splash screen aparece
3. BiometricLock monta
4. Detecta: primeira montagem + biometria habilitada
5. Bloqueia a tela
6. Aguarda 500ms (splash termina)
7. Mostra prompt de biometria
8. Usuário autentica
9. hasAuthenticatedThisSession = true
10. Desbloqueia → usuário acessa o app
```

### Cenário 2: App Vai para Background e Retorna

```
1. Usuário está usando o app (já autenticado)
2. Minimiza o app (vai para background)
3. AppState detecta mudança para 'background'
4. Usuário retorna ao app
5. AppState detecta mudança para 'active'
6. Detecta: voltou do background + já tinha autenticado antes
7. Bloqueia a tela
8. Aguarda 300ms
9. Mostra prompt de biometria
10. Usuário autentica → desbloqueia
```

### Cenário 3: Biometria Desabilitada

```
1. App abre normalmente
2. BiometricLock verifica configuração
3. biometricEnabled = false
4. Nunca bloqueia → sempre mostra {children}
```

## Estados Importantes

| Estado                        | Tipo     | Propósito                                           |
| ----------------------------- | -------- | --------------------------------------------------- |
| `isLocked`                    | useState | Controla se a tela está bloqueada (UI)              |
| `biometricEnabled`            | useState | Se biometria está habilitada nas configurações      |
| `isAuthenticating`            | useState | Se está em processo de autenticação                 |
| `hasAuthenticatedThisSession` | useRef   | Se já autenticou nesta sessão (não causa re-render) |
| `isFirstMount`                | useRef   | Se é a primeira montagem do componente              |
| `appState`                    | useRef   | Estado atual do app (active/background/inactive)    |

## Integração no App

O componente já está integrado no `_layout.tsx`:

```tsx
<ErrorBoundary>
  <ThemeProvider>
    <BiometricLock>
      <ThemedStack />
    </BiometricLock>
  </ThemeProvider>
</ErrorBoundary>
```

## Configuração do Usuário

A configuração continua sendo feita em `settings.tsx`:

- Toggle liga/desliga a biometria
- Salva no AsyncStorage: `@pocket_biometric_enabled`
- BiometricLock lê essa configuração

## Testando

### Como testar se está funcionando:

1. **Teste do Loop** ✅
   - Abra o app
   - Autentique com biometria
   - O app NÃO deve pedir novamente
   - Navegue pelas telas → NÃO deve pedir novamente

2. **Teste do Background** ✅
   - Abra o app e autentique
   - Minimize o app (home do iPhone)
   - Volte para o app
   - DEVE pedir biometria novamente

3. **Teste de Desabilitar** ✅
   - Vá em Settings
   - Desligue a biometria
   - Feche e abra o app
   - NÃO deve pedir biometria

4. **Teste do Splash** ✅
   - Feche o app completamente
   - Abra novamente
   - Splash screen deve aparecer
   - Após splash, biometria deve aparecer
   - SEM loops ou múltiplos prompts

## Ajustes de Timing (se necessário)

Se você notar algum comportamento estranho, pode ajustar os delays:

```typescript
// Delay após primeira montagem (linha ~37)
setTimeout(() => {
  authenticate();
}, 500); // Aumente para 700-1000 se splash for mais longo

// Delay ao voltar do background (linha ~62)
setTimeout(() => {
  authenticate();
}, 300); // Aumente para 500 se necessário
```

## Fail-Safe

Se algo der errado na autenticação biométrica:

```typescript
catch (error) {
  // Permite acesso em caso de erro
  hasAuthenticatedThisSession.current = true;
  setIsLocked(false);
}
```

Isso garante que bugs na biblioteca de biometria não vão travar o app.

## Dependências

Certifique-se de ter instalado:

```bash
npx expo install expo-local-authentication
npx expo install @react-native-async-storage/async-storage
```

## Permissões (iOS)

No `app.json`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSFaceIDUsageDescription": "Precisamos usar o Face ID para proteger seu acesso ao Pocket"
      }
    }
  }
}
```

## Próximos Passos

Se quiser melhorar ainda mais:

1. **Adicionar timeout**: Se usuário cancelar biometria 3x, fazer logout
2. **Animação de transição**: Fade in/out ao bloquear/desbloquear
3. **Botão manual**: "Autenticar novamente" na tela de bloqueio
4. **Logging**: Sentry/analytics quando biometria falha
