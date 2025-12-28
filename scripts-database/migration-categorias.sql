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
-- Verifica se existe a coluna antiga 'category' antes de migrar
DO $$
DECLARE
    old_category_exists boolean;
BEGIN
    -- Verificar se a coluna 'category' antiga existe (tipo text, não o novo ENUM)
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'expenses'
          AND column_name = 'category'
          AND data_type IN ('text', 'character varying', 'USER-DEFINED')
          AND column_name != 'category_new'
    ) INTO old_category_exists;

    IF old_category_exists THEN
        -- Coluna antiga existe, realizar migração dos dados
        RAISE NOTICE 'Migrando dados da coluna category antiga...';

        UPDATE expenses
        SET category_new = CASE
            -- Categorias antigas -> novas (usando cast para text para garantir compatibilidade)
            WHEN category::text = 'moradia_contas' THEN 'moradia'::expense_category
            WHEN category::text = 'comunicacao' THEN 'moradia'::expense_category  -- Internet/telefone agora são moradia
            WHEN category::text = 'mercado_casa' THEN 'alimentacao'::expense_category
            WHEN category::text = 'saude_farmacia' THEN 'saude'::expense_category
            WHEN category::text = 'transporte' THEN 'transporte'::expense_category
            WHEN category::text = 'alimentacao_delivery' THEN 'delivery'::expense_category
            WHEN category::text = 'lazer_streaming' THEN 'lazer'::expense_category
            WHEN category::text = 'compras' THEN 'vestuario'::expense_category  -- Generalizar compras para vestuário
            ELSE 'outros'::expense_category
        END,
        subcategory = CASE
            -- Definir subcategorias padrão para dados migrados (serão genéricos)
            WHEN category::text = 'moradia_contas' THEN 'Moradia'
            WHEN category::text = 'comunicacao' THEN 'Internet'
            WHEN category::text = 'mercado_casa' THEN 'Supermercado'
            WHEN category::text = 'saude_farmacia' THEN 'Farmácia'
            WHEN category::text = 'transporte' THEN 'Transporte'
            WHEN category::text = 'alimentacao_delivery' THEN 'Delivery'
            WHEN category::text = 'lazer_streaming' THEN 'Streaming'
            WHEN category::text = 'compras' THEN 'Compras'
            ELSE 'Outros'
        END
        WHERE category_new IS NULL;
    ELSE
        -- Coluna antiga não existe, definir valores padrão para registros existentes sem categoria
        RAISE NOTICE 'Coluna category antiga não encontrada. Definindo valores padrão...';

        UPDATE expenses
        SET category_new = 'outros'::expense_category,
            subcategory = 'Outros'
        WHERE category_new IS NULL;
    END IF;
END $$;

-- 4. Remover coluna antiga e renomear a nova
ALTER TABLE expenses DROP COLUMN IF EXISTS category;
ALTER TABLE expenses RENAME COLUMN category_new TO category;

-- 5. Adicionar NOT NULL constraints
-- Garantir que todos os registros tenham valores antes de aplicar NOT NULL
UPDATE expenses
SET category = 'outros'::expense_category
WHERE category IS NULL;

UPDATE expenses
SET subcategory = 'Outros'
WHERE subcategory IS NULL;

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
