export type FeedItemType =
  | 'stock_quote'
  | 'index_quote'
  | 'crypto_quote'
  | 'news'
  | 'economic_indicator'
  | 'insight'
  | 'market_summary'
  | 'currency';

export type StockQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  updatedAt: Date;
};

export type IndexQuote = {
  symbol: string;
  name: string;
  points: number;
  change: number;
  changePercent: number;
  updatedAt: Date;
};

export type CryptoQuote = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap?: number;
  volume24h?: number;
  updatedAt: Date;
};

export type NewsItem = {
  id: string;
  title: string;
  summary?: string;
  source: string;
  url: string;
  imageUrl?: string;
  publishedAt: Date;
};

export type EconomicIndicator = {
  id: string;
  name: string;
  value: number;
  previousValue?: number;
  change?: number;
  unit: string;
  date: Date;
  description?: string;
};

export type InsightItem = {
  id: string;
  title: string;
  content: string;
  type: 'tip' | 'alert' | 'opportunity';
  relatedTo?: string;
  createdAt: Date;
};

export type CurrencyQuote = {
  code: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  change: number;
  changePercent: number;
  updatedAt: Date;
};

export type FeedItem = {
  id: string;
  type: FeedItemType;
  data:
    | StockQuote
    | IndexQuote
    | CryptoQuote
    | NewsItem
    | EconomicIndicator
    | InsightItem
    | CurrencyQuote;
  timestamp: Date;
  source?: string;
  priority?: number;
};
