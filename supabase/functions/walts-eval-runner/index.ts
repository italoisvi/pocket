import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Types
// ============================================================================

type ToolExpectation = {
  name: string;
  min: number;
  max: number;
};

type DbAssertion = {
  type: 'table_row_exists' | 'row_count_delta' | 'field_equals';
  table: string;
  where?: Record<string, unknown>;
  field?: string;
  value?: unknown;
  delta?: number;
};

type EvalCase = {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  is_enabled: boolean;
  setup: Record<string, unknown>;
  history_seed: Array<{ role: 'user' | 'assistant'; content: string }>;
  user_message: string;
  expected_tools: ToolExpectation[];
  forbidden_tools: ToolExpectation[];
  expected_db_assertions: DbAssertion[];
  expected_response_contains: string[];
  forbidden_response_contains: string[];
  max_tool_calls: number;
  max_iterations: number;
};

type ToolCallLog = {
  name: string;
  args: unknown;
  ok: boolean;
  duration_ms: number;
};

type AssertionResult = {
  type: string;
  pass: boolean;
  detail: string;
};

type WaltsEvalResponse = {
  response: string;
  conversationId: string;
  eval?: {
    tool_calls: ToolCallLog[];
    iterations: number;
    total_duration_ms: number;
  };
};

// ============================================================================
// Assertion Functions
// ============================================================================

function assertExpectedTools(
  toolCalls: ToolCallLog[],
  expected: ToolExpectation[]
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const toolCounts: Record<string, number> = {};

  for (const call of toolCalls) {
    toolCounts[call.name] = (toolCounts[call.name] || 0) + 1;
  }

  for (const exp of expected) {
    const count = toolCounts[exp.name] || 0;
    const pass = count >= exp.min && count <= exp.max;
    results.push({
      type: 'tool_expected',
      pass,
      detail: `Tool "${exp.name}": esperado [${exp.min}-${exp.max}], obtido ${count}`,
    });
  }

  return results;
}

function assertForbiddenTools(
  toolCalls: ToolCallLog[],
  forbidden: ToolExpectation[]
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const toolCounts: Record<string, number> = {};

  for (const call of toolCalls) {
    toolCounts[call.name] = (toolCounts[call.name] || 0) + 1;
  }

  for (const forb of forbidden) {
    const count = toolCounts[forb.name] || 0;
    // Forbidden tools should have 0 calls (or within max if specified)
    const pass = count <= (forb.max ?? 0);
    results.push({
      type: 'tool_forbidden',
      pass,
      detail: `Tool proibida "${forb.name}": max ${forb.max ?? 0}, obtido ${count}`,
    });
  }

  return results;
}

function assertToolCount(
  toolCalls: ToolCallLog[],
  maxToolCalls: number
): AssertionResult {
  const pass = toolCalls.length <= maxToolCalls;
  return {
    type: 'tool_count',
    pass,
    detail: `Total tool calls: ${toolCalls.length} (max: ${maxToolCalls})`,
  };
}

function assertResponseContains(
  response: string,
  expected: string[]
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const responseLower = response.toLowerCase();

  for (const term of expected) {
    const pass = responseLower.includes(term.toLowerCase());
    results.push({
      type: 'response_contains',
      pass,
      detail: `Resposta ${pass ? 'contém' : 'NÃO contém'} "${term}"`,
    });
  }

  return results;
}

function assertResponseForbidden(
  response: string,
  forbidden: string[]
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const responseLower = response.toLowerCase();

  for (const term of forbidden) {
    const pass = !responseLower.includes(term.toLowerCase());
    results.push({
      type: 'response_forbidden',
      pass,
      detail: `Resposta ${pass ? 'NÃO contém' : 'CONTÉM'} termo proibido "${term}"`,
    });
  }

  return results;
}

