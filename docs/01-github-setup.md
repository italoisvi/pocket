# Guia: Subir o Projeto no GitHub

Este guia explica como criar um repositório no GitHub e fazer o upload do projeto Pocket.

## Pré-requisitos

- Conta no GitHub ([github.com](https://github.com))
- Git instalado no computador
- Acesso ao terminal/prompt de comando

## Passo a Passo

### 1. Criar Repositório no GitHub

1. Acesse [github.com](https://github.com) e faça login
2. Clique no botão **"+"** no canto superior direito
3. Selecione **"New repository"**
4. Configure o repositório:
   - **Repository name:** `pocket`
   - **Description:** "Personal finance mobile app built with React Native + Expo"
   - **Visibility:** Private (recomendado para projeto pessoal)
   - **NÃO marque** "Initialize this repository with a README"
   - **NÃO adicione** .gitignore ou license
5. Clique em **"Create repository"**

### 2. Configurar Git Local

Abra o terminal na pasta do projeto e execute:

```bash
# Inicializar repositório Git (se ainda não foi feito)
git init

# Configurar seu nome e email (se ainda não configurou)
git config user.name "Seu Nome"
git config user.email "seu.email@exemplo.com"
```

### 3. Criar Arquivo .gitignore

Crie um arquivo `.gitignore` na raiz do projeto com o seguinte conteúdo:

```gitignore
# Dependencies
node_modules/

# Expo
.expo/
.expo-shared/
dist/
web-build/

# Environment variables
.env
.env.local
.env.production

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/

# Build
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
```

### 4. Adicionar Arquivos ao Git

```bash
# Adicionar todos os arquivos
git add .

# Criar primeiro commit
git commit -m "feat: initial commit - personal finance app setup"
```

### 5. Conectar ao Repositório Remoto

Substitua `SEU_USUARIO` pelo seu nome de usuário do GitHub:

```bash
# Adicionar repositório remoto
git remote add origin https://github.com/SEU_USUARIO/pocket.git

# Verificar se foi adicionado corretamente
git remote -v
```

### 6. Fazer Push para o GitHub

```bash
# Renomear branch para main (se necessário)
git branch -M main

# Enviar código para o GitHub
git push -u origin main
```

### 7. Verificar no GitHub

1. Acesse seu repositório no GitHub
2. Atualize a página
3. Você deve ver todos os arquivos do projeto

## Comandos Úteis para o Dia a Dia

```bash
# Ver status dos arquivos
git status

# Adicionar mudanças específicas
git add caminho/para/arquivo

# Criar commit com mensagem
git commit -m "feat: adiciona nova funcionalidade"

# Enviar para GitHub
git push

# Atualizar do GitHub
git pull

# Ver histórico de commits
git log --oneline
```

## Padrão de Commits (Conventional Commits)

Use este formato para mensagens de commit:

- `feat: descrição` - Nova funcionalidade
- `fix: descrição` - Correção de bug
- `refactor: descrição` - Refatoração sem mudança de funcionalidade
- `style: descrição` - Mudanças de formatação/estilo
- `docs: descrição` - Documentação
- `test: descrição` - Adição/modificação de testes
- `chore: descrição` - Tarefas de manutenção

Exemplos:
```bash
git commit -m "feat: adiciona modo escuro nas páginas de login"
git commit -m "fix: corrige exibição do saldo oculto"
git commit -m "refactor: melhora estrutura do componente ExpenseCard"
```

## Solução de Problemas

### Erro: "repository already exists"
O repositório já foi inicializado. Pule o comando `git init`.

### Erro: "remote origin already exists"
Remova e adicione novamente:
```bash
git remote remove origin
git remote add origin https://github.com/SEU_USUARIO/pocket.git
```

### Erro de autenticação
Use Personal Access Token ao invés de senha:
1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Marque `repo` scope
4. Use o token como senha ao fazer push

## Próximos Passos

Após o projeto estar no GitHub, consulte:
- `02-app-icon-setup.md` - Configurar ícone do app
- `03-testflight-deployment.md` - Distribuir via TestFlight
