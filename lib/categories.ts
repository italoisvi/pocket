// Sistema de categorias com SUBCATEGORIAS
// Baseado no documento de especificação: Essenciais, Não Essenciais, Investimentos e Dívidas

export type ExpenseCategory =
  // ESSENCIAIS (Fixas)
  | 'moradia' // Aluguel, condomínio, IPTU, água, luz, gás
  | 'alimentacao' // Supermercado, feira, açougue
  | 'transporte' // Combustível, transporte público, manutenção
  | 'saude' // Plano de saúde, medicamentos, consultas
  | 'educacao' // Mensalidade, material escolar, cursos
  // NÃO ESSENCIAIS (Variáveis)
  | 'lazer' // Cinema, streaming, hobbies, viagens
  | 'vestuario' // Roupas, calçados, acessórios
  | 'beleza' // Salão, barbearia, produtos de beleza
  | 'eletronicos' // Gadgets, acessórios, games
  | 'delivery' // Restaurantes, iFood, Rappi
  // INVESTIMENTOS
  | 'poupanca' // Poupança
  | 'previdencia' // Previdência privada
  | 'investimentos' // Ações, fundos, renda fixa
  // DÍVIDAS
  | 'cartao_credito' // Fatura do cartão de crédito
  | 'emprestimos' // Empréstimos pessoais
  | 'financiamentos' // Financiamento de veículo, imóvel
  // OUTROS
  | 'outros'; // Gastos não categorizados

export type CategoryType =
  | 'essencial'
  | 'nao_essencial'
  | 'investimento'
  | 'divida'
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

      // Usar regex para busca mais precisa com word boundaries
      // Isso evita matches parciais incorretos
      const regex = new RegExp(
        `\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      );

      if (regex.test(establishmentName) || nameLower.includes(keywordLower)) {
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
        ],
      },
      {
        name: 'Água',
        keywords: [
          'agua',
          'água',
          'saneamento',
          'cagece',
          'sabesp',
          'embasa',
          'cedae',
          'caesb',
          'sanepar',
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

  alimentacao: {
    name: 'Alimentação',
    type: 'essencial',
    description: 'Supermercado, feira, açougue',
    icon: 'shopping-basket',
    iconType: 'component',
    color: '#4ECDC4',
    subcategories: [
      {
        name: 'Supermercado',
        keywords: [
          'supermercado',
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
        name: 'Padaria',
        keywords: ['padaria'],
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
        keywords: ['escola', 'colegio', 'colégio'],
      },
      {
        name: 'Faculdade',
        keywords: ['faculdade', 'universidade'],
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

  delivery: {
    name: 'Delivery',
    type: 'nao_essencial',
    description: 'Restaurantes, iFood, Rappi',
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
        ],
      },
      {
        name: 'Bares',
        keywords: ['bar', 'pub'],
      },
      {
        name: 'Cafeterias',
        keywords: ['cafe', 'café', 'starbucks', 'coffee'],
      },
      {
        name: 'Sorveteria',
        keywords: ['sorvete', 'sorveteria', 'gelato'],
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
          'xp',
          'clear',
          'rico',
          'inter',
          'nubank investimentos',
          'btg',
          'investimento',
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
export function categorizeExpense(establishmentName: string): {
  category: ExpenseCategory;
  subcategory: string;
} {
  const nameLower = establishmentName.toLowerCase();

  // Percorre todas as categorias em ordem de prioridade
  for (const [category, info] of Object.entries(CATEGORIES)) {
    // Tenta detectar a subcategoria
    const subcategoryName = detectSubcategory(
      establishmentName,
      info.subcategories
    );

    if (subcategoryName) {
      return {
        category: category as ExpenseCategory,
        subcategory: subcategoryName,
      };
    }
  }

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