async function assertDbAssertions(
  supabase: ReturnType<typeof createClient>,
  assertions: DbAssertion[],
  preCountsMap: Map<string, number>
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    try {
      if (assertion.type === 'row_count_delta') {
        const { count: postCount } = await supabase
          .from(assertion.table)
          .select('*', { count: 'exact', head: true });

        const preCount = preCountsMap.get(assertion.table) || 0;
        const actualDelta = (postCount || 0) - preCount;
        const pass = actualDelta === assertion.delta;

        results.push({
          type: 'db_assertion',
          pass,
          detail: `${assertion.table} row_count_delta: esperado ${assertion.delta}, obtido ${actualDelta}`,
        });
      } else if (assertion.type === 'table_row_exists') {
        let query = supabase.from(assertion.table).select('*');

        if (assertion.where) {
          for (const [key, value] of Object.entries(assertion.where)) {
            query = query.eq(key, value);
          }
        }

        const { data } = await query.limit(1);
        const pass = data && data.length > 0;

        results.push({
          type: 'db_assertion',
          pass,
          detail: `${assertion.table} row_exists: ${pass ? 'encontrado' : 'NÃO encontrado'}`,
        });
      } else if (assertion.type === 'field_equals') {
        let query = supabase.from(assertion.table).select(assertion.field!);

        if (assertion.where) {
          for (const [key, value] of Object.entries(assertion.where)) {
            query = query.eq(key, value);
          }
        }

        const { data } = await query.limit(1).single();
        const actualValue = data?.[assertion.field!];
        const pass = actualValue === assertion.value;

        results.push({
          type: 'db_assertion',
          pass,
          detail: `${assertion.table}.${assertion.field}: esperado ${assertion.value}, obtido ${actualValue}`,
        });
      }
    } catch (error) {
      results.push({
        type: 'db_assertion',
        pass: false,
        detail: `Erro ao verificar ${assertion.table}: ${error}`,
      });
    }
  }

  return results;
}

// ============================================================================
// Score Calculation
// ============================================================================

