-- Allow unauthenticated check: is this phone already registered?
-- Used in dev flow (OTP 1234) to avoid "Database error creating anonymous user" when same number is used again.
CREATE OR REPLACE FUNCTION public.phone_exists(phone_number text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE phone = trim(phone_number) AND phone IS NOT NULL LIMIT 1);
$$;

COMMENT ON FUNCTION public.phone_exists(text) IS 'Returns true if a profile already has this phone (one account per mobile). Callable by anon for dev OTP flow.';

GRANT EXECUTE ON FUNCTION public.phone_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.phone_exists(text) TO authenticated;
