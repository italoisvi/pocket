-- Add debt_notifications_enabled column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS debt_notifications_enabled boolean DEFAULT false;

-- Update documentation
COMMENT ON COLUMN public.profiles.debt_notifications_enabled IS 'Enable/disable push notifications for debt alerts';