function calculateScore(assertions: AssertionResult[]): number {
  if (assertions.length === 0) return 1;

  // Weight by type
  const weights: Record<string, number> = {
    tool_expected: 0.45,
    tool_forbidden: 0.45, // Forbidden fail = score 0
    tool_count: 0.1,
    db_assertion: 0.35,
    response_contains: 0.15,
    response_forbidden: 0.15,
  };

  // Check for immediate fails (forbidden tools)
  const hasForbiddenFail = assertions.some(
    (a) => a.type === 'tool_forbidden' && !a.pass
  );
  if (hasForbiddenFail) return 0;

  // Calculate weighted score
  const byType: Record<string, { passed: number; total: number }> = {};

  for (const a of assertions) {
    const type = a.type;
    if (!byType[type]) byType[type] = { passed: 0, total: 0 };
    byType[type].total++;
    if (a.pass) byType[type].passed++;
  }

  let totalWeight = 0;
  let weightedScore = 0;

  for (const [type, counts] of Object.entries(byType)) {
    const weight = weights[type] || 0.1;
    const typeScore = counts.total > 0 ? counts.passed / counts.total : 1;
    weightedScore += typeScore * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedScore / totalWeight : 1;
}

// ============================================================================
// Run Single Eval Case
// ============================================================================

async function runEvalCase(
  evalCase: EvalCase,
  testUserId: string,
  supabase: ReturnType<typeof createClient>,
  runGroup: string
): Promise<{
  pass: boolean;
  score: number;
  tool_calls: ToolCallLog[];
  agent_output: string;
  assertions: AssertionResult[];
  error?: string;
}> {
  const startedAt = new Date().toISOString();

  try {
    // Pre-count for delta assertions
    const preCountsMap = new Map<string, number>();
    for (const assertion of evalCase.expected_db_assertions) {
      if (assertion.type === 'row_count_delta') {
        const { count } = await supabase
          .from(assertion.table)
          .select('*', { count: 'exact', head: true });
        preCountsMap.set(assertion.table, count || 0);
      }
    }

    // Call walts-agent in eval mode
    const waltsResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/walts-agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'x-eval-mode': 'true',
          'x-eval-max-iterations': evalCase.max_iterations.toString(),
        },
        body: JSON.stringify({
          message: evalCase.user_message,
          history: evalCase.history_seed,
          conversationId: `eval-${evalCase.id}-${Date.now()}`,
        }),
      }
    );

    if (!waltsResponse.ok) {
      const errorText = await waltsResponse.text();
      return {
        pass: false,
        score: 0,
        tool_calls: [],
        agent_output: '',
        assertions: [],
        error: `Walts API error: ${waltsResponse.status} - ${errorText}`,
      };
    }

    const waltsResult: WaltsEvalResponse = await waltsResponse.json();
    const toolCalls = waltsResult.eval?.tool_calls || [];
    const agentOutput = waltsResult.response;

    // Run assertions
    const assertions: AssertionResult[] = [];

    // Tool assertions
    assertions.push(...assertExpectedTools(toolCalls, evalCase.expected_tools));
    assertions.push(
      ...assertForbiddenTools(toolCalls, evalCase.forbidden_tools)
    );
    assertions.push(assertToolCount(toolCalls, evalCase.max_tool_calls));

    // Response assertions
    assertions.push(
      ...assertResponseContains(
        agentOutput,
        evalCase.expected_response_contains
      )
    );
    assertions.push(
      ...assertResponseForbidden(
        agentOutput,
        evalCase.forbidden_response_contains
      )
    );

    // DB assertions
    const dbAssertions = await assertDbAssertions(
      supabase,
      evalCase.expected_db_assertions,
      preCountsMap
    );
    assertions.push(...dbAssertions);

    // Calculate score and pass
    const score = calculateScore(assertions);
    const pass = assertions.every((a) => a.pass);

    return {
      pass,
      score,
      tool_calls: toolCalls,
      agent_output: agentOutput,
      assertions,
    };
  } catch (error) {
    return {
      pass: false,
      score: 0,
      tool_calls: [],
      agent_output: '',
      assertions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request
    const body = await req.json().catch(() => ({}));
    const {
      run_group = `manual-${new Date().toISOString().split('T')[0]}`,
      case_ids = null, // optional: specific case IDs to run
      domain = null, // optional: filter by domain
      test_user_id, // required: user ID to run tests as
    } = body as {
      run_group?: string;
      case_ids?: string[] | null;
      domain?: string | null;
      test_user_id: string;
    };

    if (!test_user_id) {
      return new Response(
        JSON.stringify({ error: 'test_user_id is required' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Fetch enabled eval cases
    let query = supabase
      .from('agent_eval_cases')
      .select('*')
      .eq('is_enabled', true)
      .order('domain')
      .order('name');

    if (case_ids && case_ids.length > 0) {
      query = query.in('id', case_ids);
    }

    if (domain) {
      query = query.eq('domain', domain);
    }

    const { data: cases, error: casesError } = await query;

    if (casesError) {
      return new Response(
        JSON.stringify({
          error: `Failed to fetch cases: ${casesError.message}`,
        }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    if (!cases || cases.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No eval cases found',
          filters: { case_ids, domain },
        }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    console.log(`[eval-runner] Running ${cases.length} eval cases`);

    // Run each case
    const results: Array<{
      case_id: string;
      case_name: string;
      domain: string;
      pass: boolean;
      score: number;
      error?: string;
    }> = [];

    for (const evalCase of cases) {
      console.log(`[eval-runner] Running case: ${evalCase.name}`);

      const startedAt = new Date().toISOString();
      const result = await runEvalCase(
        evalCase as EvalCase,
        test_user_id,
        supabase,
        run_group
      );
      const finishedAt = new Date().toISOString();

      // Save to agent_eval_runs
      await supabase.from('agent_eval_runs').insert({
        case_id: evalCase.id,
        run_group,
        model: 'gpt-4o',
        prompt_version: 'v1',
        toolset_version: 'v1',
        started_at: startedAt,
        finished_at: finishedAt,
        pass: result.pass,
        score: result.score,
        user_id: test_user_id,
        tool_calls: result.tool_calls,
        agent_output: result.agent_output,
        assertions: result.assertions,
        error: result.error || null,
      });

      results.push({
        case_id: evalCase.id,
        case_name: evalCase.name,
        domain: evalCase.domain,
        pass: result.pass,
        score: result.score,
        error: result.error,
      });

      console.log(
        `[eval-runner] Case ${evalCase.name}: ${result.pass ? 'PASS' : 'FAIL'} (score: ${result.score.toFixed(2)})`
      );
    }

    // Summary
    const totalCases = results.length;
    const passedCases = results.filter((r) => r.pass).length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / totalCases;

    const summary = {
      run_group,
      total_cases: totalCases,
      passed: passedCases,
      failed: totalCases - passedCases,
      pass_rate: (passedCases / totalCases) * 100,
      avg_score: avgScore,
      results,
    };

    console.log(
      `[eval-runner] Summary: ${passedCases}/${totalCases} passed (${summary.pass_rate.toFixed(1)}%)`
    );

    return new Response(JSON.stringify(summary), { headers: CORS_HEADERS });
  } catch (error) {
    console.error('[eval-runner] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
