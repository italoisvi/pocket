-- Adicionar novas categorias ao enum expense_category
-- tecnologia: serviços de IA, cloud, software, Apple, domínios
-- consorcio: consórcio de imóvel ou veículo

ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'tecnologia';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'consorcio';
