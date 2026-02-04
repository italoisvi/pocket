-- Add kiwify_access_until column to profiles table
-- NULL = not from Kiwify (normal subscriber or no access)
-- With date = from Kiwify, access valid until this date
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kiwify_access_until TIMESTAMPTZ DEFAULT NULL;
