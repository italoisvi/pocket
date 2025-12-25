// Sistema de categorias baseado no documento de especificação
// Organizadas por tipo: Essenciais (fixas), Não Essenciais (variáveis), Investimentos e Dívidas

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

export interface CategoryInfo {
  name: string;
  type: CategoryType;
  keywords: string[];
  icon: string;
  iconType?: 'emoji' | 'component';
  color: string;
  description: string;
}

// Mapeamento de categorias com palavras-chave para classificação automática
export const CATEGORIES: Record<ExpenseCategory, CategoryInfo> = {
  // ===== ESSENCIAIS =====
  moradia: {
    name: 'Moradia',
    type: 'essencial',
    description: 'Aluguel, condomínio, IPTU, água, luz, gás',
    keywords: [
      // Aluguel e condomínio
      'aluguel',
      'condominio',
      'condomínio',
      'iptu',
      'imobiliaria',
      'imobiliária',
      'seguro fianca',
      'seguro fiança',
      // Energia/Luz
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
      // Água
      'agua',
      'água',
      'saneamento',
      'cagece',
      'sabesp',
      'embasa',
      'cedae',
      'caesb',
      'sanepar',
      // Gás
      'gas',
      'gás',
      'ultragaz',
      'comgas',
      // Internet e telefone
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
      'internet',
      'telefone',
    ],
    icon: 'house',
    iconType: 'component',
    color: '#FF6B6B',
  },
  alimentacao: {
    name: 'Alimentação',
    type: 'essencial',
    description: 'Supermercado, feira, açougue',
    keywords: [
      'supermercado',
      'mercadinho',
      'atacadao',
      'atacadão',
      'assai',
      'assaí',
      'carrefour',
      'pao de acucar',
      'pão de açúcar',
      'sao luiz',
      'são luiz',
      'extra',
      'walmart',
      'big',
      'cometa',
      'hortifruti',
      'mercearia',
      'mercado',
      'feira',
      'açougue',
      'acougue',
      'padaria',
      'quitanda',
    ],
    icon: 'shopping-basket',
    iconType: 'component',
    color: '#4ECDC4',
  },
  transporte: {
    name: 'Transporte',
    type: 'essencial',
    description: 'Combustível, transporte público, manutenção',
    keywords: [
      // Combustível
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
      // Transporte público
      'metro',
      'metrô',
      'onibus',
      'ônibus',
      'trem',
      'bilhete',
      'recarga',
      // Estacionamento
      'estacionamento',
      'zona azul',
      'sem parar',
      'veloe',
      // Manutenção
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
    icon: '🚗',
    color: '#FFD93D',
  },
  saude: {
    name: 'Saúde',
    type: 'essencial',
    description: 'Plano de saúde, medicamentos, consultas',
    keywords: [
      'farmacia',
      'farmácia',
      'drogasil',
      'pague menos',
      'extrafarma',
      'drogaria',
      'panvel',
      'droga raia',
      'unimed',
      'hapvida',
      'amil',
      'sulamerica',
      'sulamérica',
      'bradesco saude',
      'bradesco saúde',
      'notredame',
      'laboratorio',
      'laboratório',
      'consulta',
      'medico',
      'médico',
      'hospital',
      'clinica',
      'clínica',
      'dentista',
      'odontologico',
      'odontológico',
      'plano de saude',
      'plano de saúde',
      'exame',
      'medicamento',
    ],
    icon: '⚕️',
    color: '#FCBAD3',
  },
  educacao: {
    name: 'Educação',
    type: 'essencial',
    description: 'Mensalidade, material escolar, cursos',
    keywords: [
      'escola',
      'colegio',
      'colégio',
      'faculdade',
      'universidade',
      'curso',
      'mensalidade',
      'matricula',
      'matrícula',
      'material escolar',
      'livro',
      'apostila',
      'udemy',
      'coursera',
      'alura',
      'rocketseat',
      'edx',
      'duolingo',
      'wizard',
      'ccaa',
      'cultura inglesa',
      'kumon',
    ],
    icon: '📚',
    color: '#95E1D3',
  },

  // ===== NÃO ESSENCIAIS =====
  lazer: {
    name: 'Lazer',
    type: 'nao_essencial',
    description: 'Cinema, streaming, hobbies, viagens',
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
      'cinema',
      'cinemark',
      'kinoplex',
      'ingresso',
      'sympla',
      'eventim',
      'show',
      'teatro',
      'parque',
      'museu',
      'clube',
      'academia',
      'smartfit',
      'bodytech',
      'natacao',
      'natação',
      'futebol',
      'hobby',
      'viagem',
      'hotel',
      'pousada',
      'airbnb',
      'passagem',
      'azul',
      'gol',
      'latam',
    ],
    icon: '🎮',
    color: '#A8D8EA',
  },
  vestuario: {
    name: 'Vestuário',
    type: 'nao_essencial',
    description: 'Roupas, calçados, acessórios',
    keywords: [
      'renner',
      'riachuelo',
      'c&a',
      'zara',
      'hering',
      'marisa',
      'pernambucanas',
      'roupa',
      'calcado',
      'calçado',
      'sapato',
      'tenis',
      'tênis',
      'sandalia',
      'sandália',
      'chinelo',
      'bota',
      'camisa',
      'calca',
      'calça',
      'short',
      'vestido',
      'saia',
      'jaqueta',
      'casaco',
      'bolsa',
      'mochila',
      'carteira',
      'cinto',
      'relogio',
      'relógio',
      'oculo',
      'óculos',
    ],
    icon: '👔',
    color: '#FFB6B9',
  },
  beleza: {
    name: 'Beleza',
    type: 'nao_essencial',
    description: 'Salão, barbearia, produtos de beleza',
    keywords: [
      'salao',
      'salão',
      'barbearia',
      'cabelereiro',
      'cabeleireiro',
      'manicure',
      'pedicure',
      'estetica',
      'estética',
      'spa',
      'massagem',
      'depilacao',
      'depilação',
      'maquiagem',
      'cosmetico',
      'cosmético',
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
    icon: '💄',
    color: '#E0BBE4',
  },
  eletronicos: {
    name: 'Eletrônicos',
    type: 'nao_essencial',
    description: 'Gadgets, acessórios, games',
    keywords: [
      'apple',
      'samsung',
      'xiaomi',
      'motorola',
      'iphone',
      'galaxy',
      'notebook',
      'computador',
      'pc',
      'tablet',
      'ipad',
      'fone',
      'airpods',
      'mouse',
      'teclado',
      'monitor',
      'playstation',
      'xbox',
      'nintendo',
      'steam',
      'game',
      'jogo',
      'magazine luiza',
      'magalu',
      'americanas',
      'casas bahia',
      'fast shop',
      'kabum',
      'pichau',
    ],
    icon: '💻',
    color: '#C5E1A5',
  },
  delivery: {
    name: 'Delivery',
    type: 'nao_essencial',
    description: 'Restaurantes, iFood, Rappi',
    keywords: [
      'ifood',
      'rappi',
      'uber eats',
      'ze delivery',
      'zé delivery',
      'delivery',
      'restaurante',
      'lanchonete',
      'bar',
      'pub',
      'churrascaria',
      'pizzaria',
      'hamburgueria',
      'burger',
      'burguer',
      'mcdonald',
      'mcdonalds',
      'burger king',
      'bk',
      'subway',
      'habib',
      'china in box',
      'pizza hut',
      'domino',
      'outback',
      'coco bambu',
      'cafe',
      'café',
      'starbucks',
      'coffee',
      'sorvete',
      'sorveteria',
    ],
    icon: 'restaurant',
    iconType: 'component',
    color: '#AA96DA',
  },

  // ===== INVESTIMENTOS =====
  poupanca: {
    name: 'Poupança',
    type: 'investimento',
    description: 'Depósitos em poupança',
    keywords: ['poupanca', 'poupança', 'caderneta'],
    icon: '🐷',
    color: '#81C784',
  },
  previdencia: {
    name: 'Previdência',
    type: 'investimento',
    description: 'Previdência privada (PGBL, VGBL)',
    keywords: [
      'previdencia',
      'previdência',
      'pgbl',
      'vgbl',
      'aposentadoria',
      'prev',
    ],
    icon: '🏦',
    color: '#64B5F6',
  },
  investimentos: {
    name: 'Investimentos',
    type: 'investimento',
    description: 'Ações, fundos, renda fixa, CDB, tesouro',
    keywords: [
      'investimento',
      'acao',
      'ação',
      'acoes',
      'ações',
      'fundo',
      'cdb',
      'lci',
      'lca',
      'tesouro',
      'renda fixa',
      'bolsa',
      'b3',
      'xp',
      'clear',
      'rico',
      'inter',
      'nubank investimentos',
      'btg',
    ],
    icon: '📈',
    color: '#4DB6AC',
  },

  // ===== DÍVIDAS =====
  cartao_credito: {
    name: 'Cartão de Crédito',
    type: 'divida',
    description: 'Fatura do cartão de crédito',
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
    icon: '💳',
    color: '#EF5350',
  },
  emprestimos: {
    name: 'Empréstimos',
    type: 'divida',
    description: 'Empréstimos pessoais e consignados',
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
    icon: '💰',
    color: '#FF7043',
  },
  financiamentos: {
    name: 'Financiamentos',
    type: 'divida',
    description: 'Financiamento de veículo, imóvel',
    keywords: [
      'financiamento',
      'prestacao',
      'prestação',
      'parcela',
      'consorcio',
      'consórcio',
      'carro financiado',
      'imovel financiado',
      'imóvel financiado',
      'casa financiada',
    ],
    icon: '🏠',
    color: '#FF8A65',
  },

  // ===== OUTROS =====
  outros: {
    name: 'Outros',
    type: 'outro',
    description: 'Gastos não categorizados',
    keywords: [],
    icon: '📦',
    color: '#B0BEC5',
  },
};

// Função para categorizar automaticamente um gasto baseado no nome do estabelecimento
export function categorizeExpense(establishmentName: string): ExpenseCategory {
  const nameLower = establishmentName.toLowerCase();

  // Percorre todas as categorias em ordem de prioridade
  for (const [category, info] of Object.entries(CATEGORIES)) {
    for (const keyword of info.keywords) {
      if (nameLower.includes(keyword.toLowerCase())) {
        return category as ExpenseCategory;
      }
    }
  }

  return 'outros';
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
