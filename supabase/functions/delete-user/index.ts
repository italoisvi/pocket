import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'No authorization header provided',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase client with service role key (admin access)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Create a Supabase client with the user's JWT to verify authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the user is authenticated and get their ID
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('[DeleteUser] User error:', userError);
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'User not authenticated',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userId = user.id;
    console.log(`[DeleteUser] Deleting user: ${userId}`);

    // Delete data in correct order (respecting foreign keys)

    // 1. Delete Pluggy transactions
    const { error: pluggyTransactionsError } = await supabaseAdmin
      .from('pluggy_transactions')
      .delete()
      .eq('user_id', userId);

    if (pluggyTransactionsError) {
      console.error('[DeleteUser] Error deleting pluggy_transactions:', pluggyTransactionsError);
    }

    // 2. Delete Pluggy accounts
    const { error: pluggyAccountsError } = await supabaseAdmin
      .from('pluggy_accounts')
      .delete()
      .eq('user_id', userId);

    if (pluggyAccountsError) {
      console.error('[DeleteUser] Error deleting pluggy_accounts:', pluggyAccountsError);
    }

    // 3. Delete Pluggy items
    const { error: pluggyItemsError } = await supabaseAdmin
      .from('pluggy_items')
      .delete()
      .eq('user_id', userId);

    if (pluggyItemsError) {
      console.error('[DeleteUser] Error deleting pluggy_items:', pluggyItemsError);
    }

    // 4. Delete budgets
    const { error: budgetsError } = await supabaseAdmin
      .from('budgets')
      .delete()
      .eq('user_id', userId);

    if (budgetsError) {
      console.error('[DeleteUser] Error deleting budgets:', budgetsError);
    }

    // 5. Delete expenses
    const { error: expensesError } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('user_id', userId);

    if (expensesError) {
      console.error('[DeleteUser] Error deleting expenses:', expensesError);
    }

    // 6. Delete conversations
    const { error: conversationsError } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('user_id', userId);

    if (conversationsError) {
      console.error('[DeleteUser] Error deleting conversations:', conversationsError);
    }

    // 7. Delete profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('[DeleteUser] Error deleting profile:', profileError);
    }

    // 8. Delete user from auth (THIS IS THE KEY STEP!)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(
      userId
    );

    if (deleteUserError) {
      console.error('[DeleteUser] Error deleting auth user:', deleteUserError);
      return new Response(
        JSON.stringify({
          error: 'Failed to delete user',
          message: deleteUserError.message,
          details: deleteUserError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[DeleteUser] Successfully deleted user: ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User and all data deleted successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[DeleteUser] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
