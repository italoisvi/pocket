-- ============================================================================
-- MIGRAÇÃO: Sistema de Categorias Reformulado com SUBCATEGORIAS
-- ============================================================================
-- Este script migra o sistema de categorias antigo para o novo sistema
-- baseado em 4 tipos: Essenciais, Não Essenciais, Investimentos e Dívidas
-- AGORA COM SUBCATEGORIAS para maior especificidade
--
-- IMPORTANTE: Execute este script no Supabase SQL Editor
-- ============================================================================

-- 1. Criar novo tipo ENUM para as categorias
DO $$
BEGIN
    -- Remover o tipo antigo se existir
    DROP TYPE IF EXISTS expense_category CASCADE;

    -- Criar novo tipo com todas as categorias
    CREATE TYPE expense_category AS ENUM (
        -- ESSENCIAIS
        'moradia',
        'alimentacao',
        'transporte',
        'saude',
        'educacao',
        -- NÃO ESSENCIAIS
        'lazer',
        'vestuario',
        'beleza',
        'eletronicos',
        'delivery',
        -- INVESTIMENTOS
        'poupanca',
        'previdencia',
        'investimentos',
        -- DÍVIDAS
        'cartao_credito',
        'emprestimos',
        'financiamentos',
        -- OUTROS
        'outros'
    );
END $$;

-- 2. Adicionar colunas temporárias para nova categoria e subcategoria
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS category_new expense_category,
ADD COLUMN IF NOT EXISTS subcategory text;

-- 3. Migrar dados existentes do sistema antigo para o novo
-- Mapeamento das categorias antigas para as novas:
UPDATE expenses
SET category_new = CASE
    -- Categorias antigas -> novas
    WHEN category = 'moradia_contas' THEN 'moradia'::expense_category
    WHEN category = 'comunicacao' THEN 'moradia'::expense_category  -- Internet/telefone agora são moradia
    WHEN category = 'mercado_casa' THEN 'alimentacao'::expense_category
    WHEN category = 'saude_farmacia' THEN 'saude'::expense_category
    WHEN category = 'transporte' THEN 'transporte'::expense_category
    WHEN category = 'alimentacao_delivery' THEN 'delivery'::expense_category
    WHEN category = 'lazer_streaming' THEN 'lazer'::expense_category
    WHEN category = 'compras' THEN 'vestuario'::expense_category  -- Generalizar compras para vestuário
    ELSE 'outros'::expense_category
END,
subcategory = CASE
    -- Definir subcategorias padrão para dados migrados (serão genéricos)
    WHEN category = 'moradia_contas' THEN 'Moradia'
    WHEN category = 'comunicacao' THEN 'Internet'
    WHEN category = 'mercado_casa' THEN 'Supermercado'
    WHEN category = 'saude_farmacia' THEN 'Farmácia'
    WHEN category = 'transporte' THEN 'Transporte'
    WHEN category = 'alimentacao_delivery' THEN 'Delivery'
    WHEN category = 'lazer_streaming' THEN 'Streaming'
    WHEN category = 'compras' THEN 'Compras'
    ELSE 'Outros'
END
WHERE category_new IS NULL;

-- 4. Remover coluna antiga e renomear a nova
ALTER TABLE expenses DROP COLUMN IF EXISTS category;
ALTER TABLE expenses RENAME COLUMN category_new TO category;

-- 5. Adicionar NOT NULL constraints
ALTER TABLE expenses
ALTER COLUMN category SET NOT NULL,
ALTER COLUMN subcategory SET NOT NULL;

-- 6. Adicionar default values
ALTER TABLE expenses
ALTER COLUMN category SET DEFAULT 'outros'::expense_category,
ALTER COLUMN subcategory SET DEFAULT 'Outros';

-- 7. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_expenses_category
ON expenses(category);

CREATE INDEX IF NOT EXISTS idx_expenses_subcategory
ON expenses(subcategory);

CREATE INDEX IF NOT EXISTS idx_expenses_category_subcategory
ON expenses(category, subcategory);

CREATE INDEX IF NOT EXISTS idx_expenses_category_date
ON expenses(category, date DESC);

-- ============================================================================
-- VERIFICAÇÃO: Execute estas queries para confirmar a migração
-- ============================================================================

-- Verificar distribuição de categorias e subcategorias
SELECT
    category,
    subcategory,
    COUNT(*) as total_expenses,
    SUM(amount) as total_amount
FROM expenses
GROUP BY category, subcategory
ORDER BY category, total_expenses DESC;

-- Verificar se há valores NULL (não deveria ter nenhum)
SELECT
    COUNT(*) as expenses_with_null_category,
    (SELECT COUNT(*) FROM expenses WHERE subcategory IS NULL) as expenses_with_null_subcategory
FROM expenses
WHERE category IS NULL;

-- Verificar total de gastos por categoria principal
SELECT
    category,
    COUNT(*) as total_expenses,
    SUM(amount) as total_amount
FROM expenses
GROUP BY category
ORDER BY total_amount DESC;

-- ============================================================================
-- ROLLBACK (se necessário): Execute este bloco para reverter
-- ============================================================================
-- ATENÇÃO: Isto irá reverter a migração. Use apenas se houver problemas.
--
-- ALTER TABLE expenses
--   DROP COLUMN IF EXISTS category,
--   DROP COLUMN IF EXISTS subcategory;
-- DROP TYPE IF EXISTS expense_category CASCADE;
--
-- Depois você precisará recriar o sistema antigo manualmente.
-- ============================================================================
