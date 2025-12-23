// Categorias de gastos baseadas em melhores práticas de finanças pessoais
export type ExpenseCategory =
  | 'moradia_contas' // Energia, água, gás, condomínio, aluguel, IPTU
  | 'comunicacao' // Internet, telefone, TV
  | 'mercado_casa' // Supermercado, produtos de casa
  | 'saude_farmacia' // Farmácia, plano de saúde, consultas
  | 'transporte' // Combustível, Uber, estacionamento
  | 'alimentacao_delivery' // Restaurantes, iFood, delivery
  | 'lazer_streaming' // Netflix, Spotify, cinema, shows
  | 'compras' // Roupas, eletrônicos, compras online
  | 'outros'; // Outros gastos

export type CategoryType = 'fixed' | 'variable';

export interface CategoryInfo {
  name: string;
  type: CategoryType;
  keywords: string[];
  icon: string;
  iconType?: 'emoji' | 'component';
  color: string;
}

// Mapeamento de categorias com palavras-chave para classificação automática
export const CATEGORIES: Record<ExpenseCategory, CategoryInfo> = {
  moradia_contas: {
    name: 'Moradia & Contas',
    type: 'fixed',
    keywords: [
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
      'companhia',
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
      // Moradia
      'condominio',
      'condomínio',
      'aluguel',
      'iptu',
      'seguro fianca',
      'seguro fiança',
      'imobiliaria',
      'imobiliária',
    ],
    icon: 'house',
    iconType: 'component',
    color: '#FF6B6B',
  },
  comunicacao: {
    name: 'Comunicação',
    type: 'fixed',
    keywords: [
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
    icon: '📱',
    color: '#4ECDC4',
  },
  mercado_casa: {
    name: 'Mercado & Casa',
    type: 'fixed',
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
      'cometa',
      'hortifruti',
      'mercearia',
      'mercado',
      'feira',
      'açougue',
      'acougue',
    ],
    icon: '🛒',
    color: '#95E1D3',
  },
  saude_farmacia: {
    name: 'Saúde & Farmácia',
    type: 'fixed',
    keywords: [
      'farmacia',
      'farmácia',
      'drogasil',
      'pague menos',
      'extrafarma',
      'drogaria',
      'unimed',
      'hapvida',
      'laboratorio',
      'laboratório',
      'consulta',
      'medico',
      'médico',
      'hospital',
      'clinica',
      'clínica',
      'dentista',
      'plano de saude',
      'plano de saúde',
    ],
    icon: '⚕️',
    color: '#FCBAD3',
  },
  transporte: {
    name: 'Transporte',
    type: 'variable',
    keywords: [
      'uber',
      '99',
      '99pop',
      'posto',
      'gasolina',
      'etanol',
      'combustivel',
      'combustível',
      'shell',
      'ipiranga',
      'petrobras',
      'ale',
      'estacionamento',
      'zona azul',
      'sem parar',
      'veloe',
      'taxi',
      'táxi',
      'metro',
      'metrô',
      'onibus',
      'ônibus',
    ],
    icon: '🚗',
    color: '#FFD93D',
  },
  alimentacao_delivery: {
    name: 'Alimentação & Delivery',
    type: 'variable',
    keywords: [
      'ifood',
      'rappi',
      'ze delivery',
      'zé delivery',
      'restaurante',
      'bar',
      'churrascaria',
      'pizzaria',
      'burger',
      'burguer',
      'mcdonald',
      'mcdonalds',
      'burger king',
      'subway',
      'coco bambu',
      'padaria',
      'cafe',
      'café',
      'sorvete',
      'lanchonete',
      'hamburger',
      'hambúrguer',
      'pizza',
      'delivery',
    ],
    icon: 'restaurant',
    iconType: 'component',
    color: '#AA96DA',
  },
  lazer_streaming: {
    name: 'Lazer & Streaming',
    type: 'variable',
    keywords: [
      'netflix',
      'spotify',
      'amazon prime',
      'disney',
      'hbo',
      'globoplay',
      'cinema',
      'ingresso',
      'sympla',
      'eventim',
      'show',
      'teatro',
      'streaming',
      'jogo',
      'game',
    ],
    icon: '🎮',
    color: '#A8D8EA',
  },
  compras: {
    name: 'Compras',
    type: 'variable',
    keywords: [
      'amazon',
      'mercado livre',
      'shopee',
      'shein',
      'magalu',
      'renner',
      'riachuelo',
      'zara',
      'c&a',
      'roupa',
      'calcado',
      'calçado',
      'sapato',
      'tenis',
      'tênis',
      'loja',
    ],
    icon: '🛍️',
    color: '#FFB6B9',
  },
  outros: {
    name: 'Outros',
    type: 'variable',
    keywords: [],
    icon: '📦',
    color: '#C7CEEA',
  },
};

// Função para categorizar automaticamente um gasto baseado no nome do estabelecimento
export function categorizeExpense(establishmentName: string): ExpenseCategory {
  const nameLower = establishmentName.toLowerCase();

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
