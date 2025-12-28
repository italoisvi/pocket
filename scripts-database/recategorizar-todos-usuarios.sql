-- ============================================================================
-- Script para Recategorizar Todos os Gastos de Todos os Usuários
-- ============================================================================
-- IMPORTANTE: Execute este script no Supabase SQL Editor
-- Este script recategoriza TODOS os gastos de TODOS os usuários baseado
-- no establishment_name, garantindo que as subcategorias sejam detectadas
-- corretamente para contas novas e antigas.
-- ============================================================================

-- Recategorizar todos os gastos baseado no establishment_name
UPDATE expenses
SET
  category = CASE
    -- MORADIA (Essencial)
    WHEN LOWER(establishment_name) ~ '(energia|energetica|energética|luz|enel|cemig|light|copel|celpe|coelba|eletrobras|elektro|energisa|cpfl|companhia energetica|cia energetica|coel|equatorial|cosern|celg|ceee|eletrica|elétrica)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(agua|água|sabesp|cagece|caesb|copasa|sanepar|cedae|embasa|companhia de agua|saneamento)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(gas|gás|ultragaz|liquigas|supergasbrás|nacional gás|comgas|copagaz)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(aluguel)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(condominio|condomínio)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(iptu)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(internet|vivo fibra|claro internet|tim internet|oi fibra|net|sky|telefonica|brisanet|mob|multiplay|fibra|telecom)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(telefone|celular|móvel|movel)' THEN 'moradia'::expense_category
    WHEN LOWER(establishment_name) ~ '(seguro fianca|seguro fiança|seguro residencial|seguro)' THEN 'moradia'::expense_category

    -- ALIMENTAÇÃO (Essencial)
    WHEN LOWER(establishment_name) ~ '(supermercado|carrefour|pao de acucar|pão de açúcar|extra|walmart|big|cometa|sao luiz|são luiz|guanabara|zona sul|mundial|rede economia|epa|santa luzia|super|market|hiper)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(atacadao|atacadão|assai|assaí|makro|maxxi|atack)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(feira|hortifruti|quitanda)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(açougue|acougue)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(padaria)' THEN 'alimentacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(mercearia|mercadinho|mercado)' THEN 'alimentacao'::expense_category

    -- TRANSPORTE (Essencial)
    WHEN LOWER(establishment_name) ~ '(posto|gasolina|etanol|diesel|combustivel|combustível|shell|ipiranga|petrobras|ale)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(onibus|ônibus|metro|metrô|trem|bilhete unico|bilhete único)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(uber|99|taxi|táxi|cabify)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(estacionamento)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(oficina|mecanico|mecânico|manutencao|manutenção|automovel)' THEN 'transporte'::expense_category
    WHEN LOWER(establishment_name) ~ '(seguro auto|seguro carro|seguro veiculo|seguro veículo|ipva)' THEN 'transporte'::expense_category

    -- SAÚDE (Essencial)
    WHEN LOWER(establishment_name) ~ '(farmacia|farmácia|drogasil|pague menos|extrafarma|drogaria|panvel|droga raia|sao paulo|são paulo|farma|medicamento|remedio|remédio|drog)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(unimed|hapvida|amil|sulamerica|sulamérica|bradesco saude|bradesco saúde|notredame|plano de saude|plano de saúde)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(consulta|medico|médico|hospital|clinica|clínica)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(laboratorio|laboratório|exame)' THEN 'saude'::expense_category
    WHEN LOWER(establishment_name) ~ '(dentista|odontologico|odontológico)' THEN 'saude'::expense_category

    -- EDUCAÇÃO (Essencial)
    WHEN LOWER(establishment_name) ~ '(escola|colegio|colégio|faculdade|universidade|curso)' THEN 'educacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(livro|livraria|saraiva|cultura)' THEN 'educacao'::expense_category
    WHEN LOWER(establishment_name) ~ '(papelaria|material escolar|caderno)' THEN 'educacao'::expense_category

    -- LAZER (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(cinema|ingresso|filme)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(netflix|spotify|amazon prime|disney|hbo|streaming)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(viagem|hotel|pousada|passagem|aereo|aéreo)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(show|evento|festa|balada)' THEN 'lazer'::expense_category
    WHEN LOWER(establishment_name) ~ '(academia|personal|natacao|natação)' THEN 'lazer'::expense_category

    -- VESTUÁRIO (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(roupa|zara|renner|c&a|riachuelo|marisa)' THEN 'vestuario'::expense_category
    WHEN LOWER(establishment_name) ~ '(calcado|calçado|sapato|tenis|tênis|nike|adidas)' THEN 'vestuario'::expense_category
    WHEN LOWER(establishment_name) ~ '(acessorio|acessório|bolsa|oculos|óculos|relogio|relógio)' THEN 'vestuario'::expense_category

    -- BELEZA (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(cabelo|cabeleireiro|salao|salão|barbearia|barber)' THEN 'beleza'::expense_category
    WHEN LOWER(establishment_name) ~ '(estetica|estética|spa|massagem|depilacao|depilação)' THEN 'beleza'::expense_category
    WHEN LOWER(establishment_name) ~ '(cosmetico|cosmético|maquiagem|perfume|perfumaria|boticario|boticário|natura|avon|sephora|mac|loreal)' THEN 'beleza'::expense_category

    -- ELETRÔNICOS (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(apple|samsung|xiaomi|motorola|iphone|galaxy|celular)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(notebook|computador|pc|tablet|ipad|macbook)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(fone|airpods|mouse|teclado|monitor|cabo)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(playstation|xbox|nintendo|steam|game|jogo)' THEN 'eletronicos'::expense_category
    WHEN LOWER(establishment_name) ~ '(magazine luiza|magalu|americanas|casas bahia|fast shop|kabum|pichau)' THEN 'eletronicos'::expense_category

    -- DELIVERY (Não Essencial)
    WHEN LOWER(establishment_name) ~ '(ifood|rappi|uber eats|ze delivery|zé delivery|delivery)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(restaurante|churrascaria|outback|coco bambu|madero|giraffa|applebees|comida japonesa|sushi|temaki)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(mcdonald|mcdonalds|burger king|bk|subway|habib|burger|burguer|pizza hut|domino|bobs|spoleto|gendai)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(lanchonete|hamburgueria|pizzaria|pizza|china in box|lanche|lanches|pastel|pastelaria|espetinho)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(bar|pub)' THEN 'delivery'::expense_category
    WHEN LOWER(establishment_name) ~ '(cafe|café|cafeteria|padoca|confeitaria)' THEN 'delivery'::expense_category

    -- POUPANÇA (Investimento)
    WHEN LOWER(establishment_name) ~ '(poupanca|poupança|reserva|emergencia|emergência)' THEN 'poupanca'::expense_category

    -- PREVIDÊNCIA (Investimento)
    WHEN LOWER(establishment_name) ~ '(previdencia|previdência|vgbl|pgbl)' THEN 'previdencia'::expense_category

    -- INVESTIMENTOS (Investimento)
    WHEN LOWER(establishment_name) ~ '(acoes|ações|bolsa|b3|corretora|xp|clear|rico|btg)' THEN 'investimentos'::expense_category
    WHEN LOWER(establishment_name) ~ '(fii|fundos imobiliarios|fundos imobiliários|cdb|lci|lca)' THEN 'investimentos'::expense_category

    -- CARTÃO DE CRÉDITO (Dívida)
    WHEN LOWER(establishment_name) ~ '(cartao|cartão|credito|crédito|fatura)' THEN 'cartao_credito'::expense_category

    -- EMPRÉSTIMOS (Dívida)
    WHEN LOWER(establishment_name) ~ '(emprestimo|empréstimo|credito pessoal|crédito pessoal)' THEN 'emprestimos'::expense_category

    -- FINANCIAMENTOS (Dívida)
    WHEN LOWER(establishment_name) ~ '(financiamento|carro|veiculo|veículo|moto|imovel|imóvel|casa|apartamento)' THEN 'financiamentos'::expense_category

    -- OUTROS (padrão)
    ELSE 'outros'::expense_category
  END,

  subcategory = CASE
    -- MORADIA
    WHEN LOWER(establishment_name) ~ '(energia|energetica|energética|luz|enel|cemig|light|copel|celpe|coelba|eletrobras|elektro|energisa|cpfl|companhia energetica|cia energetica|coel|equatorial|cosern|celg|ceee|eletrica|elétrica)' THEN 'Energia'
    WHEN LOWER(establishment_name) ~ '(agua|água|sabesp|cagece|caesb|copasa|sanepar|cedae|embasa|companhia de agua|saneamento)' THEN 'Água'
    WHEN LOWER(establishment_name) ~ '(gas|gás|ultragaz|liquigas|supergasbrás|nacional gás|comgas|copagaz)' THEN 'Gás'
    WHEN LOWER(establishment_name) ~ '(aluguel)' THEN 'Aluguel'
    WHEN LOWER(establishment_name) ~ '(condominio|condomínio)' THEN 'Condomínio'
    WHEN LOWER(establishment_name) ~ '(iptu)' THEN 'IPTU'
    WHEN LOWER(establishment_name) ~ '(internet|vivo fibra|claro internet|tim internet|oi fibra|net|sky|telefonica|brisanet|mob|multiplay|fibra|telecom)' THEN 'Internet'
    WHEN LOWER(establishment_name) ~ '(telefone|celular|móvel|movel)' THEN 'Telefone'
    WHEN LOWER(establishment_name) ~ '(seguro fianca|seguro fiança|seguro residencial|seguro)' THEN 'Seguro'

    -- ALIMENTAÇÃO
    WHEN LOWER(establishment_name) ~ '(supermercado|carrefour|pao de acucar|pão de açúcar|extra|walmart|big|cometa|sao luiz|são luiz|guanabara|zona sul|mundial|rede economia|epa|santa luzia|super|market|hiper)' THEN 'Supermercado'
    WHEN LOWER(establishment_name) ~ '(atacadao|atacadão|assai|assaí|makro|maxxi|atack)' THEN 'Atacadão'
    WHEN LOWER(establishment_name) ~ '(feira|hortifruti|quitanda)' THEN 'Feira'
    WHEN LOWER(establishment_name) ~ '(açougue|acougue)' THEN 'Açougue'
    WHEN LOWER(establishment_name) ~ '(padaria)' THEN 'Padaria'
    WHEN LOWER(establishment_name) ~ '(mercearia|mercadinho|mercado)' THEN 'Mercearia'

    -- TRANSPORTE
    WHEN LOWER(establishment_name) ~ '(posto|gasolina|etanol|diesel|combustivel|combustível|shell|ipiranga|petrobras|ale)' THEN 'Combustível'
    WHEN LOWER(establishment_name) ~ '(onibus|ônibus|metro|metrô|trem|bilhete unico|bilhete único)' THEN 'Transporte Público'
    WHEN LOWER(establishment_name) ~ '(uber|99|taxi|táxi|cabify)' THEN 'Uber/Táxi'
    WHEN LOWER(establishment_name) ~ '(estacionamento)' THEN 'Estacionamento'
    WHEN LOWER(establishment_name) ~ '(oficina|mecanico|mecânico|manutencao|manutenção|automovel)' THEN 'Manutenção'
    WHEN LOWER(establishment_name) ~ '(seguro auto|seguro carro|seguro veiculo|seguro veículo|ipva)' THEN 'Seguro Auto'

    -- SAÚDE
    WHEN LOWER(establishment_name) ~ '(farmacia|farmácia|drogasil|pague menos|extrafarma|drogaria|panvel|droga raia|sao paulo|são paulo|farma|medicamento|remedio|remédio|drog)' THEN 'Farmácia'
    WHEN LOWER(establishment_name) ~ '(unimed|hapvida|amil|sulamerica|sulamérica|bradesco saude|bradesco saúde|notredame|plano de saude|plano de saúde)' THEN 'Plano de Saúde'
    WHEN LOWER(establishment_name) ~ '(consulta|medico|médico|hospital|clinica|clínica)' THEN 'Consulta'
    WHEN LOWER(establishment_name) ~ '(laboratorio|laboratório|exame)' THEN 'Exames'
    WHEN LOWER(establishment_name) ~ '(dentista|odontologico|odontológico)' THEN 'Dentista'

    -- EDUCAÇÃO
    WHEN LOWER(establishment_name) ~ '(escola|colegio|colégio|faculdade|universidade|curso)' THEN 'Mensalidade'
    WHEN LOWER(establishment_name) ~ '(livro|livraria|saraiva|cultura)' THEN 'Livros'
    WHEN LOWER(establishment_name) ~ '(papelaria|material escolar|caderno)' THEN 'Material Escolar'

    -- LAZER
    WHEN LOWER(establishment_name) ~ '(cinema|ingresso|filme)' THEN 'Cinema'
    WHEN LOWER(establishment_name) ~ '(netflix|spotify|amazon prime|disney|hbo|streaming)' THEN 'Streaming'
    WHEN LOWER(establishment_name) ~ '(viagem|hotel|pousada|passagem|aereo|aéreo)' THEN 'Viagem'
    WHEN LOWER(establishment_name) ~ '(show|evento|festa|balada)' THEN 'Eventos'
    WHEN LOWER(establishment_name) ~ '(academia|personal|natacao|natação)' THEN 'Academia'

    -- VESTUÁRIO
    WHEN LOWER(establishment_name) ~ '(roupa|zara|renner|c&a|riachuelo|marisa)' THEN 'Roupas'
    WHEN LOWER(establishment_name) ~ '(calcado|calçado|sapato|tenis|tênis|nike|adidas)' THEN 'Calçados'
    WHEN LOWER(establishment_name) ~ '(acessorio|acessório|bolsa|oculos|óculos|relogio|relógio)' THEN 'Acessórios'

    -- BELEZA
    WHEN LOWER(establishment_name) ~ '(cabelo|cabeleireiro|salao|salão|barbearia|barber)' THEN 'Cabelo'
    WHEN LOWER(establishment_name) ~ '(estetica|estética|spa|massagem|depilacao|depilação)' THEN 'Estética'
    WHEN LOWER(establishment_name) ~ '(cosmetico|cosmético|maquiagem|perfume|perfumaria|boticario|boticário|natura|avon|sephora|mac|loreal)' THEN 'Cosméticos'

    -- ELETRÔNICOS
    WHEN LOWER(establishment_name) ~ '(apple|samsung|xiaomi|motorola|iphone|galaxy|celular)' THEN 'Smartphones'
    WHEN LOWER(establishment_name) ~ '(notebook|computador|pc|tablet|ipad|macbook)' THEN 'Computadores'
    WHEN LOWER(establishment_name) ~ '(fone|airpods|mouse|teclado|monitor|cabo)' THEN 'Acessórios'
    WHEN LOWER(establishment_name) ~ '(playstation|xbox|nintendo|steam|game|jogo)' THEN 'Games'
    WHEN LOWER(establishment_name) ~ '(magazine luiza|magalu|americanas|casas bahia|fast shop|kabum|pichau)' THEN 'Lojas'

    -- DELIVERY
    WHEN LOWER(establishment_name) ~ '(ifood|rappi|uber eats|ze delivery|zé delivery|delivery)' THEN 'Apps de Entrega'
    WHEN LOWER(establishment_name) ~ '(restaurante|churrascaria|outback|coco bambu|madero|giraffa|applebees|comida japonesa|sushi|temaki)' THEN 'Restaurantes'
    WHEN LOWER(establishment_name) ~ '(mcdonald|mcdonalds|burger king|bk|subway|habib|burger|burguer|pizza hut|domino|bobs|spoleto|gendai)' THEN 'Fast Food'
    WHEN LOWER(establishment_name) ~ '(lanchonete|hamburgueria|pizzaria|pizza|china in box|lanche|lanches|pastel|pastelaria|espetinho)' THEN 'Lanches'
    WHEN LOWER(establishment_name) ~ '(bar|pub)' THEN 'Bares'
    WHEN LOWER(establishment_name) ~ '(cafe|café|cafeteria|padoca|confeitaria)' THEN 'Cafeteria'

    -- POUPANÇA
    WHEN LOWER(establishment_name) ~ '(poupanca|poupança|reserva|emergencia|emergência)' THEN 'Poupança'

    -- PREVIDÊNCIA
    WHEN LOWER(establishment_name) ~ '(previdencia|previdência|vgbl|pgbl)' THEN 'Previdência Privada'

    -- INVESTIMENTOS
    WHEN LOWER(establishment_name) ~ '(acoes|ações|bolsa|b3|corretora|xp|clear|rico|btg)' THEN 'Ações'
    WHEN LOWER(establishment_name) ~ '(fii|fundos imobiliarios|fundos imobiliários|cdb|lci|lca)' THEN 'Renda Fixa'

    -- CARTÃO DE CRÉDITO
    WHEN LOWER(establishment_name) ~ '(cartao|cartão|credito|crédito|fatura)' THEN 'Fatura'

    -- EMPRÉSTIMOS
    WHEN LOWER(establishment_name) ~ '(emprestimo|empréstimo|credito pessoal|crédito pessoal)' THEN 'Empréstimo Pessoal'

    -- FINANCIAMENTOS
    WHEN LOWER(establishment_name) ~ '(financiamento|carro|veiculo|veículo|moto|imovel|imóvel|casa|apartamento)' THEN 'Financiamento'

    -- OUTROS
    ELSE 'Outros'
  END;

-- Mostrar resultado
SELECT
  category,
  subcategory,
  COUNT(*) as total_gastos
FROM expenses
GROUP BY category, subcategory
ORDER BY category, subcategory;
