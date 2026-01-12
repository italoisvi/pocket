-- migrate: no transaction
-- Migration: Adicionar novos valores ao enum expense_category
-- Separa alimentacao em alimentacao_casa (essencial) e alimentacao_fora (variável)
-- Também adiciona suporte para categoria pets

-- Nota: ALTER TYPE ADD VALUE não pode rodar dentro de transaction
-- Por isso usamos "migrate: no transaction" no início do arquivo

ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'alimentacao_casa';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'alimentacao_fora';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'pets';
