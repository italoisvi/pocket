import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../../types.ts';

type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

type ToolContext = {
  userId: UserId;
  supabase: SupabaseClient;
};

// ============================================================================
// get_financial_patterns - Busca padroes financeiros do usuario
// ============================================================================

type GetFinancialPatternsParams = {
  pattern_type?: string;
  category?: string;
  min_confidence?: number;
};

export async function getFinancialPatterns(
  params: GetFinancialPatternsParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const minConfidence = params.min_confidence ?? 0.5;

  try {
    let query = supabase
      .from('user_financial_patterns')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false });

    if (params.pattern_type) {
      query = query.eq('pattern_type', params.pattern_type);
    }

    if (params.category) {
      query = query.eq('category', params.category);
    }

    const { data: patterns, error } = await query.limit(20);

    if (error) {
      console.error('[analysis.getFinancialPatterns] DB Error:', error);
      return { success: false, error: 'Erro ao buscar padroes financeiros' };
    }

    if (!patterns || patterns.length === 0) {
      return {
        success: true,
        data: {
          patterns: [],
          message:
            'Nenhum padrao financeiro detectado ainda. Continue usando o app para que eu possa aprender seus habitos.',
        },
      };
    }

    const formattedPatterns = patterns.map((p) => ({
      type: p.pattern_type,
      key: p.pattern_key,
      category: p.category,
      value: p.pattern_value,
      confidence: Math.round(p.confidence * 100),
      occurrences: p.occurrences,
      lastUpdated: p.last_updated_at,
    }));

    // Group patterns by type for better presentation
    const grouped: Record<string, typeof formattedPatterns> = {};
    for (const pattern of formattedPatterns) {
      if (!grouped[pattern.type]) {
        grouped[pattern.type] = [];
      }
      grouped[pattern.type].push(pattern);
    }

    const patternTypeLabels: Record<string, string> = {
      recurring_expense: 'Gastos Recorrentes',
      frequent_merchant: 'Comerciantes Frequentes',
      spending_day_pattern: 'Padroes de Dias',
      category_preference: 'Preferencias de Categoria',
    };

    return {
      success: true,
      data: {
        patterns: formattedPatterns,
        grouped,
        summary: {
          total: formattedPatterns.length,
          byType: Object.entries(grouped).map(([type, items]) => ({
            type,
            label: patternTypeLabels[type] || type,
            count: items.length,
          })),
        },
      },
    };
  } catch (error) {
    console.error('[analysis.getFinancialPatterns] Error:', error);
    return {
      success: false,
      error: 'Erro ao buscar padroes financeiros',
    };
  }
}

// ============================================================================
// get_past_analyses - Busca analises financeiras anteriores
// ============================================================================

type GetPastAnalysesParams = {
  analysis_type?: string;
  limit?: number;
};

export async function getPastAnalyses(
  params: GetPastAnalysesParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const limit = Math.min(params.limit || 5, 20);

  try {
    let query = supabase
      .from('walts_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (params.analysis_type) {
      query = query.eq('analysis_type', params.analysis_type);
    }

    const { data: analyses, error } = await query;

    if (error) {
      console.error('[analysis.getPastAnalyses] DB Error:', error);
      return { success: false, error: 'Erro ao buscar analises anteriores' };
    }

    if (!analyses || analyses.length === 0) {
      return {
        success: true,
        data: {
          analyses: [],
          message: 'Nenhuma analise financeira anterior encontrada.',
        },
      };
    }

    const analysisTypeLabels: Record<string, string> = {
      raio_x_financeiro: 'Raio-X Financeiro',
      monthly_summary: 'Resumo Mensal',
      spending_alert: 'Alerta de Gastos',
    };

    const formattedAnalyses = analyses.map((a) => ({
      id: a.id,
      type: a.analysis_type,
      typeLabel: analysisTypeLabels[a.analysis_type] || a.analysis_type,
      content: a.content,
      contextData: a.context_data,
      createdAt: a.created_at,
    }));

    return {
      success: true,
      data: {
        analyses: formattedAnalyses,
        total: formattedAnalyses.length,
      },
    };
  } catch (error) {
    console.error('[analysis.getPastAnalyses] Error:', error);
    return {
      success: false,
      error: 'Erro ao buscar analises anteriores',
    };
  }
}
