// Sistema de categorias com SUBCATEGORIAS
// Baseado no documento de especificação: Essenciais, Não Essenciais, Investimentos e Dívidas

export type ExpenseCategory =
  // ESSENCIAIS (Fixas)
  | 'moradia' // Aluguel, condomínio, IPTU, água, luz, gás
  | 'alimentacao_casa' // Supermercado, feira, açougue (compras para casa)
  | 'transporte' // Combustível, transporte público, manutenção
  | 'saude' // Plano de saúde, medicamentos, consultas
  | 'educacao' // Mensalidade, material escolar, cursos
  // NÃO ESSENCIAIS (Variáveis)
  | 'alimentacao_fora' // Restaurantes, delivery, lanches, padaria
  | 'lazer' // Cinema, streaming, hobbies, viagens
  | 'vestuario' // Roupas, calçados, acessórios
  | 'beleza' // Salão, barbearia, produtos de beleza
  | 'eletronicos' // Gadgets, acessórios, games
  | 'pets' // Pet shop, veterinário, ração
  // INVESTIMENTOS
  | 'poupanca' // Poupança
  | 'previdencia' // Previdência privada
  | 'investimentos' // Ações, fundos, renda fixa
  // DÍVIDAS
  | 'cartao_credito' // Fatura do cartão de crédito
  | 'emprestimos' // Empréstimos pessoais
  | 'financiamentos' // Financiamento de veículo, imóvel
  // TRANSFERÊNCIAS
  | 'transferencias' // PIX/TED/DOC para pessoas físicas
  // OUTROS
  | 'outros'; // Gastos não categorizados

export type CategoryType =
  | 'essencial'
  | 'nao_essencial'
  | 'investimento'
  | 'divida'
  | 'transferencia'
  | 'outro';

export interface SubcategoryInfo {
  name: string;
  keywords: string[];
}

export interface CategoryInfo {
  name: string;
  type: CategoryType;
  icon: string;
  iconType?: 'emoji' | 'component';
  color: string;
  description: string;
  subcategories: SubcategoryInfo[];
}

// Função auxiliar para detectar se é um nome de pessoa física
// Detecta padrões comuns: nome próprio + sobrenome(s)
function isPessoaFisica(text: string): boolean {
  const textLower = text.toLowerCase();

  // Indicadores que NÃO é pessoa física (empresas/estabelecimentos)
  const empresaIndicators = [
    'ltda',
    'me',
    'epp',
    'eireli',
    's.a',
    's/a',
    'sa ',
    'sociedade',
    'comercio',
    'comércio',
    'servicos',
    'serviços',
    'supermercado',
    'loja',
    'restaurante',
    'farmacia',
    'farmácia',
    'hospital',
    'clinica',
    'clínica',
    'posto',
    'shopping',
    'mercado',
    'bar',
    'padaria',
    'magazine',
    'distribuidora',
    'atacado',
    'varejo',
    'delivery',
    'ifood',
    'uber',
  ];

  for (const indicator of empresaIndicators) {
    if (textLower.includes(indicator)) {
      return false;
    }
  }

  // Remover palavras comuns de transação para análise
  const cleanText = text
    .replace(/pix/gi, '')
    .replace(/transferencia|transferência/gi, '')
    .replace(/enviado|recebido|para|de/gi, '')
    .trim();

  // Verificar se tem formato de nome de pessoa (2-4 palavras)
  const words = cleanText.split(/\s+/).filter((w) => w.length > 1);

  // Nome de pessoa geralmente tem entre 2 e 4 palavras
  // e cada palavra tem entre 2 e 15 caracteres
  // Também verifica se começa com letra maiúscula (padrão de nome próprio)
  if (words.length >= 2 && words.length <= 4) {
    const allWordsValidLength = words.every(
      (w) => w.length >= 2 && w.length <= 15
    );

    // Verificar se a maioria das palavras começa com maiúscula (nome próprio)
    const capitalizedWords = words.filter((w) => /^[A-Z]/.test(w));
    const mostlyCapitalized = capitalizedWords.length >= words.length * 0.5;

    return allWordsValidLength && mostlyCapitalized;
  }

  return false;
}

