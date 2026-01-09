# Checklist para Resubmissão na App Store

## ✅ Correções Implementadas

### 1. Bug na Tela de Assinatura

- [x] Mensagem de erro melhorada quando produtos não estão disponíveis
- [x] Mudou de "Erro" para "Planos em Breve" com mensagem mais amigável
- [x] App agora funciona graciosamente mesmo com produtos pendentes de revisão

### 2. Links Obrigatórios Adicionados

- [x] Link "Termos de Uso" adicionado no modal de assinatura
- [x] Link "Política de Privacidade" adicionado no modal de assinatura
- [x] Links são funcionais e navegam para as páginas corretas

## 📋 O Que Fazer no App Store Connect

### 1. Adicionar Links na Descrição do App

Vá em **App Store Connect** → Seu App → **App Information** e adicione no final da **descrição**:

```
TERMOS E PRIVACIDADE

Termos de Uso: [URL da sua página de termos]
Política de Privacidade: [URL da sua página de privacidade]
```

**IMPORTANTE:** Você precisa hospedar essas páginas em algum lugar público:

- Opção 1: GitHub Pages (gratuito)
- Opção 2: Seu próprio domínio
- Opção 3: Plataforma como Notion (com link público)

### 2. Adicionar URL de Privacidade

Vá em **App Store Connect** → Seu App → **App Privacy** → **Privacy Policy URL**

Adicione a URL pública da sua política de privacidade.

### 3. Criar Nova Versão do App

```bash
# 1. Incrementar versão no app.config.js
# Mudar de version: '1.0.0' para version: '1.0.1'

# 2. Criar novo build
eas build --platform ios --profile production

# 3. Aguardar build completar (15-30 min)

# 4. Submeter para revisão novamente
```

## 🌐 Como Hospedar Termos e Privacidade (GitHub Pages)

### Opção Rápida: GitHub Pages

1. Crie um repositório público no GitHub chamado `pocket-legal`
2. Adicione os arquivos:
   - `terms.html` (Termos de Uso em HTML)
   - `privacy.html` (Política de Privacidade em HTML)
3. Ative GitHub Pages nas configurações
4. As URLs serão:
   - `https://seu-usuario.github.io/pocket-legal/terms.html`
   - `https://seu-usuario.github.io/pocket-legal/privacy.html`

### Template HTML Simples

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Termos de Uso - Pocket</title>
    <style>
      body {
        font-family:
          -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 800px;
        margin: 40px auto;
        padding: 20px;
        line-height: 1.6;
      }
      h1 {
        color: #333;
      }
      h2 {
        color: #666;
        margin-top: 30px;
      }
    </style>
  </head>
  <body>
    <!-- Cole o conteúdo dos seus termos aqui -->
  </body>
</html>
```

## 📝 Mensagem para o Revisor da Apple

Ao submeter novamente, adicione esta nota para o revisor:

```
Thank you for your review. We have addressed all the issues:

1. Fixed the subscription screen error - The app now displays a user-friendly message when products are pending review instead of showing an error.

2. Added required legal links - Terms of Use and Privacy Policy links are now visible in the subscription modal and navigate to functional pages within the app. We have also added these links to the App Store Connect metadata.

The subscription products are currently "Waiting for Review" status, but the app handles this gracefully and will work correctly once the products are approved.

Please note: The subscription functionality requires the In-App Purchase products to be approved before they can be fully tested. The app's behavior is correct and will display available plans once the products are approved.
```

## ⏭️ Próximos Passos

1. [ ] Hospedar Termos e Privacidade publicamente
2. [ ] Adicionar URLs no App Store Connect
3. [ ] Incrementar versão para 1.0.1
4. [ ] Criar novo build com `eas build`
5. [ ] Submeter com nota para o revisor
6. [ ] Aguardar aprovação (geralmente 24-48h)

## 🎯 Depois da Aprovação

Quando os produtos forem aprovados:

1. Os planos aparecerão automaticamente no app
2. Usuários poderão assinar normalmente
3. Você pode testar com conta Sandbox

---

**Dica:** Teste o app no TestFlight antes de submeter para garantir que os links funcionam corretamente!
