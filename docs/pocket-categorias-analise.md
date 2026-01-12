# Análise do Sistema de Categorização do Pocket

## Diagnóstico Completo e Plano de Melhoria

---

## 1. RESUMO EXECUTIVO

### Problemas Identificados

1. **Alimentação classificada como Fixo (Essencial)**: O sistema atual classifica toda alimentação como "essencial", mas na prática do usuário, alimentação fora de casa (delivery, restaurantes) deveria ser "variável"

2. **Agrupamento excessivo de PIX**: Múltiplos PIX para pessoas diferentes são somados e apresentados como uma única entrada, perdendo granularidade e rastreabilidade

3. **Falta de distinção entre supermercado e delivery/restaurante**: A categoria "alimentação" mistura gastos essenciais (supermercado) com não essenciais (iFood, restaurantes)

---

## 2. ANÁLISE DETALHADA DO SISTEMA ATUAL

### 2.1 Estrutura de Categorias Atual

```
ESSENCIAIS (type: 'essencial') → Custos Fixos
├── moradia
├── alimentacao ← PROBLEMA: inclui supermercado E restaurantes
├── transporte
├── saude
└── educacao

NÃO ESSENCIAIS (type: 'nao_essencial') → Custos Variáveis
├── lazer
├── vestuario
├── beleza
├── eletronicos
└── delivery ← Existe, mas alimentação ainda cai em "essencial"

INVESTIMENTOS (type: 'investimento')
├── poupanca
├── previdencia
└── investimentos

DÍVIDAS (type: 'divida')
├── cartao_credito
├── emprestimos
└── financiamentos

TRANSFERÊNCIAS (type: 'transferencia')
└── transferencias

OUTROS (type: 'outro')
└── outros
```

### 2.2 Onde Está o Problema da Alimentação

No arquivo `lib/categories.ts`, a categoria `alimentacao` está definida como:

```typescript
alimentacao: {
  name: 'Alimentação',
  type: 'essencial',  // ← AQUI ESTÁ O PROBLEMA
  description: 'Supermercado, feira, açougue',
  subcategories: [
    { name: 'Supermercado', keywords: [...] },
    { name: 'Atacadão', keywords: [...] },
    { name: 'Feira', keywords: [...] },
    { name: 'Açougue', keywords: [...] },
    { name: 'Padaria', keywords: [...] },
    { name: 'Mercearia', keywords: [...] },
  ]
}
```

E a categoria `delivery` está como:

```typescript
delivery: {
  name: 'Delivery',
  type: 'nao_essencial',  // ← Está correto
  description: 'Restaurantes, iFood, Rappi',
  subcategories: [
    { name: 'Apps de Entrega', keywords: [...] },
    { name: 'Restaurantes', keywords: [...] },
    { name: 'Fast Food', keywords: [...] },
    // ...
  ]
}
```

**Conclusão**: O sistema tem a estrutura correta (delivery separado como não essencial), mas a categorização por keywords pode estar falhando em alguns casos, fazendo restaurantes/delivery cair em "alimentacao" ao invés de "delivery".

### 2.3 Problema do Agrupamento de PIX

No arquivo `app/custos-fixos.tsx` (e provavelmente custos-variaveis.tsx), o agrupamento é feito por `categoria + subcategoria`:

```typescript
const key = `${item.source}-${category}-${subcategory}`;

if (subcategoryMap.has(key)) {
  const existing = subcategoryMap.get(key)!;
  existing.total += amount;
  existing.count = (existing.count || 1) + 1;
}
```

**Problema**: Todos os PIX para pessoas físicas vão para `transferencias` → `PIX Pessoa Fisica`, resultando em:

- PIX para João: R$ 100
- PIX para Maria: R$ 50
- PIX para Pedro: R$ 200

**Resultado exibido**: `PIX Pessoa Física (3x) - R$ 350`

O usuário perde completamente a visibilidade de para QUEM foi cada PIX.

---

## 3. PLANO DE IMPLEMENTAÇÃO

### FASE 1: Correção da Categorização de Alimentação (Prioridade Alta)

#### 3.1.1 Separar "Alimentação Casa" de "Alimentação Fora"

**Opção A - Abordagem Simples (Recomendada)**: Renomear e reorganizar

