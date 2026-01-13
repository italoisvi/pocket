-- Adiciona campo is_cash para marcar pagamentos em dinheiro
-- Gastos em dinheiro são sempre considerados no saldo (não são temporários)
-- e nunca são deletados pela sincronização com o banco

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS is_cash boolean DEFAULT false;

-- Comentário para documentação
COMMENT ON COLUMN public.expenses.is_cash IS 'Indica se o pagamento foi feito em dinheiro. Gastos em dinheiro são sempre considerados no cálculo do saldo e não são afetados pela sincronização bancária.';
