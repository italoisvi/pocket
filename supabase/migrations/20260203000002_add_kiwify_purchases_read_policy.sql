-- Allow authenticated users to read their own purchases by email
CREATE POLICY "Users can read their own kiwify purchases"
  ON kiwify_purchases
  FOR SELECT
  TO authenticated
  USING (email = lower(auth.jwt() ->> 'email'));
