-- Migration: Create Telegram integration tables
-- Description: Add tables for Telegram bot integration including accounts, conversations, and linking codes

-- Table: telegram_accounts
-- Stores Telegram user accounts linked to Pocket users
CREATE TABLE public.telegram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  telegram_first_name TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary_channel BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step TEXT DEFAULT 'welcome',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by telegram_user_id
CREATE INDEX idx_telegram_accounts_telegram_user_id ON public.telegram_accounts(telegram_user_id);
CREATE INDEX idx_telegram_accounts_user_id ON public.telegram_accounts(user_id);

-- Table: telegram_conversations
-- Stores conversation history for Telegram users (last 50 messages)
CREATE TABLE public.telegram_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_account_id UUID NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by telegram_account_id
CREATE INDEX idx_telegram_conversations_account_id ON public.telegram_conversations(telegram_account_id);

-- Table: link_codes
-- Stores temporary codes for linking Telegram accounts to existing iOS users
CREATE TABLE public.link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by code
CREATE INDEX idx_link_codes_code ON public.link_codes(code);
CREATE INDEX idx_link_codes_user_id ON public.link_codes(user_id);

-- Enable RLS on all tables
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for telegram_accounts
CREATE POLICY "Users can view own telegram accounts"
  ON public.telegram_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram accounts"
  ON public.telegram_accounts
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do everything (for the webhook)
CREATE POLICY "Service role full access to telegram_accounts"
  ON public.telegram_accounts
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for telegram_conversations
CREATE POLICY "Users can view own telegram conversations"
  ON public.telegram_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.telegram_accounts ta
      WHERE ta.id = telegram_account_id AND ta.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to telegram_conversations"
  ON public.telegram_conversations
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for link_codes
CREATE POLICY "Users can view own link codes"
  ON public.link_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own link codes"
  ON public.link_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to link_codes"
  ON public.link_codes
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_telegram_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for telegram_accounts
CREATE TRIGGER trigger_telegram_accounts_updated_at
  BEFORE UPDATE ON public.telegram_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_updated_at();

-- Trigger for telegram_conversations
CREATE TRIGGER trigger_telegram_conversations_updated_at
  BEFORE UPDATE ON public.telegram_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_updated_at();
