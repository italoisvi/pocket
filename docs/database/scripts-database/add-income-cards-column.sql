-- Add income_cards column to profiles table
-- This column stores multiple income sources as JSON array

-- Add income_cards column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS income_cards JSONB DEFAULT '[]'::jsonb;

-- Add comment to the column
COMMENT ON COLUMN profiles.income_cards IS 'Array of income cards, each containing: id, salary, paymentDay, incomeSource';

-- Example structure:
-- [
--   {
--     "id": "1234567890",
--     "salary": "5.000,00",
--     "paymentDay": "5",
--     "incomeSource": "clt"
--   }
-- ]
