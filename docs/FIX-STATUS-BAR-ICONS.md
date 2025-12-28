# Fix: Status Bar Icons White in Light Mode

## 🐛 Problema

Os ícones nativos do celular (bateria, sinal, hora) aparecem brancos tanto no modo claro quanto no modo escuro, tornando-os invisíveis no modo claro.

## 🔍 Causa Raiz

A aplicação não estava configurando o `StatusBar` para adaptar-se ao tema atual (claro/escuro).

## ⚠️ Nota Importante

Esta solução usa o `StatusBar` nativo do React Native com a API imperativa `setBarStyle()`, que funciona **independentemente** da configuração do `Info.plist`.

## ✅ Solução Aplicada

### 1. Modificações em `app.config.js`

Mudamos `UIViewControllerBasedStatusBarAppearance` para `false` para permitir controle global da StatusBar:

**Antes:**
```javascript
infoPlist: {
  UIViewControllerBasedStatusBarAppearance: true,
}
```

**Depois:**
```javascript
infoPlist: {
  UIViewControllerBasedStatusBarAppearance: false,
}
```

**Por quê?**
- `true` = Cada ViewController controla sua própria StatusBar
- `false` = StatusBar global controlada pela aplicação ✅

### 2. Modificações em `app/_layout.tsx`

#### 2.1. Imports atualizados

```typescript
import {
  View,
  ActivityIndicator,
  StyleSheet,
  StatusBar,        // ← StatusBar nativo do React Native
  useColorScheme,
} from 'react-native';
import { ThemeProvider, useTheme } from '@/lib/theme';
```

**IMPORTANTE:** Usamos `StatusBar` de `'react-native'`, NÃO de `'expo-status-bar'`.

#### 2.2. Componente `ThemedStack` atualizado

```typescript
function ThemedStack() {
  const { isDark } = useTheme();
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  // Update status bar whenever theme changes
  useEffect(() => {
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
  }, [isDark]);

  return (
    <>
      <Stack>
        {/* ... telas ... */}
      </Stack>
      {showAnimatedSplash && (
        <AnimatedSplashScreen onComplete={() => setShowAnimatedSplash(false)} />
      )}
    </>
  );
}
```

**Lógica:**
- `StatusBar.setBarStyle()` = API imperativa do React Native
- `isDark ? 'light-content' : 'dark-content'`:
  - Tema escuro → `'light-content'` → ícones brancos ✅
  - Tema claro → `'dark-content'` → ícones pretos ✅
- Segundo parâmetro `true` = transição animada
- `useEffect` = atualiza StatusBar sempre que `isDark` muda

## 📊 Comportamento

### Antes
- ❌ Modo claro: Ícones brancos (invisíveis)
- ✅ Modo escuro: Ícones brancos (visíveis)

### Depois
- ✅ Modo claro: Ícones pretos (visíveis)
- ✅ Modo escuro: Ícones brancos (visíveis)

## 🔧 Como Funciona

1. **ThemeProvider** gerencia o tema global
2. **ThemedStack** usa `useTheme()` para ler `isDark`
3. **useEffect** chama `StatusBar.setBarStyle()` quando `isDark` muda
4. **StatusBar** atualiza os ícones nativos do iOS

## 📝 Arquivos Modificados

1. `app/_layout.tsx` (linhas 5-10, 38-45)
2. `app.config.js` (linha 26)

## ⚠️ IMPORTANTE: Rebuild Necessário

Como modificamos o `app.config.js` (especificamente o `infoPlist`), é **OBRIGATÓRIO** fazer um novo build:

```bash
# Para iOS (TestFlight)
eas build --platform ios --profile production
```

**Não é suficiente** simplesmente atualizar o app via hot reload. O `Info.plist` é gerado durante o build nativo.

## 🧪 Como Testar (APÓS o novo build)

1. **Teste Modo Claro:**
   - Vá em Settings
   - Selecione "Modo Claro"
   - Verifique se os ícones da barra superior (bateria, sinal, hora) estão **pretos**

2. **Teste Modo Escuro:**
   - Vá em Settings
   - Selecione "Modo Escuro"
   - Verifique se os ícones da barra superior estão **brancos**

3. **Teste Modo Sistema:**
   - Vá em Settings
   - Selecione "Sistema"
   - Mude o tema do sistema (iOS)
   - Verifique se os ícones se adaptam automaticamente

## 🎯 Resultado Esperado

Os ícones nativos do celular (bateria, sinal, hora) devem estar sempre visíveis, independente do tema:
- Modo claro → Ícones pretos ✅
- Modo escuro → Ícones brancos ✅
