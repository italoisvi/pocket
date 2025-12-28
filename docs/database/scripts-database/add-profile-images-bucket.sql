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
