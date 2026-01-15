-- ============================================================================
-- Seed: 20 Casos de Teste para Eval do Agente Walts
-- Execute no SQL Editor do Supabase ou via: supabase db seed
-- ============================================================================

-- Limpar casos existentes (opcional - descomente se quiser resetar)
-- DELETE FROM agent_eval_cases;

INSERT INTO agent_eval_cases
(name, domain, description, setup, history_seed, user_message, expected_tools, forbidden_tools, expected_db_assertions, expected_response_contains, forbidden_response_contains, max_tool_calls, max_iterations)
VALUES

-- ============================================================================
-- EXPENSES (5 casos)
-- ============================================================================

-- 01) Criar gasto básico
(
  'create_expense_basic',
  'expenses',
  'Criar despesa simples com valor, categoria e data relativa',
  '{}'::jsonb,
  '[]'::jsonb,
  'Registra um gasto de R$ 32,90 no iFood ontem em Alimentação.',
  '[{"name":"create_expense","min":1,"max":1}]'::jsonb,
  '[{"name":"update_expense","min":0,"max":0},{"name":"delete_expense","min":0,"max":0}]'::jsonb,
  '[{"type":"row_count_delta","table":"expenses","delta":1}]'::jsonb,
  '["32","alimenta"]'::jsonb,
  '["não consigo","erro"]'::jsonb,
  5, 6
),

-- 02) Criar gasto sem categoria explícita (deve inferir)
(
  'create_expense_infer_category',
  'expenses',
  'Criar despesa inferindo categoria pelo estabelecimento',
  '{}'::jsonb,
  '[]'::jsonb,
  'Gastei 89 reais no Uber hoje.',
  '[{"name":"create_expense","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[{"type":"row_count_delta","table":"expenses","delta":1}]'::jsonb,
  '["89","uber"]'::jsonb,
  '["qual categoria"]'::jsonb,
  5, 6
),

-- 03) Atualizar gasto existente
(
  'update_expense_correction',
  'expenses',
  'Corrigir valor de um gasto mencionado no histórico',
  '{}'::jsonb,
  '[{"role":"user","content":"Registra um gasto de R$ 20,00 em transporte hoje."},{"role":"assistant","content":"Registrei o gasto de R$ 20,00 em Transporte."}]'::jsonb,
  'Corrige: esse gasto foi R$ 22,50 e não 20.',
  '[{"name":"update_expense","min":1,"max":1}]'::jsonb,
  '[{"name":"create_expense","min":0,"max":0}]'::jsonb,
  '[]'::jsonb,
  '["22,50","atualiz"]'::jsonb,
  '["criei","novo gasto"]'::jsonb,
  6, 6
),

-- 04) Deletar gasto
(
  'delete_expense_request',
  'expenses',
  'Remover despesa por referência textual',
  '{}'::jsonb,
  '[{"role":"user","content":"Registra 18 reais de Uber ontem"},{"role":"assistant","content":"Registrado."}]'::jsonb,
  'Apaga esse gasto do Uber que registrei agora.',
  '[{"name":"delete_expense","min":1,"max":1}]'::jsonb,
  '[{"name":"create_expense","min":0,"max":0}]'::jsonb,
  '[]'::jsonb,
  '["apag","remov","exclu"]'::jsonb,
  '["não encontr"]'::jsonb,
  6, 6
),

-- 05) Buscar contexto financeiro de outro período
(
  'get_expenses_last_month',
  'expenses',
  'Buscar gastos do mês passado (não está no contexto inicial)',
  '{}'::jsonb,
  '[]'::jsonb,
  'Quanto gastei no mês passado?',
  '[{"name":"get_financial_context","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["mês passado","total","gast"]'::jsonb,
  '["não tenho acesso","não sei"]'::jsonb,
  5, 6
),

-- ============================================================================
-- BUDGETS (3 casos)
-- ============================================================================

