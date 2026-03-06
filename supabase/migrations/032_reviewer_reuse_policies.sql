-- Allow reviewers to see and update all reuse_items (same as admin for product management).
CREATE TABLE IF NOT EXISTS public.reviewer_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.reviewer_users IS 'Set of user_ids that have the reviewer (or admin) role; used by RLS for reuse_items.';

GRANT SELECT ON public.reviewer_users TO authenticated;

ALTER TABLE public.reviewer_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviewer_users_select_own" ON public.reviewer_users;
CREATE POLICY "reviewer_users_select_own" ON public.reviewer_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Populate: both admin and reviewer roles can manage products
INSERT INTO public.reviewer_users (user_id)
SELECT ur.user_id
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id
WHERE r.code IN ('admin', 'reviewer')
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_reviewer_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_mod boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT (r.code IN ('admin', 'reviewer')) INTO is_mod FROM public.roles r WHERE r.id = NEW.role_id;
    IF is_mod THEN
      INSERT INTO public.reviewer_users (user_id) VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT (r.code IN ('admin', 'reviewer')) INTO is_mod FROM public.roles r WHERE r.id = OLD.role_id;
    IF is_mod THEN
      -- Remove only if no other admin/reviewer role left (exclude the row being deleted)
      IF NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = OLD.user_id AND ur.id != OLD.id AND r.code IN ('admin', 'reviewer')) THEN
        DELETE FROM public.reviewer_users WHERE user_id = OLD.user_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_reviewer_users_trigger ON public.user_roles;
CREATE TRIGGER sync_reviewer_users_trigger
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_reviewer_users();

CREATE OR REPLACE FUNCTION public.is_reviewer_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.reviewer_users WHERE user_id = auth.uid());
$$;

-- Reviewer (and admin) can select all reuse_items
DROP POLICY IF EXISTS "reuse_select_reviewer" ON public.reuse_items;
CREATE POLICY "reuse_select_reviewer" ON public.reuse_items
  FOR SELECT TO authenticated
  USING (public.is_reviewer_or_admin());

-- Reviewer (and admin) can update any reuse_item (hold, reject, activate, etc.)
DROP POLICY IF EXISTS "reuse_update_reviewer" ON public.reuse_items;
CREATE POLICY "reuse_update_reviewer" ON public.reuse_items
  FOR UPDATE TO authenticated
  USING (public.is_reviewer_or_admin());
