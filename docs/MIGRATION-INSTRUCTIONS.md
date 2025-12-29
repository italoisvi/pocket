# Migration Instructions for Pocket App

This document contains the SQL scripts that need to be executed in your Supabase SQL Editor to fix current issues.

## Required Migrations

### 1. Add avatar_url column to profiles table

```sql
-- Adicionar coluna avatar_url na tabela profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Adicionar comentário na coluna
COMMENT ON COLUMN profiles.avatar_url IS 'URL da foto de perfil do usuário armazenada no Supabase Storage';
```

### 2. Add category and subcategory columns to expenses table

```sql
-- Adiciona coluna de categoria na tabela expenses
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'outros',
ADD COLUMN IF NOT EXISTS subcategory TEXT;
```

### 3. Create profile-images storage bucket

```sql
-- Create storage bucket for profile images
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for profile images (drop if exists first to make idempotent)
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
CREATE POLICY "Users can upload their own profile images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Anyone can view profile images" ON storage.objects;
CREATE POLICY "Anyone can view profile images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-images');

DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
CREATE POLICY "Users can update their own profile images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
CREATE POLICY "Users can delete their own profile images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## Execution Steps

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Copy and paste each section above
5. Execute them one by one
6. Verify that each migration was successful before moving to the next

## Verification

After running all migrations, verify:

1. The `profiles` table has the `avatar_url` column:

   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'profiles';
   ```

2. The `expenses` table has `category` and `subcategory` columns:

   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'expenses';
   ```

3. The `profile-images` storage bucket exists:
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'profile-images';
   ```

## Notes

- These migrations are idempotent (can be run multiple times safely)
- The `IF NOT EXISTS` clauses prevent errors if columns already exist
- The `ON CONFLICT DO NOTHING` prevents errors if the storage bucket already exists
