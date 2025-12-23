# Documentação de Deploy - Pocket App

Guias passo a passo para publicar o aplicativo Pocket.

## Ordem Recomendada

Siga os guias nesta ordem:

### 1. [Setup do GitHub](01-github-setup.md)
Aprenda a criar repositório e fazer upload do código.

**Tempo estimado:** 15-30 minutos

**Você vai aprender:**
- Criar repositório no GitHub
- Configurar Git local
- Fazer primeiro commit e push
- Boas práticas de commit messages

### 2. [Configuração do Ícone](02-app-icon-setup.md)
Configure o ícone do canguru no aplicativo.

**Tempo estimado:** 30-60 minutos

**Você vai aprender:**
- Preparar imagem para ícone iOS e Android
- Adicionar fundo branco para iOS
- Configurar adaptive icon do Android
- Testar o ícone no dispositivo

### 3. [Deploy no TestFlight](03-testflight-deployment.md)
Publique o app para testes via TestFlight.

**Tempo estimado:** 2-3 horas (primeira vez)

**Você vai aprender:**
- Configurar Apple Developer Account
- Criar app no App Store Connect
- Usar EAS Build para gerar builds
- Adicionar testadores
- Distribuir atualizações

## Pré-requisitos Gerais

### Contas Necessárias
- ✅ Conta GitHub (gratuito)
- ✅ Apple Developer Program ($99/ano) - para TestFlight
- ✅ Conta Expo (gratuito)

### Software Necessário
- ✅ Git instalado
- ✅ Node.js e npm instalados
- ✅ Expo CLI instalado
- ✅ EAS CLI instalado (para iOS build)

### Conhecimento Recomendado
- Básico de linha de comando/terminal
- Básico de Git (commit, push, pull)
- Como navegar no terminal

## Estrutura de Arquivos Importantes

```
pocket/
├── app/                    # Código do app (Expo Router)
├── assets/                 # Imagens e ícones
│   ├── icon.png           # Ícone principal (1024x1024)
│   ├── adaptive-icon.png  # Ícone Android
│   └── images/
│       └── Canguru.png    # Imagem do canguru (ícone)
├── docs/                  # Esta documentação
├── app.json               # Configuração Expo
├── eas.json               # Configuração EAS Build
├── package.json           # Dependências
└── .gitignore            # Arquivos ignorados pelo Git
```

## Custos Envolvidos

| Serviço | Custo | Necessário Para |
|---------|-------|-----------------|
| GitHub | Gratuito | Hospedar código |
| Expo Account | Gratuito | Builds básicos |
| Apple Developer | $99/ano | TestFlight + App Store |
| EAS Production | $29/mês | Builds ilimitados (opcional) |

## Fluxo de Trabalho Típico

### Desenvolvimento Local
```bash
# 1. Fazer mudanças no código
# 2. Testar localmente
npm start

# 3. Commit das mudanças
git add .
git commit -m "feat: adiciona nova funcionalidade"
git push
```

### Deploy para TestFlight
```bash
# 1. Atualizar versão no app.json
# 2. Gerar build
eas build --platform ios --profile production

# 3. Aguardar conclusão
# 4. Build automaticamente vai para TestFlight
# 5. Testadores recebem notificação
```

## Dicas Importantes

### Git e GitHub
- ✅ Faça commits frequentes com mensagens claras
- ✅ Use Conventional Commits (feat:, fix:, etc.)
- ✅ Nunca commite arquivos `.env` com secrets
- ✅ Sempre faça `git pull` antes de começar a trabalhar

### TestFlight
- ⏱️ Primeiro build pode levar 24-48h para aprovação
- ⏱️ Builds seguintes são instantâneos
- 👥 Até 100 testadores internos (sem revisão)
- 👥 Até 10.000 testadores externos (requer revisão)
- 🔄 Testadores recebem notificações automáticas de updates

### EAS Build
- 🎯 Use profile `production` para TestFlight
- 🎯 Use profile `preview` para testes internos
- 💰 Free tier: 30 builds/mês
- 💰 Production tier: builds ilimitados ($29/mês)

## Solução Rápida de Problemas

### Git
**Problema:** "permission denied"
**Solução:** Use Personal Access Token em vez de senha

### TestFlight
**Problema:** Build não aparece
**Solução:** Aguarde 10-15 min, builds precisam processar

### EAS Build
**Problema:** Build falha
**Solução:** Verifique `eas build:list` para ver logs de erro

## Recursos e Links Úteis

### Documentação Oficial
- [Expo Docs](https://docs.expo.dev/)
- [EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [TestFlight Docs](https://developer.apple.com/testflight/)
- [Git Docs](https://git-scm.com/doc)

### Comunidade
- [Expo Forum](https://forums.expo.dev/)
- [Expo Discord](https://chat.expo.dev/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/expo)

### Ferramentas
- [AppIcon.co](https://www.appicon.co/) - Gerar ícones
- [Remove.bg](https://www.remove.bg/) - Editar fundos
- [GitHub Desktop](https://desktop.github.com/) - Git com interface gráfica

## Suporte

Se encontrar problemas:

1. **Consulte o guia específico** do passo que está tendo problema
2. **Verifique a seção "Solução de Problemas"** em cada guia
3. **Busque no Expo Forum** - provavelmente alguém já teve o mesmo problema
4. **Abra issue no GitHub** do projeto (se for bug do código)

## Checklist Completo

Use esta lista para acompanhar seu progresso:

### GitHub
- [ ] Conta GitHub criada
- [ ] Repositório criado
- [ ] Git configurado localmente
- [ ] .gitignore criado
- [ ] Primeiro commit feito
- [ ] Push para GitHub concluído

### Ícone
- [ ] Imagem do canguru com fundo branco (1024x1024)
- [ ] icon.png substituído
- [ ] adaptive-icon.png substituído
- [ ] app.json configurado
- [ ] Testado em build de desenvolvimento

### TestFlight
- [ ] Apple Developer Program ativo
- [ ] App criado no App Store Connect
- [ ] EAS CLI instalado e configurado
- [ ] eas.json criado
- [ ] Primeiro build gerado
- [ ] Build apareceu no TestFlight
- [ ] Testadores adicionados
- [ ] App instalado e testado

## Próximos Passos Após TestFlight

Quando o app estiver estável no TestFlight:

1. **Criar screenshots** para App Store (vários tamanhos de tela)
2. **Escrever descrição** do app em português
3. **Configurar metadados** (categoria, keywords, etc.)
4. **Preencher Privacy Policy** (se coletar dados de usuário)
5. **Submeter para revisão** da App Store
6. **Aguardar aprovação** (pode levar 24-48h)
7. **Publicar** na App Store! 🎉

---

**Boa sorte com o deploy do Pocket! 🦘**
