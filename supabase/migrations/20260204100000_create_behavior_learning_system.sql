-- Migration: Create Behavior Learning System
-- Implements:
-- 1. News interaction tracking tables
-- 2. User content preferences table
-- 3. Cron jobs for detect-patterns and walts-learn
-- 4. Trigger to call detect-patterns after transaction sync

-- ============================================
-- PART 1: NEWS TRACKING TABLES
-- ============================================

-- Table to track user interactions with news articles
CREATE TABLE IF NOT EXISTS news_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_url TEXT NOT NULL,
  article_title TEXT,
  article_source TEXT,
  article_topic TEXT, -- economia, mercado, crypto, politica, etc.
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'click', 'read_complete', 'share', 'save')),
  time_spent_seconds INTEGER DEFAULT 0,
  scroll_depth_percent INTEGER DEFAULT 0 CHECK (scroll_depth_percent >= 0 AND scroll_depth_percent <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_news_interactions_user_id ON news_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_news_interactions_topic ON news_interactions(article_topic);
CREATE INDEX IF NOT EXISTS idx_news_interactions_created_at ON news_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_interactions_user_topic ON news_interactions(user_id, article_topic);

-- Enable RLS
ALTER TABLE news_interactions ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own news interactions" ON news_interactions;
CREATE POLICY "Users can view own news interactions" ON news_interactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own news interactions" ON news_interactions;
CREATE POLICY "Users can insert own news interactions" ON news_interactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to news interactions" ON news_interactions;
CREATE POLICY "Service role full access to news interactions" ON news_interactions
  USING (current_setting('role', true) = 'service_role');

-- Table to store learned content preferences
CREATE TABLE IF NOT EXISTS user_content_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  score DECIMAL(4,3) DEFAULT 0.5 CHECK (score >= 0 AND score <= 1),
  interaction_count INTEGER DEFAULT 0,
  avg_time_spent_seconds DECIMAL(10,2) DEFAULT 0,
  avg_scroll_depth DECIMAL(5,2) DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_content_preferences_unique UNIQUE (user_id, topic)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_content_preferences_user_id ON user_content_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_content_preferences_score ON user_content_preferences(user_id, score DESC);

-- Enable RLS
ALTER TABLE user_content_preferences ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own content preferences" ON user_content_preferences;
CREATE POLICY "Users can view own content preferences" ON user_content_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own content preferences" ON user_content_preferences;
CREATE POLICY "Users can update own content preferences" ON user_content_preferences
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own content preferences" ON user_content_preferences;
CREATE POLICY "Users can insert own content preferences" ON user_content_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to content preferences" ON user_content_preferences;
CREATE POLICY "Service role full access to content preferences" ON user_content_preferences
  USING (current_setting('role', true) = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_content_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_content_preferences_updated_at ON user_content_preferences;
CREATE TRIGGER trigger_content_preferences_updated_at
  BEFORE UPDATE ON user_content_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_content_preferences_updated_at();

-- ============================================
-- PART 2: CRON JOBS FOR LEARNING SYSTEM
-- ============================================

-- Function to trigger detect-patterns for all users with recent transactions
CREATE OR REPLACE FUNCTION trigger_detect_patterns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
  supabase_url TEXT;
  service_key TEXT;
  request_id BIGINT;
  user_count INT := 0;
BEGIN
  RAISE NOTICE '[trigger_detect_patterns] Iniciando detecção de padrões...';

  -- Get config
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO service_key FROM app_config WHERE key = 'supabase_service_key';

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE NOTICE '[trigger_detect_patterns] ERRO: configuração não encontrada';
    RETURN;
  END IF;

  -- Find users with expenses in the last 30 days
  FOR user_record IN
    SELECT DISTINCT user_id
    FROM expenses
    WHERE created_at > NOW() - INTERVAL '30 days'
    UNION
    SELECT DISTINCT user_id
    FROM pluggy_transactions
    WHERE created_at > NOW() - INTERVAL '30 days'
    UNION
    SELECT DISTINCT user_id
    FROM belvo_transactions
    WHERE created_at > NOW() - INTERVAL '30 days'
    LIMIT 50
  LOOP
    BEGIN
      user_count := user_count + 1;

      SELECT net.http_post(
        url := supabase_url || '/functions/v1/detect-patterns',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'userId', user_record.user_id::text
        )
      ) INTO request_id;

      RAISE NOTICE '[trigger_detect_patterns] User % processado (request_id: %)',
                   user_record.user_id, request_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[trigger_detect_patterns] ERRO ao processar user %: %',
                   user_record.user_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[trigger_detect_patterns] Concluído. % usuários processados.', user_count;
END;
$$;

-- Function to trigger walts-learn for all users with feedback
CREATE OR REPLACE FUNCTION trigger_walts_learn()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
  supabase_url TEXT;
  service_key TEXT;
  request_id BIGINT;
  user_count INT := 0;
BEGIN
  RAISE NOTICE '[trigger_walts_learn] Iniciando aprendizado do Walts...';

  -- Get config
  SELECT value INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO service_key FROM app_config WHERE key = 'supabase_service_key';

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE NOTICE '[trigger_walts_learn] ERRO: configuração não encontrada';
    RETURN;
  END IF;

  -- Find users with recent agent actions that have feedback
  FOR user_record IN
    SELECT DISTINCT user_id
    FROM agent_actions_log
    WHERE user_feedback IS NOT NULL
      AND created_at > NOW() - INTERVAL '7 days'
    LIMIT 50
  LOOP
    BEGIN
      user_count := user_count + 1;

      SELECT net.http_post(
        url := supabase_url || '/functions/v1/walts-learn',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'userId', user_record.user_id::text
        )
      ) INTO request_id;

      RAISE NOTICE '[trigger_walts_learn] User % processado (request_id: %)',
                   user_record.user_id, request_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[trigger_walts_learn] ERRO ao processar user %: %',
                   user_record.user_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[trigger_walts_learn] Concluído. % usuários processados.', user_count;
