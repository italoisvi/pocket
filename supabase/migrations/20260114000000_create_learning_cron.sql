-- Migration: Create learning cron job for Walts Agent
-- This cron job runs weekly to extract patterns from user feedback

-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create agent_state table if not exists
CREATE TABLE IF NOT EXISTS agent_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  long_term_goals JSONB DEFAULT '[]'::jsonb,
  pending_tasks JSONB DEFAULT '[]'::jsonb,
  last_proactive_check TIMESTAMPTZ,
  agent_config JSONB DEFAULT '{"proactive_enabled": true, "notification_frequency": "daily"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT agent_state_user_id_unique UNIQUE (user_id)
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_agent_state_user_id ON agent_state(user_id);

-- Enable RLS
ALTER TABLE agent_state ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own agent state
DROP POLICY IF EXISTS "Users can view own agent state" ON agent_state;
CREATE POLICY "Users can view own agent state" ON agent_state
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can update their own agent state
DROP POLICY IF EXISTS "Users can update own agent state" ON agent_state;
CREATE POLICY "Users can update own agent state" ON agent_state
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Allow insert for authenticated users
DROP POLICY IF EXISTS "Users can insert own agent state" ON agent_state;
CREATE POLICY "Users can insert own agent state" ON agent_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can do anything (for edge functions)
DROP POLICY IF EXISTS "Service role full access to agent state" ON agent_state;
CREATE POLICY "Service role full access to agent state" ON agent_state
  USING (current_setting('role') = 'service_role');

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_agent_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agent_state_updated_at ON agent_state;
CREATE TRIGGER trigger_agent_state_updated_at
  BEFORE UPDATE ON agent_state
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_state_updated_at();

-- Add confidence column to walts_memory if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'walts_memory' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE walts_memory ADD COLUMN confidence DECIMAL(3,2) DEFAULT 1.0;
  END IF;
END $$;

-- Add source column to walts_memory if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'walts_memory' AND column_name = 'source'
  ) THEN
    ALTER TABLE walts_memory ADD COLUMN source TEXT DEFAULT 'user';
  END IF;
END $$;

-- Create unique constraint on walts_memory for upsert
-- First check if it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'walts_memory_user_type_key_unique'
  ) THEN
    -- Need to handle potential duplicates first
    -- Keep only the most recent entry for each user_id, memory_type, key combination
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY user_id, memory_type, key
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
      ) as rn
      FROM walts_memory
    )
    DELETE FROM walts_memory WHERE id IN (
      SELECT id FROM ranked WHERE rn > 1
    );

    -- Now add the unique constraint
    ALTER TABLE walts_memory
      ADD CONSTRAINT walts_memory_user_type_key_unique
      UNIQUE (user_id, memory_type, key);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Constraint may already exist or there was an error: %', SQLERRM;
END $$;

-- Schedule weekly learning job (runs every Sunday at 3 AM UTC)
-- Note: This requires the Supabase project to have pg_cron enabled
-- The actual HTTP call to the edge function needs to be configured separately
-- through Supabase Dashboard > Database > Extensions > pg_cron

-- Create a function to be called by pg_cron that will trigger the edge function
-- This is a placeholder - actual edge function invocation needs to be set up
-- via Supabase Dashboard or using pg_net extension

COMMENT ON TABLE agent_state IS 'Stores persistent state for each user''s AI agent including goals, tasks, and configuration';
COMMENT ON COLUMN agent_state.long_term_goals IS 'Array of user''s financial goals (e.g., "save R$1000/month")';
COMMENT ON COLUMN agent_state.pending_tasks IS 'Array of tasks the agent needs to complete';
COMMENT ON COLUMN agent_state.last_proactive_check IS 'Timestamp of last proactive analysis';
COMMENT ON COLUMN agent_state.agent_config IS 'Configuration for agent behavior (proactive checks, notification frequency)';
