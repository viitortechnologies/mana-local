-- Allow multiple accounts per phone number in development.
-- Static OTP sign-in may reuse the same mobile for new anonymous users.

DROP INDEX IF EXISTS profiles_phone_key;

COMMENT ON COLUMN public.profiles.phone IS 'User phone (e.g. +919876543210). Non-unique; may be reused across multiple accounts.';

