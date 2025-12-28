-- Add monthly_salary column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10, 2);
