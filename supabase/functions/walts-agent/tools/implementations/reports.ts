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
// generate_monthly_report - Gera relatorio mensal
// ============================================================================

type GenerateMonthlyReportParams = {
  month: string; // YYYY-MM
  format?: 'summary' | 'detailed';
};

export async function generateMonthlyReport(
  params: GenerateMonthlyReportParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const format = params.format || 'summary';

  try {
    // Parse mes
    const [year, month] = params.month.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    const daysInMonth = new Date(year, month, 0).getDate();

    // Buscar dados
    const [profileResult, expensesResult, budgetsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, income_cards')
        .eq('id', userId)
        .single(),
      supabase
        .from('expenses')
        .select('id, establishment_name, amount, date, category')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false }),
      supabase.from('budgets').select('*').eq('user_id', userId),
    ]);

    const expenses = expensesResult.data || [];
    const budgets = budgetsResult.data || [];

    // Calcular renda
    const incomeCards = profileResult.data?.income_cards || [];
    let totalIncome = 0;
    for (const card of incomeCards) {
      if (card.salary) {
        const cleanSalary = card.salary.replace(/\./g, '').replace(',', '.');
        totalIncome += parseFloat(cleanSalary) || 0;
      }
    }

    // Calcular metricas
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const balance = totalIncome - totalExpenses;
    const savingsRate =
      totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;
    const dailyAverage = totalExpenses / daysInMonth;

    // Agrupar por categoria
    const byCategory: Record<
      string,
      { total: number; count: number; items: typeof expenses }
    > = {};
    for (const expense of expenses) {
      const cat = expense.category || 'outros';
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, count: 0, items: [] };
      }
      byCategory[cat].total += expense.amount;
      byCategory[cat].count++;
      byCategory[cat].items.push(expense);
    }

    const categoryBreakdown = Object.entries(byCategory)
      .map(([category, data]) => ({
        category,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
        percent:
          totalExpenses > 0
            ? Math.round((data.total / totalExpenses) * 100)
            : 0,
        average: Math.round((data.total / data.count) * 100) / 100,
        ...(format === 'detailed' && {
          transactions: data.items.map((e) => ({
            establishment: e.establishment_name,
            amount: e.amount,
            date: e.date,
          })),
        }),
      }))
      .sort((a, b) => b.total - a.total);

    // Status dos orcamentos
    const budgetStatus = budgets.map((b) => {
      const spent = byCategory[b.category_id]?.total || 0;
      const limit = parseFloat(b.amount);
      const remaining = Math.max(0, limit - spent);
      const percentUsed = limit > 0 ? Math.round((spent / limit) * 100) : 0;

      return {
        category: b.category_id,
        limit,
        spent: Math.round(spent * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        percentUsed,
        status:
          percentUsed >= 100
            ? 'ESTOURADO'
            : percentUsed >= 80
              ? 'ALERTA'
              : 'OK',
      };
    });

    // Top 5 maiores gastos
    const topExpenses = [...expenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((e) => ({
        establishment: e.establishment_name,
        amount: e.amount,
        category: e.category,
        date: e.date,
      }));

    // Gerar insights
    const insights: string[] = [];

    if (savingsRate >= 20) {
      insights.push(
        `Excelente! Voce economizou ${savingsRate}% da renda neste mes.`
      );
    } else if (savingsRate >= 0) {
      insights.push(
        `Taxa de economia de ${savingsRate}% - tente aumentar para pelo menos 20%.`
      );
    } else {
      insights.push(
        `Atencao: gastos excederam a renda em ${Math.abs(savingsRate)}%.`
      );
    }

    const exceededBudgets = budgetStatus.filter(
      (b) => b.status === 'ESTOURADO'
    );
    if (exceededBudgets.length > 0) {
      insights.push(
        `${exceededBudgets.length} orcamento(s) estourado(s): ${exceededBudgets.map((b) => b.category).join(', ')}.`
      );
    }

    if (categoryBreakdown.length > 0) {
      insights.push(
        `Maior categoria: ${categoryBreakdown[0].category} com R$ ${categoryBreakdown[0].total.toFixed(2)} (${categoryBreakdown[0].percent}%).`
      );
    }

    const monthNames = [
      'Janeiro',
      'Fevereiro',
      'Marco',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];

    return {
      success: true,
      data: {
        report: {
          period: params.month,
          periodLabel: `${monthNames[month - 1]} de ${year}`,
          generatedAt: new Date().toISOString(),
          format,
        },
        summary: {
          totalIncome,
          totalExpenses: Math.round(totalExpenses * 100) / 100,
          balance: Math.round(balance * 100) / 100,
          savingsRate,
          transactionCount: expenses.length,
          dailyAverage: Math.round(dailyAverage * 100) / 100,
        },
        categoryBreakdown,
        budgetStatus,
        topExpenses,
        insights,
      },
    };
  } catch (error) {
    console.error('[reports.generateMonthlyReport] Error:', error);
    return { success: false, error: 'Erro ao gerar relatorio' };
  }
}

// ============================================================================
// export_data - Exporta dados financeiros
// ============================================================================

type ExportDataParams = {
  type: 'expenses' | 'budgets' | 'transactions' | 'all';
  period?: string; // YYYY-MM ou YYYY-MM:YYYY-MM para range
  format?: 'csv' | 'json';
};

