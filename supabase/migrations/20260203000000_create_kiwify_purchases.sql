-- Create kiwify_purchases table to track purchases from Kiwify platform
CREATE TABLE IF NOT EXISTS kiwify_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL,
  access_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups (used during signup verification)
CREATE INDEX IF NOT EXISTS idx_kiwify_purchases_email ON kiwify_purchases(email);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_kiwify_purchases_status ON kiwify_purchases(status);

-- RLS policies
ALTER TABLE kiwify_purchases ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/update (via webhook Edge Function)
-- No user-facing read access needed (backend only)
CREATE POLICY "Service role full access on kiwify_purchases"
  ON kiwify_purchases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