```typescript
// ANTES
alimentacao: { type: 'essencial', ... }
delivery: { type: 'nao_essencial', ... }

// DEPOIS
alimentacao_casa: {
  name: 'Alimentação (Casa)',
  type: 'essencial',
  description: 'Supermercado, feira, açougue - compras para casa',
  subcategories: [
    { name: 'Supermercado', keywords: [...] },
    { name: 'Atacadão', keywords: [...] },
    { name: 'Feira', keywords: [...] },
    { name: 'Açougue', keywords: [...] },
    { name: 'Mercearia', keywords: [...] },
  ]
}

alimentacao_fora: {
  name: 'Alimentação (Fora)',
  type: 'nao_essencial',
  description: 'Restaurantes, delivery, lanches, padaria para consumo imediato',
  subcategories: [
    { name: 'Apps de Entrega', keywords: ['ifood', 'rappi', 'uber eats', 'zé delivery', 'delivery'] },
    { name: 'Restaurantes', keywords: ['restaurante', 'churrascaria', 'pizzaria', ...] },
    { name: 'Fast Food', keywords: ['mcdonalds', 'burger king', 'subway', ...] },
    { name: 'Lanches', keywords: ['lanchonete', 'lanche', 'hot dog', 'açaí', ...] },
    { name: 'Padaria/Café', keywords: ['padaria', 'café', 'cafeteria', 'starbucks', ...] },
    { name: 'Bares', keywords: ['bar', 'boteco', 'pub', 'cervejaria', ...] },
  ]
}
```

**Opção B - Abordagem Avançada**: Manter categoria única com tipo dinâmico baseado na subcategoria

```typescript
alimentacao: {
  name: 'Alimentação',
  type: 'mixed', // Novo tipo
  subcategories: [
    { name: 'Supermercado', keywords: [...], isEssential: true },
    { name: 'Restaurante', keywords: [...], isEssential: false },
    // ...
  ]
}
```

**Recomendação**: Opção A é mais simples e mantém consistência com o modelo mental de "fixos vs variáveis".

#### 3.1.2 Arquivos a Modificar

| Arquivo                                               | Modificação                                |
| ----------------------------------------------------- | ------------------------------------------ |
| `lib/categories.ts`                                   | Adicionar nova categoria, ajustar keywords |
| `supabase/functions/_shared/categorize-with-walts.ts` | Atualizar prompt da IA                     |
| `supabase/functions/_shared/categorize.ts`            | Atualizar keywords                         |
| `types/database.ts`                                   | Adicionar novos tipos de categoria         |
| Componentes de ícone                                  | Adicionar ícone para `alimentacao_fora`    |

#### 3.1.3 Migration de Dados

```sql
-- Migration: Recategorizar gastos existentes
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Apps de Entrega'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%ifood%'
    OR LOWER(establishment_name) LIKE '%rappi%'
    OR LOWER(establishment_name) LIKE '%uber eats%'
  );

UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Restaurantes'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%restaurante%'
    OR LOWER(establishment_name) LIKE '%churrascaria%'
    OR LOWER(establishment_name) LIKE '%pizzaria%'
  );

-- Renomear categoria original
UPDATE expenses
SET category = 'alimentacao_casa'
WHERE category = 'alimentacao';
```

---

### FASE 2: Granularidade em Transferências PIX (Prioridade Média-Alta)

#### 3.2.1 Problema

O sistema atual agrupa todos os PIX para pessoa física em uma única linha:

```
PIX Pessoa Física (5x) - R$ 1.500,00
```

O usuário não consegue ver:

- Para quem foi cada PIX
- Qual o valor individual
- Qual o propósito de cada transferência

#### 3.2.2 Solução Proposta: Preservar Granularidade

**Mudança 1**: Usar o nome do destinatário como identificador único

```typescript
// Em custos-fixos.tsx e custos-variaveis.tsx
// ANTES
const key = `${item.source}-${category}-${subcategory}`;

// DEPOIS
// Para transferências, usar o nome do destinatário como parte da chave
const key =
  category === 'transferencias'
    ? `${item.source}-${category}-${item.establishment_name}`
    : `${item.source}-${category}-${subcategory}`;
```

**Mudança 2**: Adicionar subcategoria com nome do destinatário

Na categorização (quando vem do Open Finance):

