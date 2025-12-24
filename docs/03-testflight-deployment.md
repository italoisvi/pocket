# Guia: Deploy no TestFlight (Apple)

Este guia completo explica como publicar o app Pocket no TestFlight para testes.

## Pré-requisitos

### Contas e Inscrições

- ✅ Apple ID ativo
- ✅ **Apple Developer Program** ($99/ano USD) - **OBRIGATÓRIO**
  - Inscreva-se em: [developer.apple.com/programs](https://developer.apple.com/programs)
  - Aguarde aprovação (pode levar até 48 horas)
- ✅ Mac com macOS (necessário para build iOS)

### Software Necessário

- ✅ Xcode instalado (via App Store)
- ✅ Expo CLI instalado (`npm install -g expo-cli`)
- ✅ EAS CLI instalado (`npm install -g eas-cli`)

## Visão Geral do Processo

```
1. Configurar Apple Developer Account
2. Configurar App Store Connect
3. Configurar Projeto com EAS
4. Gerar Build para iOS
5. Upload Automático para TestFlight
6. Adicionar Testadores
7. Distribuir para Teste
```

## Parte 1: Apple Developer Program

### 1.1. Inscrever-se no Apple Developer Program

1. Acesse [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll)
2. Clique em **"Start Your Enrollment"**
3. Faça login com seu Apple ID
4. Preencha as informações pessoais/empresa
5. Aceite os termos do contrato
6. Pague a taxa anual de $99 USD
7. Aguarde aprovação (pode levar 24-48h)

### 1.2. Verificar Aprovação

1. Acesse [developer.apple.com/account](https://developer.apple.com/account)
2. Verifique se aparece "Membership: Active"

## Parte 2: App Store Connect

### 2.1. Criar App no App Store Connect

1. Acesse [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Faça login com Apple ID da conta Developer
3. Clique em **"My Apps"**
4. Clique no botão **"+"** e selecione **"New App"**
5. Preencha as informações:
   - **Platform:** iOS
   - **Name:** Pocket
   - **Primary Language:** Portuguese (Brazil)
   - **Bundle ID:** Selecione "Xcode iOS App" e digite `com.pocket.app`
     - ⚠️ **Importante:** Deve ser único e igual ao do `app.json`
   - **SKU:** `pocket-app` (identificador interno único)
   - **User Access:** Full Access
6. Clique em **"Create"**

### 2.2. Preencher Informações Básicas

1. Na aba **"App Information"**:
   - **Subtitle:** "Controle suas finanças pessoais"
   - **Category:** Finance
   - **Primary Category:** Finance

2. Na aba **"Pricing and Availability"**:
   - **Price:** Free (0 USD)
   - **Availability:** All countries

3. **NÃO** preencha screenshots ainda (faremos depois)

## Parte 3: Configurar Projeto com EAS

### 3.1. Instalar EAS CLI

```bash
npm install -g eas-cli
```

### 3.2. Login no EAS

```bash
# Fazer login com sua conta Expo
eas login
```

Se não tem conta Expo:

```bash
# Criar conta
eas register
```

### 3.3. Configurar Projeto

```bash
# Na pasta do projeto
cd c:\Users\italo\source\repo\pocket

# Inicializar configuração EAS
eas build:configure
```

Isso criará o arquivo `eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "autoIncrement": true
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "seu.email@exemplo.com",
        "ascAppId": "SEU_APP_ID",
        "appleTeamId": "SEU_TEAM_ID"
      }
    }
  }
}
```

### 3.4. Atualizar app.json

Verifique se o `app.json` tem estas configurações:

```json
{
  "expo": {
    "name": "Pocket",
    "slug": "pocket",
    "version": "1.0.0",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.pocket.app",
      "buildNumber": "1"
    }
  }
}
```

## Parte 4: Gerar Build iOS

### 4.1. Preparar Credenciais

```bash
# EAS irá criar/configurar certificados automaticamente
eas build --platform ios --profile production
```

Você será perguntado:

- **Generate a new Apple Distribution Certificate?** → Yes
- **Generate a new Apple Provisioning Profile?** → Yes
- **Set up Push Notifications?** → Yes (se quiser notificações no futuro)

### 4.2. Aguardar Build

O build será feito nos servidores da Expo (não precisa de Mac localmente):

```
✔ Build started
⠙ Building... (this may take 15-30 minutes)
```

Você pode acompanhar em: [expo.dev/accounts/SEU_USUARIO/projects/pocket/builds](https://expo.dev)

### 4.3. Download do IPA (Opcional)

Quando terminar, você receberá:

- Link para download do arquivo `.ipa`
- Build foi automaticamente enviado ao TestFlight

## Parte 5: TestFlight (Automático via EAS)

### 5.1. Verificar Upload

1. Acesse [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Vá em **"My Apps"** → **"Pocket"**
3. Clique em **"TestFlight"** no topo
4. Aguarde aparecer o build (pode levar 5-15 minutos)
5. O build passará por processamento automático

### 5.2. Preencher Informações de Teste

1. Clique no build que apareceu
2. Preencha:
   - **What to Test:** "Primeira versão do app para testes internos"
   - **Test Details:** "Testar funcionalidades básicas: login, cadastro, scan de recibos"
3. Clique em **"Save"**

### 5.3. Aguardar Revisão (apenas primeira vez)

- ⏱️ Primeira build: Apple revisa (pode levar 24-48h)
- ✅ Próximas builds: Instantâneo

## Parte 6: Adicionar Testadores

### 6.1. Testadores Internos (até 100 pessoas)

1. No App Store Connect → TestFlight → **"Internal Testing"**
2. Clique em **"Add Internal Testers"**
3. Se necessário, adicione usuários em **"Users and Access"** primeiro
4. Selecione os testadores
5. Clique em **"Add"**
6. Os testadores receberão email automaticamente

### 6.2. Testadores Externos (até 10.000 pessoas)

1. No App Store Connect → TestFlight → **"External Testing"**
2. Clique em **"+"** para criar novo grupo
3. Nome do grupo: "Beta Testers"
4. Clique em **"Add Testers"**
5. Digite emails dos testadores
6. **Importante:** Primeira vez com testadores externos requer revisão da Apple
7. Clique em **"Submit for Review"**

## Parte 7: Instalar TestFlight

### 7.1. Para Você (Testador)

1. Baixe **TestFlight** na App Store
2. Abra o email de convite
3. Clique em **"View in TestFlight"** ou **"Redeem"**
4. Aceite o convite no app TestFlight
5. Clique em **"Install"** no app Pocket

### 7.2. Para Outros Testadores

Envie convite via:

- **Email direto:** App Store Connect adiciona automaticamente
- **Link público:** TestFlight → External Testing → "Public Link"

## Parte 8: Atualizar App

Quando fizer mudanças no código:

```bash
# 1. Commit das mudanças
git add .
git commit -m "feat: nova funcionalidade"
git push

# 2. Atualizar versão no app.json
# version: "1.0.0" → "1.0.1"
# buildNumber: "1" → "2"

# 3. Gerar novo build
eas build --platform ios --profile production

# 4. Build será automaticamente enviado ao TestFlight
# 5. Testadores receberão notificação de nova versão
```

## Comandos Úteis EAS

```bash
# Ver status de builds
eas build:list

# Ver detalhes de build específico
eas build:view [BUILD_ID]

# Cancelar build em andamento
eas build:cancel

# Ver credenciais configuradas
eas credentials

# Submeter manualmente para App Store
eas submit --platform ios
```

## Custos

| Item                    | Custo                          |
| ----------------------- | ------------------------------ |
| Apple Developer Program | $99/ano USD                    |
| EAS Build (Expo)        | Gratuito (primeiros builds)    |
| EAS Build Production    | $29/mês USD (unlimited builds) |
| Hospedagem do código    | Gratuito (GitHub)              |

### Planos EAS

- **Free:** 30 builds/mês
- **Production:** $29/mês - Builds ilimitados
- **Enterprise:** $99/mês - Builds ilimitados + suporte prioritário

## Solução de Problemas

### Erro: "Bundle identifier is not available"

**Solução:** O Bundle ID já está em uso. Mude no `app.json`:

```json
"bundleIdentifier": "com.seuNome.pocket"
```

### Erro: "Apple ID authentication failed"

**Solução:**

1. Habilite autenticação de dois fatores no Apple ID
2. Gere App-Specific Password: [appleid.apple.com](https://appleid.apple.com)
3. Use a senha específica ao fazer login no EAS

### Build falha com erro de certificado

**Solução:**

```bash
# Limpar credenciais e reconfigurar
eas credentials
# Selecione: Remove all credentials
# Tente build novamente
eas build --platform ios --profile production
```

### TestFlight não recebe build

**Solução:**

1. Verifique em App Store Connect → Activity → All Builds
2. Build pode estar "Processing" (aguarde 10-15 min)
3. Verifique email por mensagens da Apple

### Testadores não recebem convite

**Solução:**

1. Verifique pasta de spam
2. No TestFlight, clique em "Resend Invite"
3. Use link público como alternativa

## Checklist Final

Antes do primeiro build:

- [ ] Apple Developer Program ativo
- [ ] App criado no App Store Connect
- [ ] Bundle ID único configurado
- [ ] EAS CLI instalado e logado
- [ ] `eas.json` configurado
- [ ] `app.json` com bundle ID correto
- [ ] Ícone do app configurado (1024x1024px)
- [ ] Código commitado no Git

Primeiro build:

- [ ] `eas build --platform ios --profile production`
- [ ] Aguardar conclusão (15-30 min)
- [ ] Verificar no App Store Connect
- [ ] Aguardar processamento do TestFlight
- [ ] Preencher "What to Test"
- [ ] Adicionar testadores internos
- [ ] Enviar convites

## Recursos Adicionais

- [Documentação EAS Build](https://docs.expo.dev/build/introduction/)
- [Documentação TestFlight](https://developer.apple.com/testflight/)
- [App Store Connect Guide](https://developer.apple.com/app-store-connect/)
- [Expo Forum](https://forums.expo.dev/)

## Próximos Passos

Após TestFlight funcionando:

1. Coletar feedback dos testadores
2. Corrigir bugs encontrados
3. Quando estável, preparar para publicação na App Store
4. Criar screenshots e descrição da App Store
5. Submeter para revisão final da Apple
