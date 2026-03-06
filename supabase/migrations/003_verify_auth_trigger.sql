-- Run these in Supabase SQL Editor to verify auth → profiles/user_roles flow.
-- Our trigger runs AFTER INSERT on auth.users, so profiles/user_roles rows
-- are only created when auth.users gets a new row. You cannot have a profile
-- without a matching auth.users row (unless the auth user was deleted later).

-- 1) List triggers on auth.users (should include on_auth_user_created)
SELECT tgname AS trigger_name, relname AS table_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth' AND c.relname = 'users';

-- 2) Profile IDs that do NOT exist in auth.users (should return 0 rows)
-- If any row is returned, those profiles are orphaned (auth user missing).
SELECT p.id AS profile_id_missing_from_auth_users
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- 3) Counts: auth.users vs profiles (should match)
SELECT
  (SELECT count(*) FROM auth.users) AS auth_users_count,
  (SELECT count(*) FROM public.profiles) AS profiles_count;
