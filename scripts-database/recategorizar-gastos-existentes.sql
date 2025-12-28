-- ============================================================================
-- RECATEGORIZAÇÃO: Corrigir categorias dos gastos existentes
-- ============================================================================
-- Este script analisa o establishment_name de cada gasto e aplica
-- a categorização correta baseada nas palavras-chave definidas no sistema
--
-- IMPORTANTE: Execute este script no Supabase SQL Editor
-- ============================================================================

-- Recategorizar todos os gastos baseado no establishment_name
UPDATE expenses
SET
  category = CASE
    -- MORADIA (Essencial)
    WHEN LOWER(establishment_name) ~ '(energia|energetica|energética|luz|enel|cemig|light|copel|celpe|coelba|eletrobras|elektro|energisa|cpfl|companhia energetica|cia energetica)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(agua|água|sabesp|cagece|caesb|copasa|sanepar|cedae|embasa|companhia de agua)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(gas|gás|ultragaz|liquigas|supergasbrás|nacional gás|comgas|copagaz)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(aluguel)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(condominio|condomínio)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(iptu)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(internet|vivo fibra|claro internet|tim internet|oi fibra|net|sky|telefonica)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(telefone|celular|móvel|vivo|claro|tim|oi|nextel|algar)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(seguro fianca|seguro residencial|porto seguro casa)' THEN 'moradia'::expense_category

    -- ALIMENTAÇÃO (Essencial)
    WHEN LOWER(establishment_name) ~ '(supermercado|mercado|carrefour|extra|pão de açúcar|walmart|atacadão|assaí|makro|sam''s club|big|comercial|wms|gbarbosa)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(feira|hortifruti|quitanda|sacolão|verdura|legume|fruta)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(açougue|acougue|carne|frango|peixaria)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(padaria|confeitaria|pão|panificadora)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(mercearia|emporio|empório|armazém|armazem)' THEN 'alimentacao'::expense_category

    -- TRANSPORTE (Essencial)
    WHEN LOWER(establishment_name) ~ '(uber|99|cabify|taxi|transporte por app)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(metro|metrô|cptm|trem|onibus|ônibus|bilhete único|bilhete unico)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(combustivel|combustível|gasolina|etanol|diesel|posto|shell|ipiranga|petrobras|br distribuidora|ale)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(estacionamento|zona azul|park)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(pedagio|pedágio|sem parar|veloe|conectcar)' THEN 'transporte'::expense_category

    -- SAÚDE (Essencial)
    WHEN LOWER(establishment_name) ~ '(farmacia|farmácia|drogaria|droga|pacheco|raia|drogasil|sao paulo|são paulo|ultrafarma|pague menos|nissei)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(hospital|clinica|clínica|consultorio|consultório|pronto socorro)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(laboratorio|laboratório|exame|diagnóstico|diagnostico)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(plano de saude|plano de saúde|unimed|amil|bradesco saude|bradesco saúde|sulamerica|sulamerica|hapvida)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(dentista|odontologica|odontológica)' THEN 'saude'::expense_category

    -- EDUCAÇÃO (Essencial)
    WHEN LOWER(establishment_name) ~ '(escola|colegio|colégio)' THEN 'educacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(faculdade|universidade)' THEN 'educacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(curso|udemy|coursera|alura|rocketseat|edx)' THEN 'educacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(wizard|ccaa|cultura inglesa|duolingo|babbel)' THEN 'educacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(livro|livraria|saraiva|cultura|fnac)' THEN 'educacao'::expense_category

    -- LAZER (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(netflix|spotify|amazon prime|disney|hbo|youtube premium|deezer|apple music)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(cinema|ingresso|cinemark|uci|kinoplex)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(viagem|passagem|azul|gol|latam|hotel|pousada|airbnb|booking)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(academia|smartfit|bodytech|natacao|natação)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(parque|museu|clube|futebol|show|concert|evento)' THEN 'lazer'::expense_category

    -- VESTUÁRIO (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(roupa|vestuario|vestuário|moda|renner|c&a|riachuelo|marisa|zara|hering)' THEN 'vestuario'::expense_category
    WHEN LOWER(establishment_name) ~ '(sapato|calçado|calçados|tenis|tênis)' THEN 'vestuario'::expense_category
    WHEN LOWER(establishment_name) ~ '(acessorio|acessório|bijuteria|joia|relogio|relógio|vivara|pandora)' THEN 'vestuario'::expense_category

    -- BELEZA (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(salao|salão|cabelereiro|cabeleireiro|barbeiro|manicure|estetica|estética)' THEN 'beleza'::expense_category
    WHEN LOWER(establishment_name) ~ '(cosmetico|cosmético|maquiagem|perfume|sephora|boticario|boticário|natura|avon|oboticario|o boticário)' THEN 'beleza'::expense_category
    WHEN LOWER(establishment_name) ~ '(spa|massagem)' THEN 'beleza'::expense_category

    -- ELETRÔNICOS (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(samsung|apple|xiaomi|motorola|iphone|galaxy|celular)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(notebook|computador|pc|tablet|ipad|macbook)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(fone|airpods|mouse|teclado|monitor|cabo)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(playstation|xbox|nintendo|steam|game|jogo)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(magazine luiza|magalu|americanas|casas bahia|fast shop|kalunga)' THEN 'eletronicos'::expense_category

    -- DELIVERY (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(ifood|rappi|uber eats|ze delivery|zé delivery|delivery)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(restaurante|churrascaria|outback|coco bambu)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(mcdonald|mcdonalds|burger king|bk|subway|pizza|pizzaria|sushi|japonês|japones)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(lanche|hamburger|hamburguer|dog|pastel)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(bar|choperia|choperia|boteco|pub)' THEN 'delivery'::expense_category

    -- POUPANÇA (Investimento)
    WHEN LOWER(establishment_name) ~ '(poupanca|poupança|conta poupanca|conta poupança)' THEN 'poupanca'::expense_category
    WHEN LOWER(establishment_name) ~ '(rendimento|juros)' THEN 'poupanca'::expense_category

    -- PREVIDÊNCIA (Investimento)
    WHEN LOWER(establishment_name) ~ '(previdencia|previdência|vgbl|pgbl)' THEN 'previdencia'::expense_category
    WHEN LOWER(establishment_name) ~ '(aposentadoria|inss)' THEN 'previdencia'::expense_category

    -- INVESTIMENTOS (Investimento)
    WHEN LOWER(establishment_name) ~ '(investimento|acao|ação|fundo|tesouro direto|cdb|lci|lca|renda fixa)' THEN 'investimentos'::expense_category
    WHEN LOWER(establishment_name) ~ '(corretora|clear|xp|rico|btg|nuinvest)' THEN 'investimentos'::expense_category

    -- CARTÃO DE CRÉDITO (Dívida)
    WHEN LOWER(establishment_name) ~ '(cartao|cartão|credito|crédito|nubank|inter|c6|banco do brasil|bradesco|itau|itaú|santander|caixa)' THEN 'cartao_credito'::expense_category
    WHEN LOWER(establishment_name) ~ '(fatura|pagamento cartao|pagamento cartão)' THEN 'cartao_credito'::expense_category

    -- EMPRÉSTIMOS (Dívida)
    WHEN LOWER(establishment_name) ~ '(emprestimo|empréstimo|financeira|credito pessoal|crédito pessoal)' THEN 'emprestimos'::expense_category

    -- FINANCIAMENTOS (Dívida)
    WHEN LOWER(establishment_name) ~ '(financiamento|consorcio|consórcio|prestacao|prestação)' THEN 'financiamentos'::expense_category
    WHEN LOWER(establishment_name) ~ '(carro|veiculo|veículo|moto|imovel|imóvel|casa|apartamento)' THEN 'financiamentos'::expense_category

    -- OUTROS (padrão)
    ELSE 'outros'::expense_category
  END,

  subcategory = CASE
    -- MORADIA
    WHEN LOWER(establishment_name) ~ '(energia|energetica|energética|luz|enel|cemig|light|copel|celpe|coelba|eletrobras|elektro|energisa|cpfl|companhia energetica|cia energetica)' THEN 'Energia'
    WHEN LOWER(establishment_name) ~ '(agua|água|sabesp|cagece|caesb|copasa|sanepar|cedae|embasa|companhia de agua)' THEN 'Água'
    WHEN LOWER(establishment_name) ~ '(gas|gás|ultragaz|liquigas|supergasbrás|nacional gás|comgas|copagaz)' THEN 'Gás'
    WHEN LOWER(establishment_name) ~ '(aluguel)' THEN 'Aluguel'
    WHEN LOWER(establishment_name) ~ '(condominio|condomínio)' THEN 'Condomínio'
    WHEN LOWER(establishment_name) ~ '(iptu)' THEN 'IPTU'
    WHEN LOWER(establishment_name) ~ '(internet|vivo fibra|claro internet|tim internet|oi fibra|net|sky|telefonica)' THEN 'Internet'
    WHEN LOWER(establishment_name) ~ '(telefone|celular|móvel|vivo|claro|tim|oi|nextel|algar)' THEN 'Telefone'
    WHEN LOWER(establishment_name) ~ '(seguro fianca|seguro residencial|porto seguro casa)' THEN 'Seguro'

    -- ALIMENTAÇÃO
    WHEN LOWER(establishment_name) ~ '(supermercado|mercado|carrefour|extra|pão de açúcar|walmart|atacadão|assaí|makro|sam''s club|big|comercial|wms|gbarbosa)' THEN 'Supermercado'
    WHEN LOWER(establishment_name) ~ '(feira|hortifruti|quitanda|sacolão|verdura|legume|fruta)' THEN 'Feira'
    WHEN LOWER(establishment_name) ~ '(açougue|acougue|carne|frango|peixaria)' THEN 'Açougue'
    WHEN LOWER(establishment_name) ~ '(padaria|confeitaria|pão|panificadora)' THEN 'Padaria'
    WHEN LOWER(establishment_name) ~ '(mercearia|emporio|empório|armazém|armazem)' THEN 'Mercearia'

    -- TRANSPORTE
    WHEN LOWER(establishment_name) ~ '(uber|99|cabify|taxi|transporte por app)' THEN 'App de Transporte'
    WHEN LOWER(establishment_name) ~ '(metro|metrô|cptm|trem|onibus|ônibus|bilhete único|bilhete unico)' THEN 'Transporte Público'
    WHEN LOWER(establishment_name) ~ '(combustivel|combustível|gasolina|etanol|diesel|posto|shell|ipiranga|petrobras|br distribuidora|ale)' THEN 'Combustível'
    WHEN LOWER(establishment_name) ~ '(estacionamento|zona azul|park)' THEN 'Estacionamento'
    WHEN LOWER(establishment_name) ~ '(pedagio|pedágio|sem parar|veloe|conectcar)' THEN 'Pedágio'

    -- SAÚDE
    WHEN LOWER(establishment_name) ~ '(farmacia|farmácia|drogaria|droga|pacheco|raia|drogasil|sao paulo|são paulo|ultrafarma|pague menos|nissei)' THEN 'Farmácia'
    WHEN LOWER(establishment_name) ~ '(hospital|clinica|clínica|consultorio|consultório|pronto socorro)' THEN 'Consultas'
    WHEN LOWER(establishment_name) ~ '(laboratorio|laboratório|exame|diagnóstico|diagnostico)' THEN 'Exames'
    WHEN LOWER(establishment_name) ~ '(plano de saude|plano de saúde|unimed|amil|bradesco saude|bradesco saúde|sulamerica|sulamerica|hapvida)' THEN 'Plano de Saúde'
    WHEN LOWER(establishment_name) ~ '(dentista|odontologica|odontológica)' THEN 'Dentista'

    -- EDUCAÇÃO
    WHEN LOWER(establishment_name) ~ '(escola|colegio|colégio)' THEN 'Escola'
    WHEN LOWER(establishment_name) ~ '(faculdade|universidade)' THEN 'Faculdade'
    WHEN LOWER(establishment_name) ~ '(curso|udemy|coursera|alura|rocketseat|edx)' THEN 'Curso'
    WHEN LOWER(establishment_name) ~ '(wizard|ccaa|cultura inglesa|duolingo|babbel)' THEN 'Idiomas'
    WHEN LOWER(establishment_name) ~ '(livro|livraria|saraiva|cultura|fnac)' THEN 'Material'

    -- LAZER
    WHEN LOWER(establishment_name) ~ '(netflix|spotify|amazon prime|disney|hbo|youtube premium|deezer|apple music)' THEN 'Streaming'
    WHEN LOWER(establishment_name) ~ '(cinema|ingresso|cinemark|uci|kinoplex)' THEN 'Cinema'
    WHEN LOWER(establishment_name) ~ '(viagem|passagem|azul|gol|latam|hotel|pousada|airbnb|booking)' THEN 'Viagens'
    WHEN LOWER(establishment_name) ~ '(academia|smartfit|bodytech|natacao|natação)' THEN 'Academia'
    WHEN LOWER(establishment_name) ~ '(parque|museu|clube|futebol|show|concert|evento)' THEN 'Lazer'

    -- VESTUÁRIO
    WHEN LOWER(establishment_name) ~ '(roupa|vestuario|vestuário|moda|renner|c&a|riachuelo|marisa|zara|hering)' THEN 'Roupas'
    WHEN LOWER(establishment_name) ~ '(sapato|calçado|calçados|tenis|tênis)' THEN 'Calçados'
    WHEN LOWER(establishment_name) ~ '(acessorio|acessório|bijuteria|joia|relogio|relógio|vivara|pandora)' THEN 'Acessórios'

    -- BELEZA
    WHEN LOWER(establishment_name) ~ '(salao|salão|cabelereiro|cabeleireiro|barbeiro|manicure|estetica|estética)' THEN 'Salão'
    WHEN LOWER(establishment_name) ~ '(cosmetico|cosmético|maquiagem|perfume|sephora|boticario|boticário|natura|avon|oboticario|o boticário)' THEN 'Cosméticos'
    WHEN LOWER(establishment_name) ~ '(spa|massagem)' THEN 'Spa'

    -- ELETRÔNICOS
    WHEN LOWER(establishment_name) ~ '(samsung|apple|xiaomi|motorola|iphone|galaxy|celular)' THEN 'Celulares'
    WHEN LOWER(establishment_name) ~ '(notebook|computador|pc|tablet|ipad|macbook)' THEN 'Computadores'
    WHEN LOWER(establishment_name) ~ '(fone|airpods|mouse|teclado|monitor|cabo)' THEN 'Acessórios'
    WHEN LOWER(establishment_name) ~ '(playstation|xbox|nintendo|steam|game|jogo)' THEN 'Games'
    WHEN LOWER(establishment_name) ~ '(magazine luiza|magalu|americanas|casas bahia|fast shop|kalunga)' THEN 'Lojas'

    -- DELIVERY
    WHEN LOWER(establishment_name) ~ '(ifood|rappi|uber eats|ze delivery|zé delivery|delivery)' THEN 'Apps de Delivery'
    WHEN LOWER(establishment_name) ~ '(restaurante|churrascaria|outback|coco bambu)' THEN 'Restaurantes'
    WHEN LOWER(establishment_name) ~ '(mcdonald|mcdonalds|burger king|bk|subway|pizza|pizzaria|sushi|japonês|japones)' THEN 'Fast Food'
    WHEN LOWER(establishment_name) ~ '(lanche|hamburger|hamburguer|dog|pastel)' THEN 'Lanches'
    WHEN LOWER(establishment_name) ~ '(bar|choperia|choperia|boteco|pub)' THEN 'Bares'

    -- POUPANÇA
    WHEN LOWER(establishment_name) ~ '(poupanca|poupança|conta poupanca|conta poupança|rendimento|juros)' THEN 'Poupança'

    -- PREVIDÊNCIA
    WHEN LOWER(establishment_name) ~ '(previdencia|previdência|vgbl|pgbl|aposentadoria|inss)' THEN 'Previdência'

    -- INVESTIMENTOS
    WHEN LOWER(establishment_name) ~ '(investimento|acao|ação|fundo|tesouro direto|cdb|lci|lca|renda fixa|corretora|clear|xp|rico|btg|nuinvest)' THEN 'Investimentos'

    -- CARTÃO DE CRÉDITO
    WHEN LOWER(establishment_name) ~ '(cartao|cartão|credito|crédito|nubank|inter|c6|banco do brasil|bradesco|itau|itaú|santander|caixa|fatura|pagamento cartao|pagamento cartão)' THEN 'Cartão de Crédito'

    -- EMPRÉSTIMOS
    WHEN LOWER(establishment_name) ~ '(emprestimo|empréstimo|financeira|credito pessoal|crédito pessoal)' THEN 'Empréstimos'

    -- FINANCIAMENTOS
    WHEN LOWER(establishment_name) ~ '(financiamento|consorcio|consórcio|prestacao|prestação|carro|veiculo|veículo|moto|imovel|imóvel|casa|apartamento)' THEN 'Financiamentos'

    -- OUTROS
    ELSE 'Outros'
  END
WHERE
  -- Apenas recategorizar gastos que estão como 'outros'
  category = 'outros'::expense_category
  OR subcategory = 'Outros';

-- ============================================================================
-- VERIFICAÇÃO: Execute estas queries para confirmar a recategorização
-- ============================================================================

-- Ver gastos recategorizados
SELECT
    establishment_name,
    category,
    subcategory,
    amount,
    date
FROM expenses
ORDER BY created_at DESC;

-- Ver distribuição por categoria e subcategoria
SELECT
    category,
    subcategory,
    COUNT(*) as total_expenses,
    SUM(amount) as total_amount
FROM expenses
GROUP BY category, subcategory
ORDER BY category, total_expenses DESC;
