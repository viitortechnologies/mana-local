-- Break RLS infinite recursion: policies that check "is admin?" must not query user_roles
-- (because user_roles' own admin policy would query user_roles again).
-- Use a small table admin_users (user_id) kept in sync by trigger; policies check this table.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.admin_users IS 'Set of user_ids that have the admin role; used by RLS to avoid recursion.';

GRANT SELECT ON public.admin_users TO authenticated;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users_select_own" ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Populate from current admins
INSERT INTO public.admin_users (user_id)
SELECT ur.user_id
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id
WHERE r.code = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- Keep admin_users in sync when user_roles change
CREATE OR REPLACE FUNCTION public.sync_admin_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_role boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT (r.code = 'admin') INTO is_admin_role FROM public.roles r WHERE r.id = NEW.role_id;
    IF is_admin_role THEN
      INSERT INTO public.admin_users (user_id) VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT (r.code = 'admin') INTO is_admin_role FROM public.roles r WHERE r.id = OLD.role_id;
    IF is_admin_role THEN
      DELETE FROM public.admin_users WHERE user_id = OLD.user_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_admin_users_trigger ON public.user_roles;
CREATE TRIGGER sync_admin_users_trigger
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_users();

-- Helper for policies: same meaning, no recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

-- Drop recursive admin policies on user_roles and recreate using admin_users
DROP POLICY IF EXISTS "user_roles_select_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_admin" ON public.user_roles;

CREATE POLICY "user_roles_select_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "user_roles_insert_admin" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "user_roles_delete_admin" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Replace admin checks on other tables so they use admin_users (optional but consistent)
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "reuse_select_admin" ON public.reuse_items;
CREATE POLICY "reuse_select_admin" ON public.reuse_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "reuse_update_admin" ON public.reuse_items;
CREATE POLICY "reuse_update_admin" ON public.reuse_items
  FOR UPDATE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "posts_update_admin" ON public.posts;
CREATE POLICY "posts_update_admin" ON public.posts
  FOR UPDATE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "comments_update_admin" ON public.comments;
CREATE POLICY "comments_update_admin" ON public.comments
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- user_reports_select_admin (024)
DROP POLICY IF EXISTS "user_reports_select_admin" ON public.user_reports;
CREATE POLICY "user_reports_select_admin" ON public.user_reports
  FOR SELECT TO authenticated
  USING (public.is_admin());
