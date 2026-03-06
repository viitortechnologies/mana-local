-- Store phone per user; one signup per mobile (unique).
-- Phone auth uses auth.users.phone; we mirror it here for display and for anonymous fallback.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON public.profiles (phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN public.profiles.phone IS 'User phone (e.g. +919876543210). Unique: one account per number. Set by phone auth or on first anonymous sign-in.';

-- Trigger: set profile.phone from auth.users.phone when present (phone auth creates user with phone set)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rid uuid;
  user_phone text;
BEGIN
  user_phone := NEW.phone;
  IF user_phone IS NULL AND NEW.raw_user_meta_data IS NOT NULL THEN
    user_phone := NEW.raw_user_meta_data->>'phone';
  END IF;
  INSERT INTO public.profiles (id, email, phone)
  VALUES (NEW.id, NEW.email, user_phone);
  SELECT id INTO rid FROM public.roles WHERE code = 'community_member' LIMIT 1;
  IF rid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, rid);
  END IF;
  RETURN NEW;
END;
$$;
