import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserId } from '../types.ts';
import type { ToolName } from './registry.ts';
import {
  getFinancialContext,
  createExpense,
  createBudget,
  checkBudgetStatus,
  updateExpense,
  deleteExpense,
  updateBudget,
  deleteBudget,
} from './implementations/financial.ts';
import { searchMemory, saveUserPreference } from './implementations/memory.ts';
import {
  getBankAccounts,
  syncBankAccounts,
  getBankTransactions,
  checkBankSyncStatus,
} from './implementations/openfinance.ts';
import {
  getFinancialPatterns,
  getPastAnalyses,
  getChartsData,
} from './implementations/analysis.ts';
import {
  listConversations,
  getConversation,
  updateConversationTitle,
  deleteConversation,
} from './implementations/conversations.ts';
import {
  listFixedCosts,
  detectRecurringExpenses,
  calculateFixedCostsTotal,
} from './implementations/recurring.ts';
import {
  generateRaioX,
  comparePeriods,
  forecastMonthEnd,
  detectAnomalies,
} from './implementations/advanced-analysis.ts';
import {
  updateProfile,
  addIncomeCard,
  updateIncomeCard,
  removeIncomeCard,
} from './implementations/profile.ts';
import {
  createFinancialGoal,
  trackGoalProgress,
  suggestSavingsPlan,
} from './implementations/goals.ts';
import {
  recategorizeTransaction,
  markAsFixedCost,
  getUncategorized,
} from './implementations/categorization.ts';
import {
  createSpendingAlert,
  checkPendingAlerts,
  configureDebtNotifications,
} from './implementations/alerts.ts';
import {
  generateMonthlyReport,
  exportData,
} from './implementations/reports.ts';
import {
  suggestBudgetAdjustments,
  suggestCategoriesToCut,
  getCashflowPrediction,
} from './implementations/suggestions.ts';
import {
  getFinancialNews,
  getMarketIndicators,
} from './implementations/news.ts';

// ============================================================================
// Types
// ============================================================================

export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
};

export type ToolContext = {
  userId: UserId;
  sessionId: string;
  supabase: SupabaseClient;
};

type ToolExecution = {
  toolName: ToolName;
  input: unknown;
  output: ToolResult;
  timestamp: string;
};

// ============================================================================
// Tool Classification
// ============================================================================

const FINANCIAL_TOOLS = new Set([
  'get_financial_context',
  'create_expense',
  'create_budget',
  'check_budget_status',
  'update_expense',
  'delete_expense',
  'update_budget',
  'delete_budget',
]);

const MEMORY_TOOLS = new Set(['search_memory', 'save_user_preference']);

const OPENFINANCE_TOOLS = new Set([
  'get_bank_accounts',
  'sync_bank_accounts',
  'get_bank_transactions',
  'check_bank_sync_status',
]);

const ANALYSIS_TOOLS = new Set([
  'get_financial_patterns',
  'get_past_analyses',
  'get_charts_data',
]);

const CONVERSATION_TOOLS = new Set([
  'list_conversations',
  'get_conversation',
  'update_conversation_title',
  'delete_conversation',
]);

const RECURRING_TOOLS = new Set([
  'list_fixed_costs',
  'detect_recurring_expenses',
  'calculate_fixed_costs_total',
]);

const ADVANCED_ANALYSIS_TOOLS = new Set([
  'generate_raio_x',
  'compare_periods',
  'forecast_month_end',
  'detect_anomalies',
]);

const PROFILE_TOOLS = new Set([
  'update_profile',
  'add_income_card',
  'update_income_card',
  'remove_income_card',
]);

const GOALS_TOOLS = new Set([
  'create_financial_goal',
  'track_goal_progress',
  'suggest_savings_plan',
]);

const CATEGORIZATION_TOOLS = new Set([
  'recategorize_transaction',
  'mark_as_fixed_cost',
  'get_uncategorized',
]);

const ALERTS_TOOLS = new Set([
  'create_spending_alert',
  'check_pending_alerts',
  'configure_debt_notifications',
]);

const REPORTS_TOOLS = new Set(['generate_monthly_report', 'export_data']);

const SUGGESTIONS_TOOLS = new Set([
  'suggest_budget_adjustments',
  'suggest_categories_to_cut',
  'get_cashflow_prediction',
]);

const NEWS_TOOLS = new Set(['get_financial_news', 'get_market_indicators']);

function isFinancialTool(name: string): boolean {
  return FINANCIAL_TOOLS.has(name);
}

function isMemoryTool(name: string): boolean {
  return MEMORY_TOOLS.has(name);
}

