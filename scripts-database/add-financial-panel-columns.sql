-- Add financial panel columns to profiles table
-- This migration adds payment_day and income_source columns

-- Add payment_day column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS payment_day INTEGER;

-- Add income_source column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS income_source TEXT;

-- Add comments to the columns
COMMENT ON COLUMN profiles.payment_day IS 'Day of month when salary is received (1-31)';
COMMENT ON COLUMN profiles.income_source IS 'Source of income: clt, pj, autonomo, freelancer, empresario, aposentado, pensionista, investimentos, outros';
