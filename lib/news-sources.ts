// Mapeamento de fontes de notícias para suas logos
// As logos devem estar em assets/news-sources/

import type { ImageSourcePropType } from 'react-native';

// Importar logos das fontes
const sourceLogos: Record<string, ImageSourcePropType> = {
  globo: require('@/assets/news-sources/globo.png'),
  infomoney: require('@/assets/news-sources/infomoney.png'),
  catracalivre: require('@/assets/news-sources/catracalivre.png'),
  terra: require('@/assets/news-sources/terra.png'),
  veja: require('@/assets/news-sources/veja.png'),
  abril: require('@/assets/news-sources/abril.png'),
  observador: require('@/assets/news-sources/observador.jpg'),
  metropoles: require('@/assets/news-sources/metropoles.png'),
  dcm: require('@/assets/news-sources/diariodocentrodomundo.png'),
  ig: require('@/assets/news-sources/ig.png'),
  expresso: require('@/assets/news-sources/expresso.png'),
  congressoemfoco: require('@/assets/news-sources/congressoemfoco.png'),
  bbc: require('@/assets/news-sources/bbc.png'),
  uol: require('@/assets/news-sources/uol.jpg'),
  conjur: require('@/assets/news-sources/conjur.jpg'),
  revistabula: require('@/assets/news-sources/revistabula.png'),
  sputnik: require('@/assets/news-sources/sputnik.png'),
  olhardigital: require('@/assets/news-sources/olhardigital.jpg'),
};

// Mapeamento de nomes de fonte (como vem da API) para chave da logo
const sourceNameMapping: Record<string, string> = {
  // Globo e variações
  Globo: 'globo',
  G1: 'globo',
  'Globo.com': 'globo',

  // InfoMoney
  InfoMoney: 'infomoney',
  Infomoney: 'infomoney',

  // Catraca Livre
  'Catracalivre.com.br': 'catracalivre',
  'Catraca Livre': 'catracalivre',

  // Terra
  'Terra.com.br': 'terra',
  Terra: 'terra',

  // Veja
  Veja: 'veja',
  VEJA: 'veja',

  // Abril (usa logo Veja)
  'Abril.com.br': 'veja',
  Abril: 'veja',
  Exame: 'veja',

  // Observador (Portugal)
  'Observador.pt': 'observador',
  Observador: 'observador',

  // Metrópoles
  'Metropoles.com': 'metropoles',
  Metrópoles: 'metropoles',

  // DCM - Diário do Centro do Mundo
  'Diariodocentrodomundo.com.br': 'dcm',
  'Diário do Centro do Mundo': 'dcm',
  DCM: 'dcm',

  // iG
  'Ig.com.br': 'ig',
  iG: 'ig',
  IG: 'ig',

  // Expresso (Portugal)
  'Expresso.pt': 'expresso',
  Expresso: 'expresso',

  // Congresso em Foco
  'Congressoemfoco.com.br': 'congressoemfoco',
  'Congresso em Foco': 'congressoemfoco',

  // BBC
  'BBC News': 'bbc',
  BBC: 'bbc',
  'BBC Brasil': 'bbc',

  // UOL
  'Uol.com.br': 'uol',
  UOL: 'uol',

  // Conjur
  'Conjur.com.br': 'conjur',
  Conjur: 'conjur',
  ConJur: 'conjur',

  // Revista Bula
  'Revistabula.com': 'revistabula',
  'Revista Bula': 'revistabula',
  RevistaBula: 'revistabula',

  // Sputnik Brasil (vem como "noticiabrasil" da API)
  'Noticiabrasil.com.br': 'sputnik',
  'Noticiabrasil.net.br': 'sputnik',
  noticiabrasil: 'sputnik',
  NoticiaBrasil: 'sputnik',
  'Sputnik Brasil': 'sputnik',

  // Olhar Digital
  'Olhardigital.com.br': 'olhardigital',
  'Olhar Digital': 'olhardigital',
  OlharDigital: 'olhardigital',
};

// Obter a logo de uma fonte pelo nome
export function getSourceLogo(sourceName: string): ImageSourcePropType | null {
  const key = sourceNameMapping[sourceName];
  if (key && sourceLogos[key]) {
    return sourceLogos[key];
  }
  return null;
}

// Verificar se uma fonte tem logo disponível
export function hasSourceLogo(sourceName: string): boolean {
  return sourceNameMapping[sourceName] !== undefined;
}

// Mapeamento de nomes de exibição (para fontes que precisam de nome diferente)
const displayNameMapping: Record<string, string> = {
  'Abril.com.br': 'veja',
  Abril: 'veja',
  'Noticiabrasil.com.br': 'sputnikbrasil',
  'Noticiabrasil.net.br': 'sputnikbrasil',
  noticiabrasil: 'sputnikbrasil',
  NoticiaBrasil: 'sputnikbrasil',
};

// Limpar o nome da fonte removendo sufixos e deixando tudo minúsculo (estilo rede social)
export function cleanSourceName(sourceName: string): string {
  // Verificar se há um nome de exibição específico
  if (displayNameMapping[sourceName]) {
    return displayNameMapping[sourceName];
  }

  return sourceName
    .replace(/\.com\.br$/i, '')
    .replace(/\.net\.br$/i, '')
    .replace(/\.br$/i, '')
    .replace(/\.com$/i, '')
    .replace(/\.pt$/i, '')
    .replace(/\.org$/i, '')
    .replace(/\.net$/i, '')
    .trim()
    .toLowerCase();
}
