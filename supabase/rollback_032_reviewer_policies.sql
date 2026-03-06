-- Run this in Supabase SQL Editor only if you need to completely remove
-- migration 032 objects (reviewer_users table, policies, trigger, functions).
-- After running this, you can re-run 032_reviewer_reuse_policies.sql.

-- Drop reuse_items policies (from this migration)
DROP POLICY IF EXISTS "reuse_select_reviewer" ON public.reuse_items;
DROP POLICY IF EXISTS "reuse_update_reviewer" ON public.reuse_items;

-- Drop trigger and function
DROP TRIGGER IF EXISTS sync_reviewer_users_trigger ON public.user_roles;
DROP FUNCTION IF EXISTS public.sync_reviewer_users();

-- Drop helper function
DROP FUNCTION IF EXISTS public.is_reviewer_or_admin();

-- Drop reviewer_users table (and its policy)
DROP POLICY IF EXISTS "reviewer_users_select_own" ON public.reviewer_users;
DROP TABLE IF EXISTS public.reviewer_users;
