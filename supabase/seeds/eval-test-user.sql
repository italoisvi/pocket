-- ============================================================================
-- Seed: Dados do Usuário de Teste para Evals
-- ============================================================================
--
-- IMPORTANTE: Antes de executar este script, crie o usuário no Supabase:
--
-- 1. Vá em Authentication > Users no painel do Supabase
-- 2. Clique em "Add user" > "Create new user"
-- 3. Email: eval-test@pocket.app
-- 4. Password: EvalTest123!
-- 5. Marque "Auto Confirm User"
-- 6. Copie o UUID gerado e substitua abaixo
--
-- ============================================================================

-- Substitua este UUID pelo UUID real do usuário criado
-- Para encontrar: SELECT id FROM auth.users WHERE email = 'eval-test@pocket.app';

DO $$
DECLARE
  test_user_id UUID;
BEGIN
  -- Buscar o usuário de teste
  SELECT id INTO test_user_id FROM auth.users WHERE email = 'eval-test@pocket.app';

  IF test_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário eval-test@pocket.app não encontrado. Crie primeiro no painel do Supabase.';
  END IF;

  RAISE NOTICE 'Configurando dados para usuário: %', test_user_id;

  -- ============================================================================
  -- 1. Profile com Income Cards
  -- ============================================================================

  INSERT INTO profiles (id, name, income_cards, debt_notifications_enabled)
  VALUES (
    test_user_id,
    'Usuário de Teste',
    '[
      {
        "id": "income-1",
        "salary": "5000",
        "paymentDay": "5",
        "incomeSource": "CLT"
      },
      {
        "id": "income-2",
        "salary": "1500",
        "paymentDay": "15",
        "incomeSource": "Freelancer"
      }
    ]'::jsonb,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    income_cards = EXCLUDED.income_cards;

  -- ============================================================================
  -- 2. Budgets (Orçamentos)
  -- ============================================================================

  -- Limpar budgets existentes do usuário de teste
  DELETE FROM budgets WHERE user_id = test_user_id;

  INSERT INTO budgets (user_id, category_id, amount, period_type, start_date, notifications_enabled)
  VALUES
    (test_user_id, 'alimentacao', 800, 'monthly', DATE_TRUNC('month', CURRENT_DATE), true),
    (test_user_id, 'transporte', 400, 'monthly', DATE_TRUNC('month', CURRENT_DATE), true),
    (test_user_id, 'lazer', 300, 'monthly', DATE_TRUNC('month', CURRENT_DATE), true),
    (test_user_id, 'delivery', 200, 'monthly', DATE_TRUNC('month', CURRENT_DATE), true);

  -- ============================================================================
  -- 3. Expenses (Gastos do mês atual)
  -- ============================================================================

  -- Limpar expenses existentes do usuário de teste
  DELETE FROM expenses WHERE user_id = test_user_id;

  -- Gastos dos últimos 30 dias
  INSERT INTO expenses (user_id, establishment_name, amount, date, category, subcategory, source)
  VALUES
    -- Alimentação
    (test_user_id, 'Supermercado Extra', 245.80, CURRENT_DATE - INTERVAL '2 days', 'alimentacao', 'Supermercado', 'manual'),
    (test_user_id, 'Padaria Pão Quente', 32.50, CURRENT_DATE - INTERVAL '3 days', 'alimentacao', 'Padaria', 'manual'),
    (test_user_id, 'Restaurante Sabor', 78.90, CURRENT_DATE - INTERVAL '5 days', 'alimentacao', 'Restaurante', 'manual'),

    -- Transporte
    (test_user_id, 'Uber', 28.50, CURRENT_DATE - INTERVAL '1 day', 'transporte', 'Uber', 'manual'),
    (test_user_id, 'Uber', 35.00, CURRENT_DATE - INTERVAL '4 days', 'transporte', 'Uber', 'manual'),
    (test_user_id, 'Posto Shell', 180.00, CURRENT_DATE - INTERVAL '7 days', 'transporte', 'Combustível', 'manual'),

    -- Delivery
    (test_user_id, 'iFood', 45.90, CURRENT_DATE - INTERVAL '2 days', 'delivery', 'iFood', 'manual'),
    (test_user_id, 'iFood', 62.00, CURRENT_DATE - INTERVAL '6 days', 'delivery', 'iFood', 'manual'),
    (test_user_id, 'Rappi', 38.50, CURRENT_DATE - INTERVAL '8 days', 'delivery', 'Rappi', 'manual'),

    -- Lazer
    (test_user_id, 'Netflix', 55.90, CURRENT_DATE - INTERVAL '10 days', 'lazer', 'Streaming', 'manual'),
    (test_user_id, 'Spotify', 21.90, CURRENT_DATE - INTERVAL '10 days', 'lazer', 'Streaming', 'manual'),
    (test_user_id, 'Cinema', 48.00, CURRENT_DATE - INTERVAL '12 days', 'lazer', 'Cinema', 'manual'),

    -- Saúde
    (test_user_id, 'Farmácia Drogasil', 89.50, CURRENT_DATE - INTERVAL '15 days', 'saude', 'Farmácia', 'manual'),

    -- Outros
    (test_user_id, 'Amazon', 156.00, CURRENT_DATE - INTERVAL '18 days', 'eletronicos', 'E-commerce', 'manual');

  -- Gastos do mês passado (para comparações)
  INSERT INTO expenses (user_id, establishment_name, amount, date, category, subcategory, source)
  VALUES
    (test_user_id, 'Supermercado Extra', 312.40, CURRENT_DATE - INTERVAL '35 days', 'alimentacao', 'Supermercado', 'manual'),
    (test_user_id, 'Uber', 95.00, CURRENT_DATE - INTERVAL '38 days', 'transporte', 'Uber', 'manual'),
    (test_user_id, 'iFood', 128.00, CURRENT_DATE - INTERVAL '40 days', 'delivery', 'iFood', 'manual'),
    (test_user_id, 'Netflix', 55.90, CURRENT_DATE - INTERVAL '42 days', 'lazer', 'Streaming', 'manual');

  -- ============================================================================
  -- 4. Walts Memory (Memórias do assistente)
  -- ============================================================================

  -- Limpar memórias existentes
  DELETE FROM walts_memory WHERE user_id = test_user_id;

  INSERT INTO walts_memory (user_id, memory_type, key, value, confidence, source)
  VALUES
    (test_user_id, 'preference', 'notification_time', '"morning"', 0.9, 'user_stated'),
    (test_user_id, 'preference', 'budget_style', '"conservative"', 0.8, 'inferred'),
    (test_user_id, 'context', 'main_expense_category', '"alimentacao"', 0.85, 'analyzed'),
    (test_user_id, 'insight', 'spending_pattern', '{"weekday_avg": 45, "weekend_avg": 120}', 0.75, 'calculated');

  -- ============================================================================
  -- 5. Financial Goals (Metas)
  -- ============================================================================

  -- Se a tabela existir
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'financial_goals') THEN
    DELETE FROM financial_goals WHERE user_id = test_user_id;

    INSERT INTO financial_goals (user_id, title, target_amount, current_amount, target_date, category, is_active)
    VALUES
      (test_user_id, 'Reserva de Emergência', 10000, 2500, CURRENT_DATE + INTERVAL '6 months', 'emergencia', true),
      (test_user_id, 'Viagem de Férias', 5000, 1200, CURRENT_DATE + INTERVAL '4 months', 'viagem', true);
  END IF;

  RAISE NOTICE 'Dados de teste configurados com sucesso!';
  RAISE NOTICE 'UUID do usuário: %', test_user_id;
  RAISE NOTICE 'Use este UUID no eval-runner: {"test_user_id": "%"}', test_user_id;

END $$;

-- ============================================================================
-- Verificar dados criados
-- ============================================================================

-- Descomente para verificar:
-- SELECT 'profiles' as table_name, count(*) FROM profiles WHERE id IN (SELECT id FROM auth.users WHERE email = 'eval-test@pocket.app')
-- UNION ALL
-- SELECT 'budgets', count(*) FROM budgets WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'eval-test@pocket.app')
-- UNION ALL
-- SELECT 'expenses', count(*) FROM expenses WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'eval-test@pocket.app')
-- UNION ALL
-- SELECT 'walts_memory', count(*) FROM walts_memory WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'eval-test@pocket.app');
