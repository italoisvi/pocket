# Fix: Remover Splash Nativo e Usar Kangaroo.png nas Telas de Auth

## 🐛 Problemas

1. **Splash nativo aparecendo antes do AnimatedSplashScreen**: Uma imagem de canguru preto e branco aparecia antes do splash screen animado (GIF)
2. **Ícone SVG nas telas de login/signup**: As telas usavam `KangarooIcon` (SVG) que tinha problemas de cor/inversão

## 🔍 Causa Raiz

1. **Splash nativo**: Configurado em `app.config.js` com a imagem `./assets/images/Pocket.png`
2. **Ícone SVG**: Usava lógica de inversão complexa que não ficava consistente

## ✅ Solução Aplicada

### 1. Removido Splash Nativo

**Arquivo:** `app.config.js`

**Antes:**

```javascript
export default {
  expo: {
    name: 'Pocket',
    slug: 'pocket',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: 'pocket',
    splash: {
      image: './assets/images/Pocket.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    // ...
  },
};
```

**Depois:**

```javascript
export default {
  expo: {
    name: 'Pocket',
    slug: 'pocket',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: 'pocket',
    assetBundlePatterns: ['**/*'], // Splash removido ✅
    // ...
  },
};
```

**Resultado:** Agora apenas o `AnimatedSplashScreen` (com o GIF) é exibido, sem nenhuma tela antes dele.

### 2. Atualizado Tela de Login

**Arquivo:** `app/(auth)/login.tsx`

**Mudanças:**

1. **Removido import do KangarooIcon:**

```typescript
// Antes
import { KangarooIcon } from '@/components/KangarooIcon';

// Depois
import { Image } from 'react-native';
```

2. **Substituído SVG por PNG:**

```typescript
// Antes
<View style={styles.logoContainer}>
  <KangarooIcon
    size={120}
    color={theme.background === '#000' ? '#FFF' : '#000'}
    inverted={theme.background !== '#000'}
  />
</View>

// Depois
<View style={styles.logoContainer}>
  <Image
    source={require('@/assets/images/kangaroo.png')}
    style={styles.logo}
    resizeMode="contain"
  />
</View>
```

3. **Adicionado estilo:**

```typescript
logo: {
  width: 120,
  height: 120,
},
```

### 3. Atualizado Tela de Signup

**Arquivo:** `app/(auth)/signup.tsx`

Mesmas mudanças aplicadas na tela de login:

- Removido import do `KangarooIcon`
- Adicionado import do `Image`
- Substituído SVG por PNG
- Adicionado estilo `logo`

## 📊 Resultado Final

### Splash Screen

- ✅ **Antes:** Canguru preto/branco estático → GIF animado
- ✅ **Depois:** GIF animado apenas (sem tela intermediária)

### Telas de Login e Signup

- ✅ **Antes:** Ícone SVG com cor dinâmica complexa
- ✅ **Depois:** Imagem PNG colorida do canguru (kangaroo.png)
- ✅ Funciona perfeitamente em modo claro e escuro
- ✅ Sem problemas de inversão de cores

## 📝 Arquivos Modificados

1. `app.config.js` (linha 10: removida configuração splash)
2. `app/(auth)/login.tsx` (linhas 11, 50-54, 141-144)
3. `app/(auth)/signup.tsx` (linhas 11, 66-70, 169-172)

## ⚠️ IMPORTANTE: Rebuild Necessário

Como modificamos o `app.config.js` (removemos a configuração de splash), é **OBRIGATÓRIO** fazer um novo build:

```bash
# Para iOS (TestFlight)
eas build --platform ios --profile production
```

A mudança no splash screen nativo só terá efeito após um novo build. As telas de login/signup funcionarão imediatamente.

## 🎯 Imagem Usada

**`assets/images/kangaroo.png`**: Canguru amarelo/dourado colorido que é usado em:

- Tela de Login
- Tela de Signup
- Consistente com a identidade visual do app
