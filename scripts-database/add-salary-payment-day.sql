-- Adicionar campo para dia do pagamento do salário
-- Execute este script no SQL Editor do Supabase

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS salary_payment_day INTEGER DEFAULT 1 CHECK (salary_payment_day >= 1 AND salary_payment_day <= 31);

COMMENT ON COLUMN profiles.salary_payment_day IS 'Dia do mês em que o usuário recebe o salário (1-31)';

-- Verificar a estrutura
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('monthly_salary', 'salary_payment_day');