export async function exportData(
  params: ExportDataParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, supabase } = context;
  const format = params.format || 'json';

  try {
    // Parse periodo
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (params.period) {
      if (params.period.includes(':')) {
        // Range: YYYY-MM:YYYY-MM
        const [start, end] = params.period.split(':');
        const [startYear, startMonth] = start.split('-').map(Number);
        const [endYear, endMonth] = end.split('-').map(Number);
        startDate = new Date(startYear, startMonth - 1, 1)
          .toISOString()
          .split('T')[0];
        endDate = new Date(endYear, endMonth, 0).toISOString().split('T')[0];
      } else {
        // Single month: YYYY-MM
        const [year, month] = params.period.split('-').map(Number);
        startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        endDate = new Date(year, month, 0).toISOString().split('T')[0];
      }
    }

    const exportResult: Record<string, unknown> = {};

    // Exportar gastos
    if (params.type === 'expenses' || params.type === 'all') {
      let expensesQuery = supabase
        .from('expenses')
        .select(
          'id, establishment_name, amount, date, category, subcategory, notes, source'
        )
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (startDate) expensesQuery = expensesQuery.gte('date', startDate);
      if (endDate) expensesQuery = expensesQuery.lte('date', endDate);

      const { data: expenses } = await expensesQuery;
      exportResult.expenses = expenses || [];
    }

    // Exportar orcamentos
    if (params.type === 'budgets' || params.type === 'all') {
      const { data: budgets } = await supabase
        .from('budgets')
        .select('id, category_id, amount, period_type, start_date, end_date')
        .eq('user_id', userId);

      exportResult.budgets = budgets || [];
    }

    // Exportar transacoes Open Finance
    if (params.type === 'transactions' || params.type === 'all') {
      let transQuery = supabase
        .from('pluggy_transactions')
        .select('id, description, amount, date, type, status, category')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (startDate) transQuery = transQuery.gte('date', startDate);
      if (endDate) transQuery = transQuery.lte('date', endDate);

      const { data: transactions } = await transQuery;
      exportResult.transactions = transactions || [];
    }

    // Preparar conteúdo do arquivo
    let fileContent: string;
    let fileName: string;
    let contentType: string;
    const timestamp = new Date().toISOString().split('T')[0];
    const periodSuffix = params.period
      ? `_${params.period.replace(':', '-')}`
      : '';

    if (format === 'csv') {
      const csvParts: string[] = [];

      if (exportResult.expenses) {
        const expenses = exportResult.expenses as Array<{
          date: string;
          establishment_name: string;
          amount: number;
          category: string;
        }>;
        csvParts.push('=== GASTOS ===');
        csvParts.push('Data,Estabelecimento,Valor,Categoria');
        for (const e of expenses) {
          csvParts.push(
            `${e.date},"${e.establishment_name}",${e.amount},${e.category || 'outros'}`
          );
        }
        csvParts.push('');
      }

      if (exportResult.budgets) {
        const budgets = exportResult.budgets as Array<{
          category_id: string;
          amount: string;
          period_type: string;
        }>;
        csvParts.push('=== ORCAMENTOS ===');
        csvParts.push('Categoria,Limite,Periodo');
        for (const b of budgets) {
          csvParts.push(`${b.category_id},${b.amount},${b.period_type}`);
        }
        csvParts.push('');
      }

      if (exportResult.transactions) {
        const trans = exportResult.transactions as Array<{
          date: string;
          description: string;
          amount: number;
          type: string;
        }>;
        csvParts.push('=== TRANSACOES BANCARIAS ===');
        csvParts.push('Data,Descricao,Valor,Tipo');
        for (const t of trans) {
          csvParts.push(`${t.date},"${t.description}",${t.amount},${t.type}`);
        }
      }

      fileContent = csvParts.join('\n');
      fileName = `pocket_export${periodSuffix}_${timestamp}.csv`;
      contentType = 'text/csv';
    } else {
      // JSON format
      const jsonData = {
        exportedAt: new Date().toISOString(),
        period: params.period || 'all_time',
        ...exportResult,
      };
      fileContent = JSON.stringify(jsonData, null, 2);
      fileName = `pocket_export${periodSuffix}_${timestamp}.json`;
      contentType = 'application/json';
    }

    // Upload para Supabase Storage
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(filePath, fileContent, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[reports.exportData] Upload error:', uploadError);
      // Fallback: retornar dados diretamente se upload falhar
      return {
        success: true,
        data: {
          format,
          content: fileContent,
          summary: {
            expenses: (exportResult.expenses as Array<unknown>)?.length || 0,
            budgets: (exportResult.budgets as Array<unknown>)?.length || 0,
            transactions:
              (exportResult.transactions as Array<unknown>)?.length || 0,
          },
          message:
            'Dados exportados. O upload falhou, mas aqui estão os dados diretamente.',
        },
      };
    }

    // Gerar URL assinada (válida por 1 hora)
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage.from('exports').createSignedUrl(filePath, 3600); // 1 hora

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('[reports.exportData] Signed URL error:', signedUrlError);
      return {
        success: false,
        error: 'Erro ao gerar link de download',
      };
    }

    const summary = {
      expenses: (exportResult.expenses as Array<unknown>)?.length || 0,
      budgets: (exportResult.budgets as Array<unknown>)?.length || 0,
      transactions: (exportResult.transactions as Array<unknown>)?.length || 0,
    };

    return {
      success: true,
      data: {
        format,
        downloadUrl: signedUrlData.signedUrl,
        fileName,
        expiresIn: '1 hora',
        summary,
        message: `Arquivo ${fileName} pronto para download. O link expira em 1 hora.`,
      },
    };
  } catch (error) {
    console.error('[reports.exportData] Error:', error);
    return { success: false, error: 'Erro ao exportar dados' };
  }
}
