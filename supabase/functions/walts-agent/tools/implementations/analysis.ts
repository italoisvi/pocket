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

// ============================================================================
// get_charts_data - Busca dados da tela de Graficos & Tabelas
// ============================================================================

type GetChartsDataParams = {
  period?: 'last7days' | 'last15days' | 'month';
  month?: string;
};

export async function getChartsData(
  params: GetChartsDataParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const period = params.period || 'month';

  try {
    // Calcular datas baseado no periodo
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now);
    let prevStartDate: Date;
    let prevEndDate: Date;

    if (period === 'last7days') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);
      prevEndDate = new Date(startDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
    } else if (period === 'last15days') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 15);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 15);
      prevEndDate = new Date(startDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
    } else {
      // month
      if (params.month) {
        const [year, month] = params.month.split('-').map(Number);
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 0);
        prevStartDate = new Date(year, month - 2, 1);
        prevEndDate = new Date(year, month - 1, 0);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
      }
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const prevStartDateStr = prevStartDate.toISOString().split('T')[0];
    const prevEndDateStr = prevEndDate.toISOString().split('T')[0];

    // Buscar expenses MANUAIS do periodo atual
    const { data: expensesData, error: expError } = await supabase
      .from('expenses')
      .select('amount, category, subcategory')
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr);

    if (expError) {
      console.error('[analysis.getChartsData] Expenses error:', expError);
    }

    // Buscar expenses MANUAIS do periodo anterior
    const { data: prevExpensesData } = await supabase
      .from('expenses')
      .select('amount, category, subcategory')
      .eq('user_id', userId)
      .gte('date', prevStartDateStr)
      .lte('date', prevEndDateStr);

    // Buscar contas do usuario
    const { data: accounts } = await supabase
      .from('pluggy_accounts')
      .select('id')
      .eq('user_id', userId);

    let extractTransactions: Array<{
      category: string;
      subcategory?: string;
      amount: number;
    }> = [];
    let prevExtractTransactions: Array<{
      category: string;
      subcategory?: string;
      amount: number;
    }> = [];

    if (accounts && accounts.length > 0) {
      const accountIds = accounts.map((a) => a.id);

      // Buscar transacoes categorizadas do extrato
      const { data: categorizedTx } = await supabase
        .from('transaction_categories')
        .select(
          `
          category,
          subcategory,
          pluggy_transactions!inner(
            amount,
            date,
            account_id,
            type
          )
        `
        )
        .eq('user_id', userId);

      if (categorizedTx) {
        // Filtrar por periodo atual (apenas DEBIT = saidas)
        extractTransactions = categorizedTx
          .filter((tx: any) => {
            const txDate = tx.pluggy_transactions?.date;
            const txAccountId = tx.pluggy_transactions?.account_id;
            const txType = tx.pluggy_transactions?.type;
            if (!txDate || !txAccountId) return false;
            if (!accountIds.includes(txAccountId)) return false;
            if (txType !== 'DEBIT') return false;
            const date = new Date(txDate);
            return date >= startDate && date <= endDate;
          })
          .map((tx: any) => ({
            category: tx.category || 'outros',
            subcategory: tx.subcategory,
            amount: Math.abs(tx.pluggy_transactions?.amount || 0),
          }));

        // Filtrar por periodo anterior
        prevExtractTransactions = categorizedTx
          .filter((tx: any) => {
            const txDate = tx.pluggy_transactions?.date;
            const txAccountId = tx.pluggy_transactions?.account_id;
            const txType = tx.pluggy_transactions?.type;
            if (!txDate || !txAccountId) return false;
            if (!accountIds.includes(txAccountId)) return false;
            if (txType !== 'DEBIT') return false;
            const date = new Date(txDate);
            return date >= prevStartDate && date <= prevEndDate;
          })
          .map((tx: any) => ({
            category: tx.category || 'outros',
            subcategory: tx.subcategory,
            amount: Math.abs(tx.pluggy_transactions?.amount || 0),
          }));
      }
    }

    // Agrupar por categoria - periodo atual
    const byCategory: Record<
      string,
      { total: number; count: number; source: 'manual' | 'extract' | 'mixed' }
    > = {};

    // Somar gastos manuais
    for (const exp of expensesData || []) {
      const cat = exp.category || 'outros';
      if (!byCategory[cat])
        byCategory[cat] = { total: 0, count: 0, source: 'manual' };
      byCategory[cat].total += exp.amount;
      byCategory[cat].count++;
    }

    // Somar transacoes do extrato
    for (const tx of extractTransactions) {
      const cat = tx.category;
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, count: 0, source: 'extract' };
      } else if (byCategory[cat].source === 'manual') {
        byCategory[cat].source = 'mixed';
      }
      byCategory[cat].total += tx.amount;
      byCategory[cat].count++;
    }

    // Calcular total do periodo anterior por categoria
    const prevByCategory: Record<string, number> = {};
    for (const exp of prevExpensesData || []) {
      const cat = exp.category || 'outros';
      prevByCategory[cat] = (prevByCategory[cat] || 0) + exp.amount;
    }
    for (const tx of prevExtractTransactions) {
      prevByCategory[tx.category] =
        (prevByCategory[tx.category] || 0) + tx.amount;
    }

    // Calcular total
    const totalExpenses = Object.values(byCategory).reduce(
      (s, c) => s + c.total,
      0
    );
    const prevTotalExpenses = Object.values(prevByCategory).reduce(
      (s, v) => s + v,
      0
    );

    // Formatar resultado com comparacao
    const categories = Object.entries(byCategory)
      .map(([category, data]) => {
        const prevTotal = prevByCategory[category] || 0;
        const variation =
          prevTotal > 0
            ? Math.round(((data.total - prevTotal) / prevTotal) * 100)
            : data.total > 0
              ? 100
              : 0;

        return {
          category,
          total: Math.round(data.total * 100) / 100,
          count: data.count,
          percent:
            totalExpenses > 0
              ? Math.round((data.total / totalExpenses) * 100)
              : 0,
          source: data.source,
          previousTotal: Math.round(prevTotal * 100) / 100,
          variation,
        };
      })
      .sort((a, b) => b.total - a.total);

    const categoryLabels: Record<string, string> = {
      moradia: 'Moradia',
      alimentacao: 'Alimentacao',
      alimentacao_casa: 'Alimentacao (Casa)',
      alimentacao_fora: 'Alimentacao (Fora)',
      transporte: 'Transporte',
      saude: 'Saude',
      educacao: 'Educacao',
      lazer: 'Lazer',
      vestuario: 'Vestuario',
      beleza: 'Beleza',
      eletronicos: 'Eletronicos',
      delivery: 'Delivery',
      pets: 'Pets',
      transferencias: 'Transferencias',
      outros: 'Outros',
    };

    const formattedCategories = categories.map((c) => ({
      ...c,
      categoryLabel: categoryLabels[c.category] || c.category,
    }));

    const totalVariation =
      prevTotalExpenses > 0
        ? Math.round(
            ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100
          )
        : 0;

    return {
      success: true,
      data: {
        period,
        periodLabel:
          period === 'last7days'
            ? 'Ultimos 7 dias'
            : period === 'last15days'
              ? 'Ultimos 15 dias'
              : params.month || 'Mes atual',
        categories: formattedCategories,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        previousTotalExpenses: Math.round(prevTotalExpenses * 100) / 100,
        totalVariation,
        manualExpensesCount: (expensesData || []).length,
        extractTransactionsCount: extractTransactions.length,
        message:
          categories.length > 0
            ? `Analise de ${categories.length} categorias, totalizando R$ ${totalExpenses.toFixed(2)}. ${totalVariation > 0 ? `Aumento de ${totalVariation}%` : totalVariation < 0 ? `Reducao de ${Math.abs(totalVariation)}%` : 'Sem variacao'} em relacao ao periodo anterior.`
            : 'Nenhum gasto encontrado no periodo selecionado.',
      },
    };
  } catch (error) {
    console.error('[analysis.getChartsData] Error:', error);
    return {
      success: false,
      error: 'Erro ao buscar dados de graficos',
    };
  }
}
