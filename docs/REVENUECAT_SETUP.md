# Guia de Configuração do RevenueCat

Este guia explica como configurar produtos e assinaturas no RevenueCat + App Store Connect.

## Problema Atual

```
ERROR [RevenueCat] Error fetching offerings
- Não há produtos da App Store registrados no dashboard do RevenueCat
- Offering 'default' não tem packages configurados
```

## Solução: Configuração Passo-a-Passo

### Passo 1: Criar Produtos no App Store Connect

1. Acesse [App Store Connect](https://appstoreconnect.apple.com/)
2. Navegue até seu app **Pocket** (`com.gladius.pocket`)
3. Vá em **Features** → **In-App Purchases**
4. Crie os seguintes produtos de assinatura:

#### Produto 1: Assinatura Mensal
- **Type**: Auto-Renewable Subscription
- **Reference Name**: `Pocket Premium Monthly`
- **Product ID**: `com.gladius.pocket.monthly` (ou similar)
- **Subscription Group**: `Pocket Premium`
- **Subscription Duration**: 1 Month
- **Price**: Escolha o tier de preço desejado (ex: R$ 9,90/mês)

#### Produto 2: Assinatura Anual
- **Type**: Auto-Renewable Subscription
- **Reference Name**: `Pocket Premium Yearly`
- **Product ID**: `com.gladius.pocket.yearly` (ou similar)
- **Subscription Group**: `Pocket Premium`
- **Subscription Duration**: 1 Year
- **Price**: Escolha o tier de preço desejado (ex: R$ 99,90/ano)

#### Produto 3 (Opcional): Trial de 7 Dias
- Configure um **Introductory Offer** no produto mensal ou anual
- **Offer Type**: Free Trial
- **Duration**: 7 days

5. **Importante**: Anote os **Product IDs** que você criou!

### Passo 2: Configurar Produtos no RevenueCat Dashboard

1. Acesse [RevenueCat Dashboard](https://app.revenuecat.com/)
2. Selecione seu projeto **Pocket**
3. Vá em **Product Catalog** → **Products**
4. Clique em **+ New**
5. Para cada produto criado no App Store Connect:
   - **App**: iOS
   - **Store**: App Store
   - **Product ID**: Use o mesmo ID do App Store Connect (ex: `com.gladius.pocket.monthly`)
   - Clique em **Add**

### Passo 3: Criar Entitlements

1. No RevenueCat, vá em **Product Catalog** → **Entitlements**
2. Você já tem o entitlement `Pocket` configurado
3. Verifique se ele está ativo

### Passo 4: Criar Packages

1. No RevenueCat, vá em **Product Catalog** → **Offerings**
2. Selecione a offering `default` (ou crie uma nova)
3. Clique em **+ Add Package**
4. Configure os packages:

#### Package 1: Mensal
- **Package Identifier**: `$rc_monthly` (use identificadores padrão do RC)
- **Product**: Selecione `com.gladius.pocket.monthly`
- **Attached Entitlements**: Selecione `Pocket`

#### Package 2: Anual
- **Package Identifier**: `$rc_annual` (use identificadores padrão do RC)
- **Product**: Selecione `com.gladius.pocket.yearly`
- **Attached Entitlements**: Selecione `Pocket`

### Passo 5: Verificar Configuração

1. No dashboard do RevenueCat, vá em **Product Catalog** → **Offerings**
2. Certifique-se de que:
   - A offering `default` existe
   - A offering `default` está marcada como **Current**
   - A offering `default` tem pelo menos 1 package configurado
   - Cada package está associado a um produto válido
   - Cada package está associado ao entitlement `Pocket`

### Passo 6: Testar no App

Após configurar tudo:

1. Reinicie o app (force quit)
2. Navegue até a tela de assinatura
3. Clique em "Ver Planos de Assinatura"
4. Os planos devem aparecer corretamente

### Troubleshooting

#### Erro: "Offerings empty"
- Verifique se a offering `default` está marcada como **Current**
- Verifique se há packages na offering
- Aguarde alguns minutos (cache do RevenueCat)

#### Erro: "Product not found"
- Verifique se os Product IDs estão EXATAMENTE iguais no App Store Connect e RevenueCat
- Verifique se os produtos estão aprovados no App Store Connect (podem estar em "Waiting for Review")

#### Produtos não aparecem em Sandbox
- Certifique-se de estar usando uma conta de Sandbox do App Store
- Os produtos precisam estar "Ready to Submit" no App Store Connect

### Informações Importantes

- **Bundle ID**: `com.gladius.pocket`
- **Entitlement ID**: `Pocket`
- **Default Offering ID**: `default`

### Estrutura Recomendada

```
App Store Connect:
├── com.gladius.pocket.monthly (Subscription)
└── com.gladius.pocket.yearly (Subscription)

RevenueCat:
├── Entitlement: "Pocket"
└── Offering: "default" (Current)
    ├── Package: "$rc_monthly" → com.gladius.pocket.monthly
    └── Package: "$rc_annual" → com.gladius.pocket.yearly
```

### Próximos Passos

Depois de configurar tudo, você pode adicionar mais ofertas:
- Trials gratuitos
- Preços introdutórios
- Múltiplas offerings (ex: "onboarding", "settings")
- Promotional offers

### Links Úteis

- [RevenueCat Dashboard](https://app.revenuecat.com/projects/c98cd864/product-catalog/offerings)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [RevenueCat Docs - Configuring Products](https://www.revenuecat.com/docs/entitlements)
- [RevenueCat Docs - Offerings](https://www.revenuecat.com/docs/entitlements#offerings)
