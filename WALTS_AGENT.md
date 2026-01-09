# 🤖 Walts Agent - Assistente Financeiro Inteligente

O Walts Agent é um agente de IA completo que não apenas **responde** perguntas, mas **executa ações** para gerenciar as finanças do usuário.

## 🎯 O que o Walts Agent faz

Diferente do chat normal (read-only), o Walts Agent pode:

1. **Criar comprovantes manualmente** quando o usuário pedir
2. **Sincronizar transações do Open Finance** automaticamente
3. **Categorizar gastos** com inteligência artificial
4. **Executar múltiplas ações** em sequência

## 🚀 Como funciona

### Arquitetura

```
Usuário → Chat → walts-agent (Edge Function) → DeepSeek + Tools → Ações → Resposta
```

O Walts Agent usa **function calling** do DeepSeek para:
1. Entender a intenção do usuário
2. Decidir quais ferramentas usar
3. Executar as ações necessárias
4. Retornar o resultado ao usuário

### Ferramentas Disponíveis

#### 1. `create_expense_from_description`
Cria um comprovante na Home do usuário com **comprovante PDF gerado automaticamente**.

**Exemplo de uso:**
```
Usuário: "Walts, registra um gasto de R$ 50 no Subway"
Walts: [Executa create_expense_from_description]
Walts: "✅ Comprovante criado: Subway - R$ 50,00 (com comprovante PDF)"
```

**✨ Novidade:** Agora o Walts gera automaticamente um PDF bonito e profissional do comprovante, que fica disponível em "Detalhes" do comprovante, assim como acontece quando você bate uma foto!

#### 2. `sync_open_finance_transactions`
Busca transações do Open Finance e cria comprovantes automaticamente.

**Exemplo de uso:**
```
Usuário: "Pega meus gastos do Nubank dos últimos 7 dias"
Walts: [Executa sync_open_finance_transactions]
Walts: "✅ Sincronizadas 8 transações dos últimos 7 dias!"
```

#### 3. `create_budget` ✨ NOVO - Fase 2
Cria um novo orçamento para uma categoria específica.

**Exemplo de uso:**
```
Usuário: "Walts, cria um orçamento de R$ 500 para alimentação"
Walts: [Executa create_budget]
Walts: "✅ Orçamento mensal criado para alimentacao: R$ 500,00"
```

#### 4. `update_budget` ✨ NOVO - Fase 2
Atualiza um orçamento existente (valor, período ou notificações).

**Exemplo de uso:**
```
Usuário: "Aumenta o orçamento de transporte para R$ 300"
Walts: [Executa update_budget]
Walts: "✅ Orçamento de transporte atualizado (valor: R$ 300,00)"
```

#### 5. `check_budget_status` ✨ NOVO - Fase 2
Verifica o status de todos os orçamentos ou de uma categoria específica.

**Exemplo de uso:**

```text
Usuário: "Como estão meus orçamentos?"
Walts: [Executa check_budget_status]
Walts: "📊 Status dos Orçamentos:

🟢 alimentacao (mensal): R$ 234,50 / R$ 500,00 (46.9% usado) - Restam R$ 265,50
🟡 transporte (mensal): R$ 240,00 / R$ 300,00 (80.0% usado) - Restam R$ 60,00"
```

#### 6. `get_bank_statement` ✨ NOVO - Fase 2
Busca o extrato bancário das contas conectadas via Open Finance.

**Exemplo de uso:**

```text
Usuário: "Me mostra o extrato dos últimos 30 dias"
Walts: [Executa get_bank_statement]
Walts: "💳 Extrato Bancário - último mês

📊 RESUMO GERAL:
• 45 transações
• Saídas: R$ 2.345,67
• Entradas: R$ 3.500,00
• Saldo: +R$ 1.154,33

🏦 POR CONTA:
• Nubank: 28 transações
  Saídas: R$ 1.456,30 | Entradas: R$ 3.500,00
• Inter: 17 transações
  Saídas: R$ 889,37 | Entradas: R$ 0,00

📝 ÚLTIMAS TRANSAÇÕES:
🔴 2026-01-08 | Nubank
   UBER *TRIP: -R$ 25,50
🟢 2026-01-05 | Nubank
   SALARIO EMPRESA XYZ: +R$ 3.500,00
..."
```

#### 7. `analyze_spending_pattern` ✨ NOVO - Fase 3
Analisa padrões de gastos e detecta anomalias.

**Exemplo de uso:**

