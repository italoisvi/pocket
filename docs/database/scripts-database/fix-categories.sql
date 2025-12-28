-- Script para recategorizar TODOS os gastos baseado no nome do estabelecimento
-- Execute este script no SQL Editor do Supabase

-- PASSO 1: Recategorizar baseado em palavras-chave no nome do estabelecimento

-- Moradia & Contas (Energia, Água, Gás, Condomínio, etc)
UPDATE expenses
SET category = 'moradia_contas'
WHERE LOWER(establishment_name) ~ '(energia|luz|eletricidade|enel|coel|celpe|equatorial|cemig|copel|elektro|light|cosern|celg|ceee|energetica|energética|eletrica|elétrica|companhia|agua|água|saneamento|cagece|sabesp|embasa|cedae|caesb|sanepar|gas|gás|ultragaz|comgas|condominio|condomínio|aluguel|iptu|seguro fianca|seguro fiança|imobiliaria|imobiliária)';

-- Comunicação (Internet, Telefone)
UPDATE expenses
SET category = 'comunicacao'
WHERE category != 'moradia_contas' -- Não sobrescrever o que já foi categorizado acima
  AND LOWER(establishment_name) ~ '(vivo|claro|tim|oi|brisanet|mob|multiplay|net|fibra|telecom|internet|telefone)';

-- Mercado & Casa
UPDATE expenses
SET category = 'mercado_casa'
WHERE category NOT IN ('moradia_contas', 'comunicacao')
  AND LOWER(establishment_name) ~ '(supermercado|mercadinho|atacadao|atacadão|assai|assaí|carrefour|pao de acucar|pão de açúcar|sao luiz|são luiz|cometa|hortifruti|mercearia|mercado|feira|açougue|acougue)';

-- Saúde & Farmácia
UPDATE expenses
SET category = 'saude_farmacia'
WHERE category NOT IN ('moradia_contas', 'comunicacao', 'mercado_casa')
  AND LOWER(establishment_name) ~ '(farmacia|farmácia|drogasil|pague menos|extrafarma|drogaria|unimed|hapvida|laboratorio|laboratório|consulta|medico|médico|hospital|clinica|clínica|dentista|plano de saude|plano de saúde)';

-- Transporte
UPDATE expenses
SET category = 'transporte'
WHERE category NOT IN ('moradia_contas', 'comunicacao', 'mercado_casa', 'saude_farmacia')
  AND LOWER(establishment_name) ~ '(uber|99|99pop|posto|gasolina|etanol|combustivel|combustível|shell|ipiranga|petrobras|ale|estacionamento|zona azul|sem parar|veloe|taxi|táxi|metro|metrô|onibus|ônibus)';

-- Alimentação & Delivery
UPDATE expenses
SET category = 'alimentacao_delivery'
WHERE category NOT IN ('moradia_contas', 'comunicacao', 'mercado_casa', 'saude_farmacia', 'transporte')
  AND LOWER(establishment_name) ~ '(ifood|rappi|ze delivery|zé delivery|restaurante|bar|churrascaria|pizzaria|burger|burguer|mcdonald|mcdonalds|burger king|subway|coco bambu|padaria|cafe|café|sorvete|lanchonete|hamburger|hambúrguer|pizza|delivery)';

-- Lazer & Streaming
UPDATE expenses
SET category = 'lazer_streaming'
WHERE category NOT IN ('moradia_contas', 'comunicacao', 'mercado_casa', 'saude_farmacia', 'transporte', 'alimentacao_delivery')
  AND LOWER(establishment_name) ~ '(netflix|spotify|amazon prime|disney|hbo|globoplay|cinema|ingresso|sympla|eventim|show|teatro|streaming|jogo|game)';

-- Compras
UPDATE expenses
SET category = 'compras'
WHERE category NOT IN ('moradia_contas', 'comunicacao', 'mercado_casa', 'saude_farmacia', 'transporte', 'alimentacao_delivery', 'lazer_streaming')
  AND LOWER(establishment_name) ~ '(amazon|mercado livre|shopee|shein|magalu|renner|riachuelo|zara|c&a|roupa|calcado|calçado|sapato|tenis|tênis|loja)';

-- O restante fica como 'outros' (já é o padrão se não bater nenhuma regra acima)

-- PASSO 2: Verificar o resultado
SELECT
  category,
  COUNT(*) as total,
  STRING_AGG(DISTINCT establishment_name, ', ') as exemplos
FROM expenses
GROUP BY category
ORDER BY total DESC;

-- PASSO 3: Ver especificamente gastos com energia
SELECT
  establishment_name,
  amount,
  category,
  created_at
FROM expenses
WHERE LOWER(establishment_name) LIKE '%energia%'
   OR LOWER(establishment_name) LIKE '%luz%'
   OR LOWER(establishment_name) LIKE '%coel%'
   OR LOWER(establishment_name) LIKE '%enel%'
ORDER BY created_at DESC;
