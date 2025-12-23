-- Script para atualizar categorias antigas para o novo sistema
-- Execute este script no SQL Editor do Supabase

-- Atualizar categorias antigas para as novas
UPDATE expenses
SET category = CASE
    -- Moradia e Utilidades -> Moradia & Contas
    WHEN category IN ('moradia', 'utilidades') THEN 'moradia_contas'

    -- Comunicação (não existia antes, mas mapeamos de utilidades se tiver internet/telefone)
    WHEN category = 'utilidades' THEN 'comunicacao'

    -- Alimentação -> Mercado & Casa
    WHEN category = 'alimentacao' THEN 'mercado_casa'

    -- Saúde -> Saúde & Farmácia
    WHEN category = 'saude' THEN 'saude_farmacia'

    -- Transporte mantém o mesmo nome
    WHEN category = 'transporte' THEN 'transporte'

    -- Restaurantes -> Alimentação & Delivery
    WHEN category = 'restaurantes' THEN 'alimentacao_delivery'

    -- Educação -> Outros (não temos mais categoria educação)
    WHEN category = 'educacao' THEN 'outros'

    -- Lazer -> Lazer & Streaming
    WHEN category = 'lazer' THEN 'lazer_streaming'

    -- Vestuário -> Compras
    WHEN category = 'vestuario' THEN 'compras'

    -- Outros permanece outros
    ELSE 'outros'
END
WHERE category IN ('moradia', 'utilidades', 'alimentacao', 'saude', 'restaurantes', 'educacao', 'lazer', 'vestuario');

-- Verificar o resultado
SELECT category, COUNT(*) as total
FROM expenses
GROUP BY category
ORDER BY total DESC;
