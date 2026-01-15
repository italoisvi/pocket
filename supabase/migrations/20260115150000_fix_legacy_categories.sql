-- ============================================================================
-- Migration: Corrigir categorias legadas que ainda existem no banco
-- ============================================================================
-- Esta migration corrige dados que podem ter sido inseridos com categorias antigas
-- após as migrations de recategorização terem rodado

-- 1. Corrigir expenses com categoria 'delivery' -> 'alimentacao_fora'
UPDATE expenses
SET category = 'alimentacao_fora',
    subcategory = COALESCE(
      CASE
        WHEN LOWER(establishment_name) LIKE '%ifood%' THEN 'Apps de Entrega'
        WHEN LOWER(establishment_name) LIKE '%rappi%' THEN 'Apps de Entrega'
        WHEN LOWER(establishment_name) LIKE '%uber eats%' THEN 'Apps de Entrega'
        ELSE subcategory
      END,
      'Apps de Entrega'
    )
WHERE category = 'delivery';

-- 2. Corrigir expenses com categoria 'alimentacao' -> categorizar apropriadamente
-- Apps de entrega
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Apps de Entrega'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%ifood%'
    OR LOWER(establishment_name) LIKE '%rappi%'
    OR LOWER(establishment_name) LIKE '%uber eats%'
    OR LOWER(establishment_name) LIKE '%ze delivery%'
    OR LOWER(establishment_name) LIKE '%zé delivery%'
  );

-- Restaurantes
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Restaurantes'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%restaurante%'
    OR LOWER(establishment_name) LIKE '%churrascaria%'
    OR LOWER(establishment_name) LIKE '%pizzaria%'
  );

-- Padaria
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Padaria/Café'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%padaria%'
    OR LOWER(establishment_name) LIKE '%cafe%'
    OR LOWER(establishment_name) LIKE '%café%'
  );

-- Restante -> alimentacao_casa (supermercados, etc)
UPDATE expenses
SET category = 'alimentacao_casa'
WHERE category = 'alimentacao';

-- 3. Corrigir budgets com categorias legadas
UPDATE budgets
SET category_id = 'alimentacao_fora'
WHERE category_id = 'delivery';

UPDATE budgets
SET category_id = 'alimentacao_casa'
WHERE category_id = 'alimentacao';

-- 4. Corrigir transaction_categories com categorias legadas
UPDATE transaction_categories
SET category = 'alimentacao_fora'
WHERE category = 'delivery';

UPDATE transaction_categories
SET category = 'alimentacao_casa'
WHERE category = 'alimentacao';
