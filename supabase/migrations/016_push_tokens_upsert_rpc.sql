-- Register or re-register push token for the current user (bypasses RLS).
-- Call from app: supabase.rpc('upsert_push_token', { p_expo_push_token: token }).
-- Only the authenticated user can register their own token.

CREATE OR REPLACE FUNCTION public.upsert_push_token(p_expo_push_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.push_tokens (user_id, expo_push_token)
  VALUES (auth.uid(), trim(p_expo_push_token))
  ON CONFLICT (expo_push_token)
  DO UPDATE SET user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_push_token(text) TO authenticated;
COMMENT ON FUNCTION public.upsert_push_token(text) IS 'Register or reclaim this device push token for the current user. Safe to call when enabling push notifications.';