```typescript
// Em pluggy-sync-transactions/index.ts
if (isPessoaFisica(receiverName)) {
  return {
    category: 'transferencias',
    subcategory: receiverName, // Usar o nome como subcategoria
  };
}
```

**Mudança 3**: UI para transferências

Na tela de custos variáveis, mostrar cada transferência individualmente:

```
Transferências
├── Maria Silva - R$ 150,00 (PIX)
├── João Santos - R$ 300,00 (PIX)
├── Pedro Lima - R$ 200,00 (PIX)
└── Total: R$ 650,00
```

#### 3.2.3 Arquivos a Modificar

| Arquivo                                                | Modificação                                        |
| ------------------------------------------------------ | -------------------------------------------------- |
| `app/custos-fixos.tsx`                                 | Lógica de agrupamento especial para transferências |
| `app/custos-variaveis.tsx`                             | Idem                                               |
| `lib/categories.ts`                                    | Ajustar subcategorias de transferências            |
| `supabase/functions/pluggy-sync-transactions/index.ts` | Guardar nome do destinatário                       |

---

### FASE 3: Melhorias na IA de Categorização (Prioridade Média)

#### 3.3.1 Atualizar Prompt do Walts

```typescript
const WALTS_CATEGORIZATION_SYSTEM_PROMPT = `
Você é Walts, assistente financeiro do app Pocket.
Sua tarefa é categorizar gastos com MÁXIMA PRECISÃO.

# CATEGORIAS DISPONÍVEIS:

## ESSENCIAIS (Custos Fixos):
- moradia: Aluguel, condomínio, energia, água, gás, internet, telefone
- alimentacao_casa: Supermercado, feira, açougue, mercearia (compras para casa)
- transporte: Combustível, transporte público, manutenção veículo
- saude: Farmácia, plano de saúde, consultas, exames
- educacao: Escola, faculdade, cursos, material escolar

## NÃO ESSENCIAIS (Custos Variáveis):
- alimentacao_fora: Restaurantes, delivery, lanches, padaria (consumo imediato)
- lazer: Streaming, cinema, viagens, academia
- vestuario: Roupas, calçados, acessórios
- beleza: Salão, barbearia, cosméticos
- eletronicos: Gadgets, computadores, games

## REGRAS IMPORTANTES:
1. Supermercado/feira/açougue → alimentacao_casa (ESSENCIAL)
2. Restaurante/iFood/lanchonete → alimentacao_fora (NÃO ESSENCIAL)
3. Padaria com valor baixo (<R$30) → alimentacao_fora (lanche)
4. Padaria com valor alto (>R$50) → alimentacao_casa (compras)
5. PIX para pessoa física → transferencias
`;
```

#### 3.3.2 Adicionar Contexto de Valor

O valor do gasto pode ajudar a disambiguar:

- Padaria R$ 15 → Provavelmente lanche (variável)
- Padaria R$ 80 → Provavelmente compras (fixo)
- Mercado R$ 500 → Compras do mês (fixo)
- Mercado R$ 25 → Provavelmente lanche/bebida (variável)

---

## 4. NOVA ESTRUTURA DE CATEGORIAS PROPOSTA

```
ESSENCIAIS (Custos Fixos)
├── moradia
│   ├── Energia
│   ├── Água
│   ├── Gás
│   ├── Aluguel
│   ├── Condomínio
│   ├── IPTU
│   ├── Internet
│   └── Telefone
├── alimentacao_casa      ← NOVA
│   ├── Supermercado
│   ├── Atacadão
│   ├── Feira
│   ├── Açougue
│   └── Mercearia
├── transporte
│   ├── Combustível
│   ├── Transporte Público
│   ├── Estacionamento
│   └── Manutenção
├── saude
│   ├── Farmácia
│   ├── Plano de Saúde
│   ├── Consulta
│   ├── Exames
│   └── Dentista
└── educacao
    ├── Escola
    ├── Faculdade
    ├── Curso
    └── Material Escolar

NÃO ESSENCIAIS (Custos Variáveis)
├── alimentacao_fora      ← NOVA (absorve parte de 'alimentacao' e 'delivery')
│   ├── Apps de Entrega (iFood, Rappi, etc)
│   ├── Restaurantes
│   ├── Fast Food
│   ├── Lanches
│   ├── Padaria/Café
│   └── Bares
├── lazer
│   ├── Streaming
│   ├── Cinema
│   ├── Shows
│   ├── Viagem
│   └── Academia
├── vestuario
├── beleza
├── eletronicos
└── pets                   ← NOVA (baseada no PDF de referência)
    ├── Alimentação Pet
    ├── Pet Shop
    └── Veterinário

TRANSFERÊNCIAS
└── transferencias
    └── [Nome do Destinatário] ← Agora preserva granularidade

INVESTIMENTOS
├── poupanca
├── previdencia
└── investimentos

DÍVIDAS
├── cartao_credito
├── emprestimos
└── financiamentos

OUTROS
└── outros
```