function isOpenFinanceTool(name: string): boolean {
  return OPENFINANCE_TOOLS.has(name);
}

function isAnalysisTool(name: string): boolean {
  return ANALYSIS_TOOLS.has(name);
}

function isConversationTool(name: string): boolean {
  return CONVERSATION_TOOLS.has(name);
}

function isRecurringTool(name: string): boolean {
  return RECURRING_TOOLS.has(name);
}

function isAdvancedAnalysisTool(name: string): boolean {
  return ADVANCED_ANALYSIS_TOOLS.has(name);
}

function isProfileTool(name: string): boolean {
  return PROFILE_TOOLS.has(name);
}

function isGoalsTool(name: string): boolean {
  return GOALS_TOOLS.has(name);
}

function isCategorizationTool(name: string): boolean {
  return CATEGORIZATION_TOOLS.has(name);
}

function isAlertsTool(name: string): boolean {
  return ALERTS_TOOLS.has(name);
}

function isReportsTool(name: string): boolean {
  return REPORTS_TOOLS.has(name);
}

function isSuggestionsTool(name: string): boolean {
  return SUGGESTIONS_TOOLS.has(name);
}

function isNewsTool(name: string): boolean {
  return NEWS_TOOLS.has(name);
}

// ============================================================================
// Action Logging
// ============================================================================

async function logAction(
  execution: ToolExecution,
  context: ToolContext
): Promise<void> {
  try {
    await context.supabase.from('agent_actions_log').insert({
      user_id: context.userId,
      session_id: context.sessionId,
      action_type: 'tool_call',
      tool_name: execution.toolName,
      input_params: execution.input,
      output_result: execution.output.data ?? { error: execution.output.error },
      execution_time_ms: execution.output.executionTimeMs,
      status: execution.output.success ? 'success' : 'error',
      created_at: execution.timestamp,
    });
  } catch (error) {
    console.error('[executor.logAction] Failed to log action:', error);
  }
}

// ============================================================================
// Main Executor
// ============================================================================

export async function executeTool(
  toolName: ToolName,
  parameters: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const startTime = Date.now();
  let result: ToolResult;

  console.log(`[executor] Executing tool: ${toolName}`, { parameters });

  try {
    const params = parameters as Record<string, unknown>;
    const toolContext = {
      userId: context.userId,
      supabase: context.supabase,
    };

    if (isFinancialTool(toolName)) {
      result = await executeFinancialTool(toolName, params, toolContext);
    } else if (isMemoryTool(toolName)) {
      result = await executeMemoryTool(toolName, params, toolContext);
    } else if (isOpenFinanceTool(toolName)) {
      result = await executeOpenFinanceTool(toolName, params, toolContext);
    } else if (isAnalysisTool(toolName)) {
      result = await executeAnalysisTool(toolName, params, toolContext);
    } else if (isConversationTool(toolName)) {
      result = await executeConversationTool(toolName, params, toolContext);
    } else if (isRecurringTool(toolName)) {
      result = await executeRecurringTool(toolName, params, toolContext);
    } else if (isAdvancedAnalysisTool(toolName)) {
      result = await executeAdvancedAnalysisTool(toolName, params, toolContext);
    } else if (isProfileTool(toolName)) {
      result = await executeProfileTool(toolName, params, toolContext);
    } else if (isGoalsTool(toolName)) {
      result = await executeGoalsTool(toolName, params, toolContext);
    } else if (isCategorizationTool(toolName)) {
      result = await executeCategorizationTool(toolName, params, toolContext);
    } else if (isAlertsTool(toolName)) {
      result = await executeAlertsTool(toolName, params, toolContext);
    } else if (isReportsTool(toolName)) {
      result = await executeReportsTool(toolName, params, toolContext);
    } else if (isSuggestionsTool(toolName)) {
      result = await executeSuggestionsTool(toolName, params, toolContext);
    } else if (isNewsTool(toolName)) {
      result = await executeNewsTool(toolName, params, toolContext);
    } else {
      result = {
        success: false,
        error: `Ferramenta desconhecida: ${toolName}`,
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    console.error(`[executor] Error executing ${toolName}:`, error);
    result = {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      executionTimeMs: Date.now() - startTime,
    };
  }

  result.executionTimeMs = Date.now() - startTime;

  await logAction(
    {
      toolName,
      input: parameters,
      output: result,
      timestamp: new Date().toISOString(),
    },
    context
  );

  console.log(
    `[executor] Tool ${toolName} completed in ${result.executionTimeMs}ms`,
    {
      success: result.success,
    }
  );

  return result;
}

// ============================================================================
// Tool Routers
// ============================================================================

async function executeFinancialTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'get_financial_context':
      return await getFinancialContext(params as { period?: string }, context);

    case 'create_expense':
      return await createExpense(
        params as {
          establishment_name: string;
          amount: number;
          date?: string;
          category?: string;
          notes?: string;
          image_url?: string;
        },
        context
      );

    case 'create_budget':
      return await createBudget(
        params as {
          category_id: string;
          amount: number;
          period_type?: string;
          notifications_enabled?: boolean;
        },
        context
      );

    case 'check_budget_status':
      return await checkBudgetStatus(
        params as { category_id?: string },
        context
      );

    case 'update_expense':
      return await updateExpense(
        params as {
          expense_id: string;
          establishment_name?: string;
          amount?: number;
          date?: string;
          category?: string;
          notes?: string;
        },
        context
      );

    case 'delete_expense':
      return await deleteExpense(params as { expense_id: string }, context);

    case 'update_budget':
      return await updateBudget(
        params as {
          budget_id?: string;
          category_id?: string;
          amount?: number;
          period_type?: string;
          notifications_enabled?: boolean;
        },
        context
      );

    case 'delete_budget':
      return await deleteBudget(
        params as { budget_id?: string; category_id?: string },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta financeira desconhecida: ${toolName}`,
      };
  }
}

async function executeMemoryTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'search_memory':
      return await searchMemory(
        params as { query: string; limit?: number },
        context
      );

    case 'save_user_preference':
      return await saveUserPreference(
        params as { key: string; value: string; confidence?: number },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de memória desconhecida: ${toolName}`,
      };
  }
}

