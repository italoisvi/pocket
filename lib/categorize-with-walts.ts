/**
 * Categorização inteligente com Walts (LLM)
 * Cliente para o frontend - chama a Edge Function
 */

import { supabase } from './supabase';

export type ExpenseCategory =
  | 'moradia'
  | 'alimentacao_casa'
  | 'alimentacao_fora'
  | 'transporte'
  | 'saude'
  | 'educacao'
  | 'lazer'
  | 'vestuario'
  | 'beleza'
  | 'eletronicos'
  | 'pets'
  | 'tecnologia'
  | 'poupanca'
  | 'previdencia'
  | 'investimentos'
  | 'consorcio'
  | 'cartao_credito'
  | 'emprestimos'
  | 'financiamentos'
  | 'transferencias'
  | 'outros';

export interface CategorizeOptions {
  pluggyCategory?: string | null;
  receiverName?: string | null;
  payerName?: string | null;
  amount?: number;
  items?: Array<{ name: string; quantity: number; price: number }>;
}

export interface CategorizeResult {
  category: ExpenseCategory;
  subcategory: string;
  is_fixed_cost: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

export async function categorizeWithWalts(
  establishmentName: string,
  options?: CategorizeOptions
): Promise<CategorizeResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'recategorize-expenses',
      {
        body: {
          action: 'categorize_single',
          establishmentName,
          options,
        },
      }
    );

    if (error) {
      console.error('[categorizeWithWalts] Error:', error);
      throw error;
    }

    if (data?.category && data?.subcategory) {
      return {
        category: data.category,
        subcategory: data.subcategory,
        is_fixed_cost: data.is_fixed_cost === true,
        confidence: data.confidence || 'medium',
        reasoning: data.reasoning,
      };
    }

    throw new Error('Invalid response from categorization');
  } catch (error) {
    console.error('[categorizeWithWalts] Fallback to outros:', error);

    // Fallback: categoria outros, custo variavel
    return {
      category: 'outros',
      subcategory: 'Outros',
      is_fixed_cost: false,
      confidence: 'low',
      reasoning: 'Fallback due to error',
    };
  }
}