END;
$$;

-- Function to update content preferences based on interactions
CREATE OR REPLACE FUNCTION trigger_update_content_preferences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pref_record RECORD;
  updated_count INT := 0;
BEGIN
  RAISE NOTICE '[trigger_update_content_preferences] Atualizando preferências de conteúdo...';

  -- Aggregate interactions by user and topic, then update preferences
  FOR pref_record IN
    SELECT
      user_id,
      article_topic as topic,
      COUNT(*) as interaction_count,
      AVG(time_spent_seconds) as avg_time,
      AVG(scroll_depth_percent) as avg_scroll,
      MAX(created_at) as last_interaction
    FROM news_interactions
    WHERE article_topic IS NOT NULL
      AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY user_id, article_topic
  LOOP
    -- Calculate score based on engagement
    -- Score formula: base(0.3) + interaction_weight(0.3) + time_weight(0.2) + scroll_weight(0.2)
    INSERT INTO user_content_preferences (
      user_id,
      topic,
      score,
      interaction_count,
      avg_time_spent_seconds,
      avg_scroll_depth,
      last_interaction_at
    ) VALUES (
      pref_record.user_id,
      pref_record.topic,
      LEAST(1.0, 0.3 +
        (LEAST(pref_record.interaction_count, 20) / 20.0 * 0.3) +
        (LEAST(pref_record.avg_time, 300) / 300.0 * 0.2) +
        (pref_record.avg_scroll / 100.0 * 0.2)
      ),
      pref_record.interaction_count,
      pref_record.avg_time,
      pref_record.avg_scroll,
      pref_record.last_interaction
    )
    ON CONFLICT (user_id, topic) DO UPDATE SET
      score = LEAST(1.0, 0.3 +
        (LEAST(EXCLUDED.interaction_count, 20) / 20.0 * 0.3) +
        (LEAST(EXCLUDED.avg_time_spent_seconds, 300) / 300.0 * 0.2) +
        (EXCLUDED.avg_scroll_depth / 100.0 * 0.2)
      ),
      interaction_count = EXCLUDED.interaction_count,
      avg_time_spent_seconds = EXCLUDED.avg_time_spent_seconds,
      avg_scroll_depth = EXCLUDED.avg_scroll_depth,
      last_interaction_at = EXCLUDED.last_interaction_at,
      updated_at = NOW();

    updated_count := updated_count + 1;
  END LOOP;

  RAISE NOTICE '[trigger_update_content_preferences] Concluído. % preferências atualizadas.', updated_count;
END;
$$;

-- ============================================
-- PART 3: SCHEDULE CRON JOBS
-- ============================================

-- Remove existing jobs if they exist
DO $$
BEGIN
  PERFORM cron.unschedule('detect-patterns-weekly');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job detect-patterns-weekly não existia';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('walts-learn-weekly');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job walts-learn-weekly não existia';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('update-content-preferences-daily');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job update-content-preferences-daily não existia';
END;
$$;

-- Schedule detect-patterns to run every Sunday at 3:00 AM UTC
SELECT cron.schedule(
  'detect-patterns-weekly',
  '0 3 * * 0', -- Sunday 3:00 AM UTC
  'SELECT trigger_detect_patterns()'
);

-- Schedule walts-learn to run every Sunday at 4:00 AM UTC (after detect-patterns)
SELECT cron.schedule(
  'walts-learn-weekly',
  '0 4 * * 0', -- Sunday 4:00 AM UTC
  'SELECT trigger_walts_learn()'
);

-- Schedule content preferences update daily at 5:00 AM UTC
SELECT cron.schedule(
  'update-content-preferences-daily',
  '0 5 * * *', -- Daily 5:00 AM UTC
  'SELECT trigger_update_content_preferences()'
);

-- ============================================
-- PART 4: COMMENTS
-- ============================================

COMMENT ON TABLE news_interactions IS 'Tracks user interactions with news articles in the feed';
COMMENT ON TABLE user_content_preferences IS 'Stores learned content preferences per user per topic';
COMMENT ON FUNCTION trigger_detect_patterns() IS 'Triggers pattern detection for all active users';
COMMENT ON FUNCTION trigger_walts_learn() IS 'Triggers Walts learning from user feedback';
COMMENT ON FUNCTION trigger_update_content_preferences() IS 'Updates content preferences based on news interactions';