```text
Usuário: "Analisa meus gastos dos últimos 3 meses"
Walts: [Executa analyze_spending_pattern]
Walts: "📈 Análise de Padrões de Gastos (3 meses)

🚨 alimentacao:
  • Média mensal: R$ 450,00
  • Mês atual: R$ 720,00
  • Variação: +60,0%
  ⚠️ ATENÇÃO: Gasto 60% acima da média!

📈 transporte:
  • Média mensal: R$ 300,00
  • Mês atual: R$ 380,00
  • Variação: +26,7%

💡 Você tem 1 categoria(s) com gastos anormalmente altos este mês."
```

#### 8. `suggest_savings` ✨ NOVO - Fase 3
Sugere onde economizar com base em análise de gastos.

**Exemplo de uso:**

```text
Usuário: "Onde posso economizar R$ 500?"
Walts: [Executa suggest_savings]
Walts: "💰 Sugestões de Economia

🎯 Meta: Economizar R$ 500,00
💡 Economia potencial: R$ 620,00

✅ É possível atingir sua meta!

📋 TOP 3 SUGESTÕES:

1. 🔴 alimentacao
   Você ultrapassou o orçamento de alimentacao em R$ 220,00.

2. 🟡 lazer
   lazer é uma categoria não-essencial. Reduza 30% (R$ 180,00).

3. 🟡 transporte
   Você está gastando R$ 80,00 a mais em transporte comparado à sua média.

💡 Total de economia potencial: R$ 620,00/mês"
```

#### 9. `forecast_month_end` ✨ NOVO - Fase 3
Prevê como será o fim do mês com base nos gastos atuais.

**Exemplo de uso:**

```text
Usuário: "Vou passar do orçamento esse mês?"
Walts: [Executa forecast_month_end]
Walts: "🟡 Projeção para Fim do Mês

📅 SITUAÇÃO ATUAL:
• Dia 9 de 31 (29% do mês)
• Gasto até agora: R$ 856,40
• Renda mensal: R$ 3.500,00
• Taxa diária: R$ 95,16/dia

🔮 PROJEÇÃO:
• Gasto projetado (fim do mês): R$ 2.949,89
• Saldo projetado: R$ 550,11 (15.7%)

💡 Fique atento aos gastos para não comprometer o saldo.

⚠️ ORÇAMENTOS EM RISCO:
• alimentacao: projetado R$ 620,00 (limite: R$ 500,00)

💡 RECOMENDAÇÕES:
• Meta diária máxima: R$ 120,16
• Reduza gastos não-essenciais (lazer, vestuário)"
```

#### 10. `save_user_preference` ✨ NOVO - Fase 4
Salva preferências e contextos do usuário para personalização futura.

**Exemplo de uso:**

```text
Usuário: "Walts, eu prefiro gastar mais em lazer do que em vestuário"
Walts: [Executa save_user_preference]
Walts: "✅ Preferência salva: spending_priority

Entendido! Vou lembrar que você prioriza gastos com lazer. Vou usar isso nas minhas análises e sugestões futuras."

---

Usuário: "Minha meta é economizar R$ 1.000 por mês"
Walts: [Executa save_user_preference]
Walts: "✅ Preferência salva: savings_goal

Perfeito! Vou acompanhar sua meta de economizar R$ 1.000 por mês e te ajudar a atingi-la."
```

#### 11. `get_user_context` ✨ NOVO - Fase 4
Busca preferências e contextos salvos do usuário para personalizar respostas.

**Exemplo de uso:**

```text
Usuário: "Me dá dicas de economia"
Walts: [Executa get_user_context primeiro]
Walts: [Depois executa suggest_savings usando o contexto]
Walts: "💰 Sugestões Personalizadas de Economia

🧠 Baseado no que eu aprendi sobre você:
• Você prioriza gastos com lazer
• Sua meta é economizar R$ 1.000/mês
• Você prefere pagar contas no dia 5

📋 SUGESTÕES:
1. 🟡 vestuario: R$ 280,00
   Como você prioriza lazer sobre vestuário, sugiro reduzir 40% aqui.

2. 🟡 transporte: R$ 120,00
   Tente usar mais transporte público nos próximos dias.

💡 Com essas mudanças, você pode economizar R$ 400 este mês, chegando mais perto da sua meta de R$ 1.000!"
```

## 📁 Estrutura de Arquivos

```
pocket/
├── supabase/functions/walts-agent/
│   └── index.ts                 # Edge Function principal
├── lib/
│   ├── walts-agent.ts           # Cliente para chamar o agente
│   └── deepseek.ts              # Chat normal (sem function calling)
└── app/(tabs)/chat.tsx          # Interface do chat
```

## 🔧 Configuração

### 1. Variáveis de Ambiente

Certifique-se de ter no `.env`:
```bash
DEEPSEEK_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJ...
```

### 2. Deploy da Edge Function

```bash
supabase functions deploy walts-agent
```

### 3. Ativar no Chat

