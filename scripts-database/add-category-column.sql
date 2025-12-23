-- Adiciona coluna de categoria na tabela expenses
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'outros';

-- Atualiza os gastos existentes para tentar categorizá-los automaticamente
-- Isso é opcional, você pode executar ou não
UPDATE expenses
SET category = CASE
  WHEN LOWER(establishment_name) LIKE '%aluguel%' OR LOWER(establishment_name) LIKE '%imobil%' THEN 'moradia'
  WHEN LOWER(establishment_name) LIKE '%luz%' OR LOWER(establishment_name) LIKE '%agua%' OR LOWER(establishment_name) LIKE '%internet%' OR LOWER(establishment_name) LIKE '%celpe%' THEN 'utilidades'
  WHEN LOWER(establishment_name) LIKE '%combustivel%' OR LOWER(establishment_name) LIKE '%gasolina%' OR LOWER(establishment_name) LIKE '%posto%' OR LOWER(establishment_name) LIKE '%uber%' THEN 'transporte'
  WHEN LOWER(establishment_name) LIKE '%supermercado%' OR LOWER(establishment_name) LIKE '%mercado%' OR LOWER(establishment_name) LIKE '%feira%' THEN 'alimentacao'
  WHEN LOWER(establishment_name) LIKE '%restaurante%' OR LOWER(establishment_name) LIKE '%pizza%' OR LOWER(establishment_name) LIKE '%ifood%' OR LOWER(establishment_name) LIKE '%lanche%' THEN 'restaurantes'
  WHEN LOWER(establishment_name) LIKE '%farmacia%' OR LOWER(establishment_name) LIKE '%hospital%' OR LOWER(establishment_name) LIKE '%clinica%' THEN 'saude'
  WHEN LOWER(establishment_name) LIKE '%escola%' OR LOWER(establishment_name) LIKE '%curso%' OR LOWER(establishment_name) LIKE '%livraria%' THEN 'educacao'
  WHEN LOWER(establishment_name) LIKE '%cinema%' OR LOWER(establishment_name) LIKE '%netflix%' OR LOWER(establishment_name) LIKE '%spotify%' THEN 'lazer'
  WHEN LOWER(establishment_name) LIKE '%roupa%' OR LOWER(establishment_name) LIKE '%calcado%' OR LOWER(establishment_name) LIKE '%renner%' THEN 'vestuario'
  ELSE 'outros'
END
WHERE category = 'outros';
