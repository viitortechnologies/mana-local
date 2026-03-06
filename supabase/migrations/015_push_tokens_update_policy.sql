-- Allow updating any push token row to point to the current user.
-- This makes upsert(user_id, expo_push_token) work even when the same device
-- has an existing token row for a previous user.

DROP POLICY IF EXISTS "push_tokens_update_any_to_self" ON public.push_tokens;

CREATE POLICY "push_tokens_update_any_to_self" ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = user_id);