---

## 5. CRONOGRAMA DE IMPLEMENTAÇÃO

| Fase      | Tarefa                             | Complexidade | Tempo Estimado |
| --------- | ---------------------------------- | ------------ | -------------- |
| 1.1       | Criar categoria `alimentacao_casa` | Baixa        | 2h             |
| 1.2       | Criar categoria `alimentacao_fora` | Baixa        | 2h             |
| 1.3       | Migrar dados existentes            | Média        | 3h             |
| 1.4       | Atualizar prompt do Walts          | Baixa        | 1h             |
| 1.5       | Testar categorização               | Média        | 2h             |
| 2.1       | Ajustar agrupamento de PIX         | Média        | 3h             |
| 2.2       | Preservar nome do destinatário     | Média        | 2h             |
| 2.3       | Ajustar UI de transferências       | Média        | 3h             |
| 3.1       | Adicionar categoria Pets           | Baixa        | 1h             |
| 3.2       | Refinar keywords                   | Baixa        | 2h             |
| **Total** |                                    |              | **~21h**       |

---

## 6. ARQUIVOS A MODIFICAR (CHECKLIST)

### Backend/Supabase

- [ ] `supabase/functions/_shared/categorize-with-walts.ts`
- [ ] `supabase/functions/_shared/categorize.ts`
- [ ] `supabase/functions/recategorize-expenses/index.ts`
- [ ] `supabase/functions/pluggy-sync-transactions/index.ts`
- [ ] Nova migration SQL para recategorização

### Frontend/App

- [ ] `lib/categories.ts` (principal)
- [ ] `lib/categorize-with-walts.ts`
- [ ] `types/database.ts`
- [ ] `app/custos-fixos.tsx`
- [ ] `app/custos-variaveis.tsx`
- [ ] `app/(tabs)/home.tsx` (se necessário)
- [ ] `components/CategoryIcon.tsx` (novos ícones)

---

## 7. TESTES RECOMENDADOS

### Cenários de Teste para Alimentação

| Estabelecimento     | Valor  | Categoria Esperada |
| ------------------- | ------ | ------------------ |
| "Carrefour"         | R$ 450 | alimentacao_casa   |
| "iFood"             | R$ 35  | alimentacao_fora   |
| "Restaurante Sabor" | R$ 80  | alimentacao_fora   |
| "Padaria Central"   | R$ 15  | alimentacao_fora   |
| "Padaria Central"   | R$ 120 | alimentacao_casa   |
| "Açougue São João"  | R$ 200 | alimentacao_casa   |
| "Burger King"       | R$ 45  | alimentacao_fora   |

### Cenários de Teste para PIX

| Descrição               | Categoria Esperada | Subcategoria |
| ----------------------- | ------------------ | ------------ |
| "PIX para Maria Silva"  | transferencias     | Maria Silva  |
| "PIX para João Santos"  | transferencias     | João Santos  |
| "PIX - Padaria Central" | alimentacao_fora   | Padaria/Café |
| "PIX - Carrefour"       | alimentacao_casa   | Supermercado |

---

## 8. CONCLUSÃO

As mudanças propostas resolvem os dois problemas principais:

1. **Alimentação**: Separar em `alimentacao_casa` (essencial/fixo) e `alimentacao_fora` (variável) reflete melhor a realidade financeira do usuário

2. **PIX**: Preservar o nome do destinatário como subcategoria mantém a granularidade necessária para controle financeiro efetivo

A implementação pode ser feita de forma incremental, começando pela Fase 1 que tem maior impacto na experiência do usuário.

---

_Documento gerado em: 12/01/2026_
_Análise baseada no código-fonte do Pocket App_
