-- Add is_fixed_cost column to expenses table
-- This allows the agent to decide freely if an expense is fixed or variable
-- independent of the category

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS is_fixed_cost boolean DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN public.expenses.is_fixed_cost IS 'Determines if expense appears in Fixed Costs (true) or Variable Costs (false). Agent decides this freely.';
