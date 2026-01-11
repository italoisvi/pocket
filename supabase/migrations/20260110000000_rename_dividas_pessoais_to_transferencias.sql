-- Migração para renomear categoria dividas_pessoais para transferencias
-- E atualizar subcategorias relacionadas

-- Atualizar categoria em expenses
UPDATE expenses
SET category = 'transferencias'
WHERE category = 'dividas_pessoais';

-- Atualizar subcategoria (remover acentos e padronizar)
UPDATE expenses
SET subcategory = 'PIX Pessoa Fisica'
WHERE subcategory = 'PIX Pessoa Física'
   OR subcategory = 'PIX Pessoa Fisica';

UPDATE expenses
SET subcategory = 'TED/DOC'
WHERE subcategory = 'Transferência Pessoa Física'
   OR subcategory = 'Transferencia Pessoa Fisica';
