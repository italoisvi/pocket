import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// Branded Types
// ============================================================================

declare const brand: unique symbol;
type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type UserId = Brand<string, 'UserId'>;

// ============================================================================
// Income Card (from profiles.income_cards JSONB)
// ============================================================================

export type IncomeSource =
  | 'CLT'
  | 'PJ'
  | 'Autônomo'
  | 'Freelancer'
  | 'Empresário'
  | 'Aposentado'
  | 'Pensionista'
  | 'Investimentos'
  | 'Outros';

// Raw format from database (profiles.income_cards JSONB)
export type RawIncomeCard = {
  id: string;
  salary: string;
  paymentDay: string;
  incomeSource: string;
  linkedAccountId?: string;
  lastKnownBalance?: number;
};

// Normalized format for agent use
export type IncomeCard = {
  id: string;
  amount: number;
  day: number;
  source: string;
  linkedAccountId?: string;
  bankName?: string;
};

// ============================================================================
// Database Row Types
// ============================================================================

export type ExpenseRow = {
  id: string;
  establishment_name: string;
  amount: number;
  date: string;
  category: string | null;
  subcategory: string | null;
};

export type BudgetRow = {
  id: string;
  category_id: string;
  amount: string;
  period_type: 'monthly' | 'weekly' | 'yearly';
  start_date: string;
  end_date: string | null;
};

export type WaltsMemoryRow = {
  memory_type: 'preference' | 'context' | 'insight';
  key: string;
  value: unknown;
  confidence?: number;
  source?: string;
};

export type LearnedInsight = {
  key: string;
  value: {
    message?: string;
    [key: string]: unknown;
  };
  confidence: number;
};

// ============================================================================
// User Context (preloaded data)
// ============================================================================

export type BudgetWithUsage = {
  id: string;
  categoryId: string;
  limit: number;
  periodType: 'monthly' | 'weekly' | 'yearly';
  spent: number;
  remaining: number;
  percentUsed: number;
};

export type RecentExpense = {
  establishmentName: string;
  amount: number;
  date: string;
  category: string | null;
};

export type UserContext = {
  user: {
    name: string | null;
    totalIncome: number;
    nextPaymentDay: number | null;
    incomeCards: IncomeCard[];
  };
  financial: {
    totalExpensesThisMonth: number;
    balance: number;
    percentSpent: number;
    dailyBudget: number;
    daysUntilNextPayment: number;
  };
  budgets: BudgetWithUsage[];
  recentExpenses: RecentExpense[];
  memories: WaltsMemoryRow[];
  insights: LearnedInsight[];
};

// ============================================================================
// Agent Types
// ============================================================================

export type AgentMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type AgentResponse = {
  content: string | null;
  tool_calls?: ToolCall[];
};

// ============================================================================
// ReAct Loop Types
// ============================================================================

export type AgentThought = {
  tool: string;
  input: unknown;
  output: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  executionTimeMs: number;
};

export type OpenAITextContent = {
  type: 'text';
  text: string;
};

export type OpenAIImageContent = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
};

export type OpenAIMessageContent =
  | string
  | null
  | Array<OpenAITextContent | OpenAIImageContent>;

export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: OpenAIMessageContent;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

// ============================================================================
// Request/Response Types
// ============================================================================

export type WaltsAgentRequest = {
  message: string;
  conversationId?: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
    imageUrls?: string[];
  }>;
  imageUrls?: string[];
  audioUrls?: string[];
};

export type WaltsAgentResponse = {
  response: string;
  conversationId: string;
  thoughts?: AgentThought[];
  toolsUsed?: string[];
};

// ============================================================================
// Supabase Client Type (for dependency injection)
// ============================================================================

export type { SupabaseClient };
