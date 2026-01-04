-- Enable RLS on all tables (if not already enabled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pluggy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pluggy_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pluggy_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing delete policies if they exist
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can delete their own pluggy items" ON public.pluggy_items;
DROP POLICY IF EXISTS "Users can delete their own pluggy accounts" ON public.pluggy_accounts;
DROP POLICY IF EXISTS "Users can delete their own pluggy transactions" ON public.pluggy_transactions;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.conversations;

-- Create DELETE policies for each table
-- These policies allow users to delete only their own data

-- Profiles: users can delete their own profile
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- Expenses: users can delete their own expenses
CREATE POLICY "Users can delete their own expenses"
ON public.expenses
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Budgets: users can delete their own budgets
CREATE POLICY "Users can delete their own budgets"
ON public.budgets
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Pluggy Items: users can delete their own pluggy items
CREATE POLICY "Users can delete their own pluggy items"
ON public.pluggy_items
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Pluggy Accounts: users can delete their own pluggy accounts
CREATE POLICY "Users can delete their own pluggy accounts"
ON public.pluggy_accounts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Pluggy Transactions: users can delete their own pluggy transactions
CREATE POLICY "Users can delete their own pluggy transactions"
ON public.pluggy_transactions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Conversations: users can delete their own conversations
CREATE POLICY "Users can delete their own conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON POLICY "Users can delete their own profile" ON public.profiles IS 'Allows authenticated users to delete their own profile data';
COMMENT ON POLICY "Users can delete their own expenses" ON public.expenses IS 'Allows authenticated users to delete their own expenses';
COMMENT ON POLICY "Users can delete their own budgets" ON public.budgets IS 'Allows authenticated users to delete their own budgets';
COMMENT ON POLICY "Users can delete their own pluggy items" ON public.pluggy_items IS 'Allows authenticated users to delete their own Pluggy items';
COMMENT ON POLICY "Users can delete their own pluggy accounts" ON public.pluggy_accounts IS 'Allows authenticated users to delete their own Pluggy accounts';
COMMENT ON POLICY "Users can delete their own pluggy transactions" ON public.pluggy_transactions IS 'Allows authenticated users to delete their own Pluggy transactions';
COMMENT ON POLICY "Users can delete their own conversations" ON public.conversations IS 'Allows authenticated users to delete their own conversations';
