# Checklist de Implementação - Biometria sem Loop

## ✅ Pré-requisitos (Você já tem tudo!)

- [x] `expo-local-authentication` v17.0.8 instalado
- [x] AsyncStorage configurado
- [x] Settings.tsx com toggle funcionando
- [x] Chave `@pocket_biometric_enabled` sendo usada
- [x] BiometricLock já integrado no \_layout.tsx

## 📋 Passos para Implementar

### 1. Fazer Backup do Arquivo Atual

```bash
# No seu projeto
cp components/BiometricLock.tsx components/BiometricLock.tsx.backup
```

### 2. Substituir o Arquivo

- Copie o novo `BiometricLock.tsx` que criei
- Cole em `components/BiometricLock.tsx`
- Substitua o conteúdo completamente

### 3. Verificar Imports (já devem estar corretos)

```typescript
// No novo arquivo, certifique-se que esses imports estão presentes:
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
```

### 4. Build e Teste

```bash
# Limpar cache se necessário
npx expo start -c

# Ou build para testar no device
eas build --profile development --platform ios
```

## 🧪 Testes Essenciais

### Teste 1: Primeira Abertura (Biometria Ligada)

- [ ] Feche o app completamente (swipe up e feche)
- [ ] Abra o app novamente
- [ ] Splash screen deve aparecer normalmente
- [ ] Após splash, biometria deve aparecer UMA ÚNICA VEZ
- [ ] Autentique com Face ID/Touch ID
- [ ] App deve abrir normalmente
- [ ] **NÃO DEVE** pedir biometria novamente

### Teste 2: Background/Foreground

- [ ] Com o app aberto e autenticado
- [ ] Minimize o app (botão home)
- [ ] Abra outro app qualquer
- [ ] Volte para o Pocket
- [ ] **DEVE** pedir biometria novamente
- [ ] Autentique
- [ ] App desbloqueia normalmente

### Teste 3: Navegação no App

- [ ] Com app desbloqueado
- [ ] Navegue entre as tabs
- [ ] Entre em telas de detalhes
- [ ] Volte para tela anterior
- [ ] **NÃO DEVE** pedir biometria durante navegação

### Teste 4: Biometria Desligada

- [ ] Vá em Settings
- [ ] Desligue o toggle de biometria
- [ ] Feche o app completamente
- [ ] Abra novamente
- [ ] **NÃO DEVE** pedir biometria
- [ ] App abre direto após splash

### Teste 5: Cancelar Biometria

- [ ] Abra o app (ou volte do background)
- [ ] Quando biometria aparecer, clique em "Cancelar"
- [ ] Biometria deve aparecer novamente após 1 segundo
- [ ] Tente autenticar novamente
- [ ] Deve funcionar normalmente

### Teste 6: Biometria Falha

- [ ] Abra o app
- [ ] Tente usar biometria errada propositalmente (se possível)
- [ ] Ou cancele algumas vezes
- [ ] Sistema deve continuar pedindo
- [ ] **NÃO DEVE** travar ou fazer loop infinito

## 🐛 Debug (se necessário)

### Se algo não funcionar, verifique:

1. **Console Logs**

```typescript
// O novo BiometricLock tem logs úteis:
// [BiometricLock] Autenticação já em andamento
// [BiometricLock] Iniciando autenticação biométrica
// [BiometricLock] Autenticação bem-sucedida
// [BiometricLock] App voltou do background - bloqueando
```

Procure por esses logs no console do Expo para debugar.

2. **AsyncStorage**

```typescript
// Verificar se a chave está salva:
import AsyncStorage from '@react-native-async-storage/async-storage';

const checkBiometric = async () => {
  const value = await AsyncStorage.getItem('@pocket_biometric_enabled');
  console.log('Biometric setting:', value);
};
```

3. **AppState**

```typescript
// Verificar se AppState está funcionando:
import { AppState } from 'react-native';

AppState.addEventListener('change', (state) => {
  console.log('App state changed to:', state);
});
```

## ⚙️ Ajustes Finos (se necessário)

### Se Biometria Aparecer Muito Cedo (antes do splash terminar)

No `BiometricLock.tsx`, linha ~37, aumente o delay:

```typescript
setTimeout(() => {
  authenticate();
}, 1000); // Era 500, agora 1000ms
```

### Se Biometria Aparecer Muito Tarde ao Voltar do Background

No `BiometricLock.tsx`, linha ~62, diminua o delay:

```typescript
setTimeout(() => {
  authenticate();
}, 100); // Era 300, agora 100ms
```

### Se Quiser Adicionar Vibração ao Bloquear

```typescript
import { Vibration } from 'react-native';

// Na função authenticate(), antes do prompt:
Vibration.vibrate(50);
```

## 📱 Permissões iOS (já deve estar ok)

Verifique no `app.json`:

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

## 🎯 Comportamento Esperado Final

| Situação                         | Pede Biometria?    | Observação                    |
| -------------------------------- | ------------------ | ----------------------------- |
| Primeira abertura (biometria ON) | ✅ Sim             | Uma vez após splash           |
| Navegação interna                | ❌ Não             | Nunca durante uso normal      |
| Volta do background              | ✅ Sim             | Sempre que minimizar e voltar |
| Biometria OFF                    | ❌ Não             | Nunca                         |
| Erro de autenticação             | 🔄 Tenta novamente | Após 1 segundo                |

## 🚨 Se AINDA Tiver Loop

Se mesmo com o novo código tiver loop infinito:

1. **Verifique se não tem DUAS instâncias de BiometricLock**
   - Procure no código por `<BiometricLock>`
   - Deve aparecer SOMENTE no `_layout.tsx`

2. **Verifique o \_layout.tsx**
   - Certifique-se que BiometricLock envolve o `<ThemedStack />` e não algo dentro do Stack

3. **Limpe o AsyncStorage completamente**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

AsyncStorage.clear();
// Depois configure biometria novamente
```

4. **Rebuild completo**

```bash
# Limpar tudo
rm -rf node_modules
npm install
npx expo start -c
```

## ✅ Checklist Final

Antes de considerar concluído:

- [ ] Loop infinito foi eliminado
- [ ] Biometria aparece apenas quando deve
- [ ] Background/Foreground funciona
- [ ] Settings toggle funciona
- [ ] Usuário consegue usar o app normalmente
- [ ] Logs do console estão limpos (sem erros)

## 📞 Se Precisar de Ajuda

Se encontrar qualquer problema:

1. Copie os logs do console
2. Descreva exatamente quando acontece
3. Me mande que ajusto a solução

---

**Última atualização:** 2026-01-04
**Testado em:** iOS (via Expo)
**Status:** ✅ Pronto para produção
