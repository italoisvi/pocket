# Guia: Configurar Ícone do App

Este guia explica como usar a imagem do canguru como ícone do aplicativo Pocket.

## Sobre o Ícone

Usaremos a imagem: `assets/images/Canguru.png`

## Requisitos de Ícones

### iOS
- **App Icon:** 1024x1024px (PNG sem transparência)
- Formato: PNG
- Background: Necessário (iOS não aceita transparência no ícone)

### Android
- **Foreground:** 1024x1024px (PNG com transparência permitida)
- **Background:** Cor sólida ou imagem 1024x1024px
- Formato: PNG

## Passo a Passo

### 1. Preparar a Imagem do Ícone

A imagem do canguru precisa ser processada para atender os requisitos:

#### Opção A: Usar Ferramenta Online (Recomendado)

1. Acesse: [https://www.appicon.co/](https://www.appicon.co/)
2. Faça upload da imagem `assets/images/Canguru.png`
3. Selecione "iOS" e "Android"
4. Clique em "Generate"
5. Faça download do arquivo ZIP

#### Opção B: Usar Expo (Mais Simples)

O Expo pode gerar automaticamente todos os tamanhos necessários.

### 2. Organizar os Arquivos

Substitua os ícones existentes:

```bash
# iOS - ícone principal
# Substitua: assets/icon.png
# Por uma versão 1024x1024px do canguru COM FUNDO BRANCO

# Android - adaptive icon
# Substitua: assets/adaptive-icon.png
# Por uma versão 1024x1024px do canguru
```

### 3. Preparar Ícone com Fundo (para iOS)

Como o ícone do canguru tem fundo transparente, você precisa adicionar um fundo branco:

#### Usando Ferramenta Online:
1. Acesse: [https://www.remove.bg/](https://www.remove.bg/) ou editor de imagem
2. Adicione um fundo branco à imagem do canguru
3. Salve como `icon.png` (1024x1024px)
4. Substitua `assets/icon.png`

#### Usando PowerPoint/Keynote:
1. Crie slide com 1024x1024px
2. Adicione fundo branco
3. Insira imagem do canguru centralizada
4. Exporte como PNG em alta qualidade
5. Salve como `assets/icon.png`

### 4. Configurar Adaptive Icon (Android)

Para Android, você pode manter o canguru com fundo transparente:

1. Copie `assets/images/Canguru.png` para `assets/adaptive-icon.png`
2. O fundo branco será adicionado automaticamente pelo Android

### 5. Atualizar app.json

O arquivo `app.json` já está configurado corretamente:

```json
{
  "expo": {
    "name": "Pocket",
    "icon": "./assets/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```

### 6. Gerar Todos os Tamanhos Automaticamente

O Expo gera automaticamente todos os tamanhos quando você faz build:

```bash
# Para Android
npx expo run:android

# Para iOS
npx expo run:ios
```

### 7. Testar o Ícone

#### No Expo Go (Limitado)
O Expo Go não mostra o ícone personalizado. Você verá o ícone padrão do Expo.

#### Em Build de Desenvolvimento
```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

Agora você verá o ícone do canguru no seu dispositivo!

## Estrutura Final de Arquivos

```
assets/
├── icon.png                  # 1024x1024px - Canguru COM fundo branco (iOS)
├── adaptive-icon.png         # 1024x1024px - Canguru (Android foreground)
├── splash.png               # Tela de splash (já configurada)
└── images/
    ├── Canguru.png          # Imagem original
    └── Pocket.png           # Logo para splash screen
```

## Solução de Problemas

### Ícone não aparece no Expo Go
**Solução:** Normal. O Expo Go sempre mostra o ícone padrão. Use build de desenvolvimento.

### Ícone aparece cortado no iOS
**Solução:** iOS adiciona máscara arredondada. Deixe margem de 10-15% nas bordas da imagem.

### Ícone tem fundo preto no iOS
**Solução:** iOS não aceita transparência. Adicione fundo branco à imagem.

### Ícone aparece borrado
**Solução:** Certifique-se que a imagem é exatamente 1024x1024px em alta resolução.

## Ferramentas Úteis

- [AppIcon.co](https://www.appicon.co/) - Gera todos os tamanhos de ícone
- [Remove.bg](https://www.remove.bg/) - Remove/adiciona fundos
- [Figma](https://www.figma.com/) - Editor profissional gratuito
- [Photopea](https://www.photopea.com/) - Photoshop online gratuito

## Próximos Passos

Após configurar o ícone, consulte:
- `03-testflight-deployment.md` - Distribuir o app via TestFlight
