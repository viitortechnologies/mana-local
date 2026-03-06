-- Push notifications: tokens per device and user preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean DEFAULT false;

-- One row per device token; same user can have multiple tokens
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can manage only their own tokens
CREATE POLICY "push_tokens_select_own" ON public.push_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "push_tokens_insert_own" ON public.push_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_tokens_delete_own" ON public.push_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Service role (e.g. Edge Function) can read all tokens for sending (no policy = only service_role when RLS is on)
-- So we need a policy that allows no one else to read all. Default is users see only own. Good.

COMMENT ON TABLE public.push_tokens IS 'Expo push tokens for sending notifications; Edge Function uses service_role to read all.';
