-- Migration: Recategorizar gastos de alimentação
-- Executa após os novos valores serem adicionados ao enum

-- 1. Recategorizar delivery -> alimentacao_fora
UPDATE expenses
SET category = 'alimentacao_fora'
WHERE category = 'delivery';

-- 2. Recategorizar alimentacao de apps de entrega/restaurantes -> alimentacao_fora
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

-- 3. Recategorizar alimentacao de restaurantes -> alimentacao_fora
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Restaurantes'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%restaurante%'
    OR LOWER(establishment_name) LIKE '%churrascaria%'
    OR LOWER(establishment_name) LIKE '%pizzaria%'
    OR LOWER(establishment_name) LIKE '%outback%'
    OR LOWER(establishment_name) LIKE '%coco bambu%'
    OR LOWER(establishment_name) LIKE '%madero%'
  );

-- 4. Recategorizar alimentacao de fast food -> alimentacao_fora
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Fast Food'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%mcdonald%'
    OR LOWER(establishment_name) LIKE '%burger king%'
    OR LOWER(establishment_name) LIKE '%subway%'
    OR LOWER(establishment_name) LIKE '%habib%'
    OR LOWER(establishment_name) LIKE '%bobs%'
    OR LOWER(establishment_name) LIKE '%spoleto%'
  );

-- 5. Recategorizar alimentacao de lanches -> alimentacao_fora
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Lanches'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%lanchonete%'
    OR LOWER(establishment_name) LIKE '%hamburgueria%'
    OR LOWER(establishment_name) LIKE '%pastelaria%'
    OR LOWER(establishment_name) LIKE '%açaí%'
    OR LOWER(establishment_name) LIKE '%acai%'
  );

-- 6. Recategorizar alimentacao de padaria/café -> alimentacao_fora
-- Nota: Padarias podem ser tanto compras para casa quanto consumo imediato
-- Por padrão, vamos considerar como alimentacao_fora
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Padaria/Café'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%padaria%'
    OR LOWER(establishment_name) LIKE '%cafeteria%'
    OR LOWER(establishment_name) LIKE '%starbucks%'
    OR LOWER(establishment_name) LIKE '%cafe %'
    OR LOWER(establishment_name) LIKE '%café %'
  );

-- 7. Recategorizar alimentacao de bares -> alimentacao_fora
UPDATE expenses
SET category = 'alimentacao_fora', subcategory = 'Bares'
WHERE category = 'alimentacao'
  AND (
    LOWER(establishment_name) LIKE '%bar %'
    OR LOWER(establishment_name) LIKE '%pub%'
    OR LOWER(establishment_name) LIKE '%boteco%'
    OR LOWER(establishment_name) LIKE '%cervejaria%'
  );

-- 8. Renomear categoria alimentacao restante -> alimentacao_casa
UPDATE expenses
SET category = 'alimentacao_casa'
WHERE category = 'alimentacao';

-- 9. Também atualizar transaction_categories se existir
UPDATE transaction_categories
SET category = 'alimentacao_fora'
WHERE category = 'delivery';

UPDATE transaction_categories
SET category = 'alimentacao_casa'
WHERE category = 'alimentacao';