-- 06) Criar orçamento
(
  'create_budget_food',
  'budgets',
  'Criar orçamento mensal para Alimentação',
  '{}'::jsonb,
  '[]'::jsonb,
  'Cria um orçamento de R$ 800 por mês para Alimentação.',
  '[{"name":"create_budget","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[{"type":"row_count_delta","table":"budgets","delta":1}]'::jsonb,
  '["800","alimenta","orçamento"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- 07) Checar status do orçamento
(
  'check_budget_status',
  'budgets',
  'Verificar quanto já gastou do orçamento',
  '{}'::jsonb,
  '[]'::jsonb,
  'Como está meu orçamento de Alimentação? Já estourei?',
  '[{"name":"check_budget_status","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["orçamento","alimenta"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- 08) Registrar gasto e checar orçamento
(
  'expense_then_budget_check',
  'budgets',
  'Fluxo composto: registrar gasto e verificar orçamento',
  '{}'::jsonb,
  '[]'::jsonb,
  'Registra R$ 150 em Alimentação e me diz como ficou meu orçamento.',
  '[{"name":"create_expense","min":1,"max":1},{"name":"check_budget_status","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["150","orçamento"]'::jsonb,
  '[]'::jsonb,
  7, 8
),

-- ============================================================================
-- OPEN FINANCE (3 casos)
-- ============================================================================

-- 09) Listar contas bancárias
(
  'list_bank_accounts',
  'open_finance',
  'Pedir contas conectadas via Open Finance',
  '{}'::jsonb,
  '[]'::jsonb,
  'Quais contas bancárias estão conectadas?',
  '[{"name":"get_bank_accounts","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["conta"]'::jsonb,
  '[]'::jsonb,
  4, 5
),

-- 10) Buscar transações do extrato
(
  'get_bank_transactions_week',
  'open_finance',
  'Buscar transações bancárias da última semana',
  '{}'::jsonb,
  '[]'::jsonb,
  'Me mostra as transações do meu banco da última semana.',
  '[{"name":"get_bank_transactions","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["transa"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- 11) Sincronizar contas
(
  'sync_bank_accounts',
  'open_finance',
  'Solicitar sincronização das contas bancárias',
  '{}'::jsonb,
  '[]'::jsonb,
  'Sincroniza minhas contas bancárias por favor.',
  '[{"name":"sync_bank_accounts","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["sincroniz"]'::jsonb,
  '[]'::jsonb,
  6, 8
),

-- ============================================================================
-- ANALYSIS (4 casos)
-- ============================================================================

-- 12) Gráficos e distribuição
(
  'get_charts_data',
  'analysis',
  'Buscar dados de gráficos por categoria',
  '{}'::jsonb,
  '[]'::jsonb,
  'Me mostra como estão meus gastos por categoria esse mês.',
  '[{"name":"get_charts_data","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["categor"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- 13) Raio-X financeiro
(
  'generate_raio_x',
  'analysis',
  'Gerar análise completa Raio-X',
  '{}'::jsonb,
  '[]'::jsonb,
  'Faz um raio-x das minhas finanças.',
  '[{"name":"generate_raio_x","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["raio"]'::jsonb,
  '[]'::jsonb,
  6, 8
),

-- 14) Comparar períodos
(
  'compare_periods',
  'analysis',
  'Comparar gastos entre meses',
  '{}'::jsonb,
  '[]'::jsonb,
  'Compara meus gastos de dezembro com janeiro.',
  '[{"name":"compare_periods","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["compar","dezembro","janeiro"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- 15) Previsão de fim de mês
(
  'forecast_month_end',
  'analysis',
  'Prever gastos até fim do mês',
  '{}'::jsonb,
  '[]'::jsonb,
  'Se eu continuar assim, quanto vou gastar até o fim do mês?',
  '[{"name":"forecast_month_end","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["previs","fim do mês"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- ============================================================================
-- CATEGORIZATION (2 casos)
-- ============================================================================

-- 16) Recategorizar transação do extrato (NÃO deve criar expense)
(
  'recategorize_not_create',
  'categorization',
  'Categorizar transação do extrato sem criar novo gasto',
  '{}'::jsonb,
  '[]'::jsonb,
  'Categoriza aquela saída de 50 reais do Nubank como Alimentação.',
  '[{"name":"recategorize_transaction","min":1,"max":1}]'::jsonb,
  '[{"name":"create_expense","min":0,"max":0}]'::jsonb,
  '[]'::jsonb,
  '["categoriz"]'::jsonb,
  '["registr","criei"]'::jsonb,
  6, 6
),

-- 17) Listar não categorizados
(
  'get_uncategorized',
  'categorization',
  'Listar transações sem categoria',
  '{}'::jsonb,
  '[]'::jsonb,
  'O que ainda não está categorizado?',
  '[{"name":"get_uncategorized","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["categoriz"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- ============================================================================
-- GOALS & RECURRING (2 casos)
-- ============================================================================

-- 18) Criar meta financeira
(
  'create_financial_goal',
  'goals',
  'Criar meta de economia com prazo',
  '{}'::jsonb,
  '[]'::jsonb,
  'Quero juntar R$ 5.000 até junho. Cria uma meta pra mim.',
  '[{"name":"create_financial_goal","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["5.000","meta","junho"]'::jsonb,
  '[]'::jsonb,
  6, 8
),

-- 19) Detectar custos recorrentes
(
  'detect_recurring',
  'recurring',
  'Detectar despesas que se repetem mensalmente',
  '{}'::jsonb,
  '[]'::jsonb,
  'Quais são meus gastos recorrentes?',
  '[{"name":"detect_recurring_expenses","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["recorrent"]'::jsonb,
  '[]'::jsonb,
  5, 6
),

-- ============================================================================
-- REPORTS (1 caso)
-- ============================================================================

-- 20) Relatório mensal
(
  'generate_monthly_report',
  'reports',
  'Gerar relatório do mês',
  '{}'::jsonb,
  '[]'::jsonb,
  'Gera meu relatório de janeiro.',
  '[{"name":"generate_monthly_report","min":1,"max":1}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '["relatório","janeiro"]'::jsonb,
  '[]'::jsonb,
  6, 8
);

-- ============================================================================
-- Verificar inserção
-- ============================================================================
-- SELECT name, domain, is_enabled FROM agent_eval_cases ORDER BY domain, name;