O modo agente está **ativado por padrão** no chat. Para desativar:
```typescript
setUseAgent(false); // Volta para chat read-only
```

## 💡 Exemplos de Uso

### Criar gastos manualmente
```
🧑 "Walts, cria um gasto de R$ 35 no iFood de hoje"
🤖 "✅ Comprovante criado: iFood - R$ 35,00"

🧑 "Registra R$ 120 de gasolina no Posto Shell"
🤖 "✅ Comprovante criado: Posto Shell - R$ 120,00"
```

### Sincronizar Open Finance
```
🧑 "Pega meus gastos do Inter dos últimos 15 dias"
🤖 "✅ Sincronizadas 12 transações dos últimos 15 dias!"

🧑 "Busca todas as transações bancárias da última semana"
🤖 "✅ Sincronizadas 8 transações de 2 contas bancárias!"
```

### Conversas complexas
```
🧑 "Walts, registra um almoço de R$ 45 no Outback e depois me diz quanto gastei em alimentação este mês"
🤖 [Cria o comprovante e analisa gastos]
🤖 "✅ Comprovante criado: Outback - R$ 45,00

     Você gastou R$ 856,40 em alimentação este mês, representando 28% do seu orçamento."
```

## 🔄 Fluxo de Execução

1. **Usuário envia mensagem** no chat
2. **Chat detecta** se está em modo agente
3. **walts-agent** recebe as mensagens
4. **DeepSeek analisa** e decide quais tools usar
5. **Tools são executados** (create_expense, sync_transactions, etc.)
6. **Walts responde** confirmando as ações

## 🛠️ Próximas Ferramentas (Roadmap)

### ✅ Fase 2 - Orçamentos (COMPLETA)
- ✅ `create_budget` - Criar orçamento para categoria
- ✅ `update_budget` - Atualizar orçamento existente
- ✅ `check_budget_status` - Verificar status dos orçamentos
- ✅ `get_bank_statement` - Consultar extrato bancário do Open Finance

### ✅ Fase 3 - Análises Preditivas (COMPLETA)
- ✅ `analyze_spending_pattern` - Detectar padrões anormais e tendências
- ✅ `suggest_savings` - Sugerir onde economizar com base em análise
- ✅ `forecast_month_end` - Prever fim do mês e projetar saldo

### ✅ Fase 4 - Memória (COMPLETA)
- ✅ `save_user_preference` - Salvar preferências e contextos do usuário
- ✅ `get_user_context` - Buscar contexto histórico para personalização
- ✅ Sistema de aprendizado contínuo com rastreamento de uso

## 🐛 Debugging

### Ver logs da Edge Function
```bash
supabase functions logs walts-agent --tail
```

### Testar localmente
```bash
supabase functions serve walts-agent
```

### Verificar no chat
Os logs aparecem no console do app:
```
[chat] Using Walts Agent mode
[walts-agent] Sending messages to agent...
[walts-agent] Tool calls executed: 1
```

## ⚠️ Limitações Atuais

1. **Sem confirmação visual** - O agente executa diretamente (TODO: adicionar confirmação)
2. **Sem categorização automática** - Por enquanto usa categoria "outros" (TODO: integrar com categorize-with-walts)
3. **Sem histórico de ações** - Não salva log de ferramentas executadas (TODO: criar tabela walts_actions)

## 🎨 Diferenças: Chat Normal vs Walts Agent

| Recurso | Chat Normal | Walts Agent |
|---------|-------------|-------------|
| Responder perguntas | ✅ | ✅ |
| Criar comprovantes | ❌ | ✅ |
| Sincronizar Open Finance | ❌ | ✅ |
| Criar orçamentos | ❌ | ✅ |
| Atualizar orçamentos | ❌ | ✅ |
| Consultar extrato bancário | ❌ | ✅ |
| Verificar status de orçamentos | ❌ | ✅ |
| Analisar padrões de gastos | ❌ | ✅ |
| Sugerir onde economizar | ❌ | ✅ |
| Prever fim do mês | ❌ | ✅ |
| Análises complexas | ✅ | ✅ |
| Memória de preferências | ❌ | ✅ |
| Personalização baseada em contexto | ❌ | ✅ |
| Aprendizado contínuo | ❌ | ✅ |

## 📖 Referências

- [DeepSeek Function Calling Docs](https://api-docs.deepseek.com/guides/function_calling)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [OpenAI Tool Use Pattern](https://platform.openai.com/docs/guides/function-calling)

---

**Status:** ✅ Fase 1 completa | ✅ Fase 2 completa | ✅ Fase 3 completa | ✅ Fase 4 completa
**Walts Agent está 100% funcional com todas as capacidades implementadas!** 🎉