async function executeOpenFinanceTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'get_bank_accounts':
      return await getBankAccounts(params, context);

    case 'sync_bank_accounts':
      return await syncBankAccounts(params as { account_id?: string }, context);

    case 'get_bank_transactions':
      return await getBankTransactions(
        params as {
          account_id?: string;
          start_date?: string;
          end_date?: string;
          limit?: number;
          type?: 'DEBIT' | 'CREDIT';
        },
        context
      );

    case 'check_bank_sync_status':
      return await checkBankSyncStatus(params, context);

    default:
      return {
        success: false,
        error: `Ferramenta de Open Finance desconhecida: ${toolName}`,
      };
  }
}

async function executeAnalysisTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'get_financial_patterns':
      return await getFinancialPatterns(
        params as {
          pattern_type?: string;
          category?: string;
          min_confidence?: number;
        },
        context
      );

    case 'get_past_analyses':
      return await getPastAnalyses(
        params as { analysis_type?: string; limit?: number },
        context
      );

    case 'get_charts_data':
      return await getChartsData(
        params as { period?: string; month?: string },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de analise desconhecida: ${toolName}`,
      };
  }
}

async function executeConversationTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'list_conversations':
      return await listConversations(
        params as { limit?: number; search?: string },
        context
      );

    case 'get_conversation':
      return await getConversation(
        params as { conversation_id: string; include_messages?: boolean },
        context
      );

    case 'update_conversation_title':
      return await updateConversationTitle(
        params as { conversation_id: string; title: string },
        context
      );

    case 'delete_conversation':
      return await deleteConversation(
        params as { conversation_id: string },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de conversa desconhecida: ${toolName}`,
      };
  }
}

async function executeRecurringTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'list_fixed_costs':
      return await listFixedCosts(
        params as { include_estimated?: boolean },
        context
      );

    case 'detect_recurring_expenses':
      return await detectRecurringExpenses(
        params as { min_occurrences?: number; min_months?: number },
        context
      );

    case 'calculate_fixed_costs_total':
      return await calculateFixedCostsTotal(
        params as { group_by?: 'category' | 'type' },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de custos recorrentes desconhecida: ${toolName}`,
      };
  }
}

async function executeAdvancedAnalysisTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'generate_raio_x':
      return await generateRaioX(
        params as {
          period?: 'current_month' | 'last_month' | 'last_3_months';
          include_predictions?: boolean;
        },
        context
      );

    case 'compare_periods':
      return await comparePeriods(
        params as {
          period1: string;
          period2: string;
          categories?: string[];
        },
        context
      );

    case 'forecast_month_end':
      return await forecastMonthEnd(params, context);

    case 'detect_anomalies':
      return await detectAnomalies(
        params as { sensitivity?: 'low' | 'medium' | 'high' },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de analise avancada desconhecida: ${toolName}`,
      };
  }
}

