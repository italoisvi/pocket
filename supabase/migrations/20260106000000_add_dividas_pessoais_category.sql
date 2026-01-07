-- Adicionar nova categoria ao enum expense_category
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'dividas_pessoais';