// Função auxiliar para detectar subcategoria baseada no nome do estabelecimento
function detectSubcategory(
  establishmentName: string,
  subcategories: SubcategoryInfo[]
): string | null {
  const nameLower = establishmentName.toLowerCase();

  for (const subcategory of subcategories) {
    // Pular subcategorias sem keywords (como "Outros")
    if (subcategory.keywords.length === 0) continue;

    for (const keyword of subcategory.keywords) {
      const keywordLower = keyword.toLowerCase();

      // Usar includes para busca mais flexível
      // Isso funciona melhor com textos complexos e espaços
      if (nameLower.includes(keywordLower)) {
        return subcategory.name;
      }
    }
  }

  return null;
}

// Mapeamento de categorias com subcategorias
export const CATEGORIES: Record<ExpenseCategory, CategoryInfo> = {
  // ===== ESSENCIAIS =====
  moradia: {
    name: 'Moradia',
    type: 'essencial',
    description:
      'Aluguel, condomínio, IPTU, água, luz, gás, internet, telefone',
    icon: 'house',
    iconType: 'component',
    color: '#FF6B6B',
    subcategories: [
      {
        name: 'Energia',
        keywords: [
          'energia',
          'luz',
          'eletricidade',
          'enel',
          'coel',
          'celpe',
          'equatorial',
          'cemig',
          'copel',
          'elektro',
          'light',
          'cosern',
          'celg',
          'ceee',
          'energetica',
          'energética',
          'eletrica',
          'elétrica',
          'companhia energetica',
          'companhia energética',
          'cia energetica',
          'cia energética',
          'companhia',
        ],
      },
      {
        name: 'Água',
        keywords: [
          'agua',
          'água',
          'saneamento',
          'esgoto',
          'esgto',
          'cagece',
          'sabesp',
          'embasa',
          'cedae',
          'caesb',
          'sanepar',
          'cia ag',
          'cia agua',
          'cia água',
        ],
      },
      {
        name: 'Gás',
        keywords: ['gas', 'gás', 'ultragaz', 'comgas'],
      },
      {
        name: 'Aluguel',
        keywords: ['aluguel'],
      },
      {
        name: 'Condomínio',
        keywords: ['condominio', 'condomínio'],
      },
      {
        name: 'IPTU',
        keywords: ['iptu'],
      },
      {
        name: 'Internet',
        keywords: [
          'internet',
          'vivo',
          'claro',
          'tim',
          'oi',
          'brisanet',
          'mob',
          'multiplay',
          'net',
          'fibra',
          'telecom',
        ],
      },
      {
        name: 'Telefone',
        keywords: ['telefone', 'celular', 'móvel', 'movel'],
      },
      {
        name: 'Seguro',
        keywords: [
          'seguro fianca',
          'seguro fiança',
          'seguro residencial',
          'seguro',
        ],
      },
    ],
  },

  alimentacao_casa: {
    name: 'Alimentação (Casa)',
    type: 'essencial',
    description: 'Supermercado, feira, açougue - compras para casa',
    icon: 'shopping-basket',
    iconType: 'component',
    color: '#4ECDC4',
    subcategories: [
      {
        name: 'Supermercado',
        keywords: [
          'supermercado',
          'supermercados',
          'carrefour',
          'pao de acucar',
          'pão de açúcar',
          'extra',
          'walmart',
          'big',
          'cometa',
          'sao luiz',
          'são luiz',
          'bh',
          'guanabara',
          'zona sul',
          'mundial',
          'rede economia',
          'epa',
          'santa luzia',
          'super',
          'market',
          'hiper',
          'wms',
        ],
      },
      {
        name: 'Atacadão',
        keywords: [
          'atacadao',
          'atacadão',
          'assai',
          'assaí',
          'makro',
          'maxxi',
          'atack',
        ],
      },
      {
        name: 'Feira',
        keywords: ['feira', 'hortifruti', 'quitanda'],
      },
      {
        name: 'Açougue',
        keywords: ['açougue', 'acougue'],
      },
      {
        name: 'Mercearia',
        keywords: ['mercearia', 'mercadinho', 'mercado'],
      },
    ],
  },

  transporte: {
    name: 'Transporte',
    type: 'essencial',
    description: 'Combustível, transporte público, manutenção',
    icon: 'transporte',
    iconType: 'component',
    color: '#FFD93D',
    subcategories: [
      {
        name: 'Combustível',
        keywords: [
          'posto',
          'gasolina',
          'etanol',
          'diesel',
          'combustivel',
          'combustível',
          'shell',
          'ipiranga',
          'petrobras',
          'ale',
        ],
      },
      {
        name: 'Transporte Público',
        keywords: [
          'metro',
          'metrô',
          'onibus',
          'ônibus',
          'trem',
          'bilhete',
          'recarga',
        ],
      },
      {
        name: 'Aplicativos',
        keywords: ['uber', '99', '99pop', 'taxi', 'táxi'],
      },
      {
        name: 'Estacionamento',
        keywords: [
          'estacionamento',
          'zona azul',
          'sem parar',
          'veloe',
          'estapar',
        ],
      },
      {
        name: 'Manutenção',
        keywords: [
          'mecanica',
          'mecânica',
          'oficina',
          'revisao',
          'revisão',
          'manutencao',
          'manutenção',
          'pneu',
          'oleo',
          'óleo',
        ],
      },
    ],
  },

  saude: {
    name: 'Saúde',
    type: 'essencial',
    description: 'Plano de saúde, medicamentos, consultas',
    icon: 'saude',
    iconType: 'component',
    color: '#FCBAD3',
    subcategories: [
      {
        name: 'Farmácia',
        keywords: [
          'farmacia',
          'farmácia',
          'drogasil',
          'pague menos',
          'extrafarma',
          'drogaria',
          'panvel',
          'droga raia',
          'sao paulo',
          'são paulo',
          'farma',
          'medicamento',
          'remedio',
          'remédio',
          'drog',
        ],
      },
      {
        name: 'Plano de Saúde',
        keywords: [
          'unimed',
          'hapvida',
          'amil',
          'sulamerica',
          'sulamérica',
          'bradesco saude',
          'bradesco saúde',
          'notredame',
          'plano de saude',
          'plano de saúde',
        ],
      },
      {
        name: 'Consulta',
        keywords: [
          'consulta',
          'medico',
          'médico',
          'hospital',
          'clinica',
          'clínica',
        ],
      },
      {
        name: 'Exames',
        keywords: ['laboratorio', 'laboratório', 'exame'],
      },
      {
        name: 'Dentista',
        keywords: ['dentista', 'odontologico', 'odontológico'],
      },
    ],
  },

  educacao: {
    name: 'Educação',
    type: 'essencial',
    description: 'Mensalidade, material escolar, cursos',
    icon: 'educacao',
    iconType: 'component',
    color: '#95E1D3',
    subcategories: [
      {
        name: 'Escola',
        keywords: [
          'escola',
          'colegio',
          'colégio',
          'ensino',
          'educandario',
          'educandário',
        ],
      },
      {
        name: 'Faculdade',
        keywords: [
          'faculdade',
          'Faculdade',
          'FACULDADE',
          'universidade',
          'Universidade',
          'UNIVERSIDADE',
          'centro universitario',
          'centro universitário',
          'Centro Universitario',
          'Centro Universitário',
          'CENTRO UNIVERSITARIO',
          'CENTRO UNIVERSITÁRIO',
          'instituicao de ensino',
          'instituição de ensino',
          'Instituicao de Ensino',
          'Instituição de Ensino',
          'INSTITUICAO DE ENSINO',
          'INSTITUIÇÃO DE ENSINO',
          'instituicao educacional',
          'instituição educacional',
          'Instituicao Educacional',
          'Instituição Educacional',
          'INSTITUICAO EDUCACIONAL',
          'INSTITUIÇÃO EDUCACIONAL',
          'educacional',
          'Educacional',
          'EDUCACIONAL',
          'educacionais',
          'Educacionais',
          'EDUCACIONAIS',
          'uni ',
          'Uni ',
          'UNI ',
          'fac ',
          'Fac ',
          'FAC ',
        ],
      },
      {
        name: 'Curso',
        keywords: ['curso', 'udemy', 'coursera', 'alura', 'rocketseat', 'edx'],
      },
      {
        name: 'Idiomas',
        keywords: [
          'wizard',
          'ccaa',
          'cultura inglesa',
          'duolingo',
          'ingles',
          'inglês',
        ],
      },
      {
        name: 'Material Escolar',
        keywords: [
          'material escolar',
          'livro',
          'apostila',
          'caderno',
          'papelaria',
        ],
      },
      {
        name: 'Reforço',
        keywords: ['kumon', 'reforço', 'reforco'],
      },
    ],
  },

  // ===== NÃO ESSENCIAIS =====
  lazer: {
    name: 'Lazer',
    type: 'nao_essencial',
    description: 'Cinema, streaming, hobbies, viagens',
    icon: 'lazer',
    iconType: 'component',
    color: '#A8D8EA',
    subcategories: [
      {
        name: 'Streaming',
        keywords: [
          'netflix',
          'spotify',
          'amazon prime',
          'disney',
          'hbo',
          'max',
          'globoplay',
          'paramount',
          'apple tv',
          'youtube premium',
        ],
      },
      {
        name: 'Cinema',
        keywords: ['cinema', 'cinemark', 'kinoplex', 'ingresso'],
      },
      {
        name: 'Shows',
        keywords: ['show', 'teatro', 'sympla', 'eventim'],
      },
      {
        name: 'Viagem',
        keywords: [
          'viagem',
          'hotel',
          'pousada',
          'airbnb',
          'passagem',
          'azul',
          'gol',
          'latam',
        ],
      },
      {
        name: 'Academia',
        keywords: ['academia', 'smartfit', 'bodytech', 'natacao', 'natação'],
      },
      {
        name: 'Lazer',
        keywords: [
          'parque',
          'museu',
          'clube',
          'futebol',
          'hobby',
          'jogo',
          'game',
        ],
      },
    ],
  },

  vestuario: {
    name: 'Vestuário',
    type: 'nao_essencial',
    description: 'Roupas, calçados, acessórios',
    icon: 'vestuario',
    iconType: 'component',
    color: '#FFB6B9',
    subcategories: [
      {
        name: 'Roupas',
        keywords: [
          'renner',
          'riachuelo',
          'c&a',
          'zara',
          'hering',
          'marisa',
          'pernambucanas',
          'roupa',
          'camisa',
          'calca',
          'calça',
          'short',
          'vestido',
          'saia',
          'jaqueta',
          'casaco',
        ],
      },
      {
        name: 'Calçados',
        keywords: [
          'calcado',
          'calçado',
          'sapato',
          'tenis',
          'tênis',
          'sandalia',
          'sandália',
          'chinelo',
          'bota',
        ],
      },
      {
        name: 'Acessórios',
        keywords: [
          'bolsa',
          'mochila',
          'carteira',
          'cinto',
          'relogio',
          'relógio',
          'oculo',
          'óculos',
        ],
      },
    ],
  },

  beleza: {
    name: 'Beleza',
    type: 'nao_essencial',
    description: 'Salão, barbearia, produtos de beleza',
    icon: 'beleza',
    iconType: 'component',
    color: '#E0BBE4',
    subcategories: [
      {
        name: 'Salão',
        keywords: [
          'salao',
          'salão',
          'cabelereiro',
          'cabeleireiro',
          'manicure',
          'pedicure',
        ],
      },
      {
        name: 'Barbearia',
        keywords: ['barbearia', 'barbeiro'],
      },
      {
        name: 'Estética',
        keywords: [
          'estetica',
          'estética',
          'spa',
          'massagem',
          'depilacao',
          'depilação',
        ],
      },
      {
        name: 'Cosméticos',
        keywords: [
          'cosmetico',
          'cosmético',
          'maquiagem',
          'perfume',
          'perfumaria',
          'boticario',
          'boticário',
          'natura',
          'avon',
          'sephora',
          'mac',
          'loreal',
        ],
      },
    ],
  },

  eletronicos: {
    name: 'Eletrônicos',
    type: 'nao_essencial',
    description: 'Gadgets, acessórios, games',
    icon: 'eletronicos',
    iconType: 'component',
    color: '#C5E1A5',
    subcategories: [
      {
        name: 'Smartphones',
        keywords: [
          'apple',
          'samsung',
          'xiaomi',
          'motorola',
          'iphone',
          'galaxy',
          'celular',
        ],
      },
      {
        name: 'Computadores',
        keywords: ['notebook', 'computador', 'pc', 'tablet', 'ipad', 'macbook'],
      },
      {
        name: 'Acessórios',
        keywords: ['fone', 'airpods', 'mouse', 'teclado', 'monitor', 'cabo'],
      },
      {
        name: 'Games',
        keywords: ['playstation', 'xbox', 'nintendo', 'steam', 'game', 'jogo'],
      },
      {
        name: 'Lojas',
        keywords: [
          'magazine luiza',
          'magalu',
          'americanas',
          'casas bahia',
          'fast shop',
          'kabum',
          'pichau',
        ],
      },
    ],
  },

  pets: {
    name: 'Pets',
    type: 'nao_essencial',
    description: 'Pet shop, veterinário, ração, acessórios para animais',
    icon: 'pets',
    iconType: 'component',
    color: '#8D6E63',
    subcategories: [
      {
        name: 'Alimentação Pet',
        keywords: ['racao', 'ração', 'petisco', 'sachê', 'sache'],
      },
      {
        name: 'Pet Shop',
        keywords: [
          'pet shop',
          'petshop',
          'petz',
          'cobasi',
          'petland',
          'pet center',
          'casa dos bichos',
        ],
      },
      {
        name: 'Veterinário',
        keywords: [
          'veterinario',
          'veterinário',
          'vet',
          'clinica veterinaria',
          'clínica veterinária',
          'hospital pet',
          'hospital veterinario',
          'hospital veterinário',
        ],
      },
      {
        name: 'Acessórios Pet',
        keywords: ['coleira', 'brinquedo pet', 'cama pet', 'casinha pet'],
      },
    ],
  },

  alimentacao_fora: {
    name: 'Alimentação (Fora)',
    type: 'nao_essencial',
    description:
      'Restaurantes, delivery, lanches, padaria para consumo imediato',
    icon: 'restaurant',
    iconType: 'component',
    color: '#AA96DA',
    subcategories: [
      {
        name: 'Apps de Entrega',
        keywords: [
          'ifood',
          'rappi',
          'uber eats',
          'ze delivery',
          'zé delivery',
          'delivery',
        ],
      },
      {
        name: 'Restaurantes',
        keywords: [
          'restaurante',
          'churrascaria',
          'outback',
          'coco bambu',
          'madero',
          'giraffa',
          'applebees',
          'comida japonesa',
          'sushi',
          'temaki',
        ],
      },
      {
        name: 'Fast Food',
        keywords: [
          'mcdonald',
          'mcdonalds',
          'burger king',
          'bk',
          'subway',
          'habib',
          'burger',
          'burguer',
          'pizza hut',
          'domino',
          'bobs',
          'giraffa',
          'spoleto',
          'gendai',
        ],
      },
      {
        name: 'Lanches',
        keywords: [
          'lanchonete',
          'hamburgueria',
          'pizzaria',
          'pizza',
          'china in box',
          'lanche',
          'lanches',
          'pastel',
          'pastelaria',
          'espetinho',
          'açaí',
          'acai',
          'hot dog',
          'cachorro quente',
        ],
      },
      {
        name: 'Padaria/Café',
        keywords: [
          'padaria',
          'cafe',
          'café',
          'cafeteria',
          'starbucks',
          'coffee',
          'confeitaria',
        ],
      },
      {
        name: 'Bares',
        keywords: ['bar', 'pub', 'boteco', 'cervejaria'],
      },
      {
        name: 'Sorveteria',
        keywords: ['sorvete', 'sorveteria', 'gelato', 'açaí', 'acai'],
      },
    ],
  },

  // ===== INVESTIMENTOS =====
  poupanca: {
    name: 'Poupança',
    type: 'investimento',
    description: 'Depósitos em poupança',
    icon: 'poupanca',
    iconType: 'component',
    color: '#81C784',
    subcategories: [
      {
        name: 'Poupança',
        keywords: ['poupanca', 'poupança', 'caderneta'],
      },
    ],
  },

  previdencia: {
    name: 'Previdência',
    type: 'investimento',
    description: 'Previdência privada (PGBL, VGBL)',
    icon: 'previdencia',
    iconType: 'component',
    color: '#64B5F6',
    subcategories: [
      {
        name: 'Previdência',
        keywords: [
          'previdencia',
          'previdência',
          'pgbl',
          'vgbl',
          'aposentadoria',
          'prev',
        ],
      },
    ],
  },

  investimentos: {
    name: 'Investimentos',
    type: 'investimento',
    description: 'Ações, fundos, renda fixa, CDB, tesouro',
    icon: 'investimentos',
    iconType: 'component',
    color: '#4DB6AC',
    subcategories: [
      {
        name: 'Ações',
        keywords: ['acao', 'ação', 'acoes', 'ações', 'bolsa', 'b3'],
      },
      {
        name: 'Fundos',
        keywords: ['fundo', 'fundos'],
      },
      {
        name: 'Renda Fixa',
        keywords: [
          'cdb',
          'lci',
          'lca',
          'tesouro',
          'renda fixa',
          'titulo',
          'título',
        ],
      },
      {
        name: 'Corretora',
        keywords: [
          'xp investimentos',
          'clear corretora',
          'rico corretora',
          'inter investimentos',
          'nubank investimentos',
          'btg investimentos',
          'investimento',
          'corretora',
          'aplicacao',
          'aplicação',
        ],
      },
    ],
  },

  // ===== DÍVIDAS =====
  cartao_credito: {
    name: 'Cartão de Crédito',
    type: 'divida',
    description: 'Fatura do cartão de crédito',
    icon: 'cartao',
    iconType: 'component',
    color: '#EF5350',
    subcategories: [
      {
        name: 'Cartão',
        keywords: [
          'cartao',
          'cartão',
          'credito',
          'crédito',
          'fatura',
          'pagamento cartao',
          'pagamento cartão',
          'pgto cartao',
          'pgto cartão',
          'pag cartao',
          'pag cartão',
          'nubank',
          'inter',
          'c6',
          'itau',
          'itaú',
          'bradesco',
          'santander',
          'banco do brasil',
          'caixa',
          'visa',
          'mastercard',
          'elo',
          'amex',
          'american express',
          'neon',
          'picpay',
          'mercado pago',
          'will bank',
          'digio',
          'next',
        ],
      },
    ],
  },

  emprestimos: {
    name: 'Empréstimos',
    type: 'divida',
    description: 'Empréstimos pessoais e consignados',
    icon: 'emprestimos',
    iconType: 'component',
    color: '#FF7043',
    subcategories: [
      {
        name: 'Empréstimo',
        keywords: [
          'emprestimo',
          'empréstimo',
          'credito pessoal',
          'crédito pessoal',
          'consignado',
          'refinanciamento',
          'picpay emprestimo',
          'empréstimo pessoal',
        ],
      },
    ],
  },

  financiamentos: {
    name: 'Financiamentos',
    type: 'divida',
    description: 'Financiamento de veículo, imóvel',
    icon: 'financiamentos',
    iconType: 'component',
    color: '#FF8A65',
    subcategories: [
      {
        name: 'Veículo',
        keywords: ['carro financiado', 'veiculo financiado'],
      },
      {
        name: 'Imóvel',
        keywords: ['imovel financiado', 'imóvel financiado', 'casa financiada'],
      },
      {
        name: 'Financiamento',
        keywords: [
          'financiamento',
          'prestacao',
          'prestação',
          'parcela',
          'consorcio',
          'consórcio',
        ],
      },
    ],
  },

  transferencias: {
    name: 'Transferencias',
    type: 'transferencia',
    description: 'PIX, TED e DOC para pessoas fisicas',
    icon: 'transferencias',
    iconType: 'component',
    color: '#26C6DA',
    subcategories: [
      {
        name: 'PIX Pessoa Fisica',
        keywords: [], // Detectado via lógica especial
      },
      {
        name: 'TED/DOC',
        keywords: ['ted', 'doc', 'transferencia bancaria'],
      },
    ],
  },

  // ===== OUTROS =====
  outros: {
    name: 'Outros',
    type: 'outro',
    description: 'Gastos não categorizados',
    icon: 'outros',
    iconType: 'component',
    color: '#B0BEC5',
    subcategories: [
      {
        name: 'Outros',
        keywords: [],
      },
    ],
  },
};