async function executeProfileTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'update_profile':
      return await updateProfile(
        params as {
          name?: string;
          debt_notifications_enabled?: boolean;
          salary_bank_account_id?: string;
        },
        context
      );

    case 'add_income_card':
      return await addIncomeCard(
        params as {
          amount: number;
          day: number;
          source: string;
          linked_account_id?: string;
        },
        context
      );

    case 'update_income_card':
      return await updateIncomeCard(
        params as {
          income_card_id: string;
          amount?: number;
          day?: number;
          source?: string;
        },
        context
      );

    case 'remove_income_card':
      return await removeIncomeCard(
        params as { income_card_id: string },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de perfil desconhecida: ${toolName}`,
      };
  }
}

async function executeGoalsTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'create_financial_goal':
      return await createFinancialGoal(
        params as {
          title: string;
          target_amount: number;
          target_date: string;
          category?: string;
          initial_amount?: number;
        },
        context
      );

    case 'track_goal_progress':
      return await trackGoalProgress(
        params as { goal_id?: string; title?: string },
        context
      );

    case 'suggest_savings_plan':
      return await suggestSavingsPlan(
        params as {
          goal_id?: string;
          target_amount?: number;
          months?: number;
          aggressive?: boolean;
        },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de metas desconhecida: ${toolName}`,
      };
  }
}

async function executeCategorizationTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'recategorize_transaction':
      return await recategorizeTransaction(
        params as {
          transaction_id: string;
          category: string;
          subcategory?: string;
          is_fixed_cost?: boolean;
          save_as_pattern?: boolean;
        },
        context
      );

    case 'mark_as_fixed_cost':
      return await markAsFixedCost(
        params as { transaction_id: string; monthly_amount?: number },
        context
      );

    case 'get_uncategorized':
      return await getUncategorized(
        params as { limit?: number; start_date?: string },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de categorizacao desconhecida: ${toolName}`,
      };
  }
}

async function executeAlertsTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'create_spending_alert':
      return await createSpendingAlert(
        params as {
          category: string;
          threshold: number;
          notification_type?: 'push' | 'email' | 'both';
        },
        context
      );

    case 'check_pending_alerts':
      return await checkPendingAlerts(params, context);

    case 'configure_debt_notifications':
      return await configureDebtNotifications(
        params as { enabled: boolean },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de alertas desconhecida: ${toolName}`,
      };
  }
}

async function executeReportsTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'generate_monthly_report':
      return await generateMonthlyReport(
        params as { month: string; format?: 'summary' | 'detailed' },
        context
      );

    case 'export_data':
      return await exportData(
        params as {
          type: 'expenses' | 'budgets' | 'transactions' | 'all';
          period?: string;
          format?: 'csv' | 'json';
        },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de relatorios desconhecida: ${toolName}`,
      };
  }
}

async function executeSuggestionsTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'suggest_budget_adjustments':
      return await suggestBudgetAdjustments(params, context);

    case 'suggest_categories_to_cut':
      return await suggestCategoriesToCut(
        params as { target_savings: number },
        context
      );

    case 'get_cashflow_prediction':
      return await getCashflowPrediction(
        params as { months_ahead: number },
        context
      );

    default:
      return {
        success: false,
        error: `Ferramenta de sugestoes desconhecida: ${toolName}`,
      };
  }
}

async function executeNewsTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { userId: UserId; supabase: SupabaseClient }
): Promise<Omit<ToolResult, 'executionTimeMs'>> {
  switch (toolName) {
    case 'get_financial_news':
      return await getFinancialNews(
        params as { limit?: number; focus?: string },
        context
      );

    case 'get_market_indicators':
      return await getMarketIndicators(params, context);

    default:
      return {
        success: false,
        error: `Ferramenta de noticias desconhecida: ${toolName}`,
      };
  }
}

// ============================================================================
// Batch Executor (for multiple tool calls)
// ============================================================================

export async function executeToolsSequentially(
  toolCalls: Array<{ name: ToolName; arguments: string }>,
  context: ToolContext
): Promise<Array<{ toolName: ToolName; result: ToolResult }>> {
  const results: Array<{ toolName: ToolName; result: ToolResult }> = [];

  for (const call of toolCalls) {
    let params: unknown;
    try {
      params = JSON.parse(call.arguments);
    } catch {
      params = {};
    }

    const result = await executeTool(call.name, params, context);
    results.push({ toolName: call.name, result });

    if (!result.success && result.error?.includes('Rate limit')) {
      break;
    }
  }

  return results;
}
