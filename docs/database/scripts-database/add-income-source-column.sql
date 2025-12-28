-- Add income_source column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS income_source TEXT;

-- Add comment to the column
COMMENT ON COLUMN profiles.income_source IS 'Source of income: clt, pj, autonomo, freelancer, empresario, aposentado, pensionista, investimentos, outros';