// Função para categorizar automaticamente um gasto e retornar a SUBCATEGORIA
export function categorizeExpense(
  establishmentName: string,
  options?: {
    pluggyCategory?: string | null; // Categoria da Pluggy (ex: "Pix", "Transfer")
    receiverName?: string | null; // Nome do recebedor (para PIX enviado)
    payerName?: string | null; // Nome do pagador (para PIX recebido)
  }
): {
  category: ExpenseCategory;
  subcategory: string;
} {
  const nameLower = establishmentName.toLowerCase();

  console.log('[categorizeExpense] Categorizando:', {
    establishmentName,
    pluggyCategory: options?.pluggyCategory,
    receiverName: options?.receiverName,
    payerName: options?.payerName,
  });

  // PRIORIDADE MÁXIMA: Detectar PIX/Transferência para pessoa física
  // Caso 1: Dados da Pluggy (PIX com payment data)
  if (options?.pluggyCategory?.toLowerCase() === 'pix') {
    // PIX enviado: verifica se o receiver é pessoa física
    if (options.receiverName && isPessoaFisica(options.receiverName)) {
      console.log('[categorizeExpense] PIX enviado para pessoa fisica:', {
        category: 'transferencias',
        subcategory: 'PIX Pessoa Fisica',
        receiverName: options.receiverName,
      });

      return {
        category: 'transferencias',
        subcategory: 'PIX Pessoa Fisica',
      };
    }

    // PIX recebido: verifica se o payer é pessoa física
    if (options.payerName && isPessoaFisica(options.payerName)) {
      console.log('[categorizeExpense] PIX recebido de pessoa fisica:', {
        category: 'transferencias',
        subcategory: 'PIX Pessoa Fisica',
        payerName: options.payerName,
      });

      return {
        category: 'transferencias',
        subcategory: 'PIX Pessoa Fisica',
      };
    }
  }

  // Caso 2: Detecção pelo nome do estabelecimento (fallback para quando não há dados da Pluggy)
  if (isPessoaFisica(establishmentName)) {
    const subcategory = nameLower.includes('pix')
      ? 'PIX Pessoa Fisica'
      : 'TED/DOC';

    console.log('[categorizeExpense] Detectado como pessoa fisica pelo nome:', {
      category: 'transferencias',
      subcategory,
    });

    return {
      category: 'transferencias',
      subcategory,
    };
  }

  // Ordem de prioridade: Dívidas > Essenciais > Investimentos > Não Essenciais > Outros
  // IMPORTANTE: alimentacao_fora deve vir ANTES de alimentacao_casa para priorizar
  // detecção de delivery/restaurante antes de supermercado
  const priorityOrder: ExpenseCategory[] = [
    // Dívidas primeiro (mais específico)
    'cartao_credito',
    'emprestimos',
    'financiamentos',
    // Essenciais
    'moradia',
    'alimentacao_casa',
    'transporte',
    'saude',
    'educacao',
    // Investimentos
    'poupanca',
    'previdencia',
    'investimentos',
    // Não Essenciais - alimentacao_fora primeiro para priorizar delivery/restaurante
    'alimentacao_fora',
    'lazer',
    'vestuario',
    'beleza',
    'eletronicos',
    'pets',
    // Outros por último
    'outros',
  ];

  // Percorre todas as categorias em ordem de prioridade
  for (const category of priorityOrder) {
    const info = CATEGORIES[category];

    // Tenta detectar a subcategoria
    const subcategoryName = detectSubcategory(
      establishmentName,
      info.subcategories
    );

    if (subcategoryName) {
      console.log('[categorizeExpense] Match encontrado:', {
        category,
        subcategory: subcategoryName,
      });
      return {
        category: category,
        subcategory: subcategoryName,
      };
    }
  }

  console.log('[categorizeExpense] Nenhum match, retornando "outros"');
  return { category: 'outros', subcategory: 'Outros' };
}

// Função para obter informações de uma categoria
export function getCategoryInfo(category: ExpenseCategory): CategoryInfo {
  return CATEGORIES[category];
}

// Função para agrupar categorias por tipo
export function getCategoriesByType(type: CategoryType): ExpenseCategory[] {
  return Object.entries(CATEGORIES)
    .filter(([_, info]) => info.type === type)
    .map(([category]) => category as ExpenseCategory);
}

// Função para obter todas as categorias essenciais
export function getEssentialCategories(): ExpenseCategory[] {
  return getCategoriesByType('essencial');
}

// Função para obter todas as categorias não essenciais
export function getNonEssentialCategories(): ExpenseCategory[] {
  return getCategoriesByType('nao_essencial');
}

// Função para obter todas as categorias de investimento
export function getInvestmentCategories(): ExpenseCategory[] {
  return getCategoriesByType('investimento');
}

// Função para obter todas as categorias de dívida
export function getDebtCategories(): ExpenseCategory[] {
  return getCategoriesByType('divida');
}
