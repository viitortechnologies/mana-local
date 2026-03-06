-- Account status: active (default) or blocked (admin can set; blocked = inactive until admin sets active)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'blocked'));

COMMENT ON COLUMN public.profiles.account_status IS 'active = normal; blocked = permanently inactive until admin sets active on users screen.';

-- Reports: any user can report another; admin sees count (e.g. if >= 3 highlight)
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports(reported_id);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_reports_insert_own" ON public.user_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "user_reports_select_own" ON public.user_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

CREATE POLICY "user_reports_select_admin" ON public.user_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.code = 'admin'
    )
  );

-- Personal blocks: blocker_id blocks blocked_id
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_blocks_select_own" ON public.user_blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);

CREATE POLICY "user_blocks_insert_own" ON public.user_blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "user_blocks_delete_own" ON public.user_blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- Admin: update any profile (for account_status and other fields)
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.code = 'admin'
    )
  );

-- Admin: select all user_roles (to list users with roles)
CREATE POLICY "user_roles_select_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.code = 'admin'
    )
  );

-- Admin: insert/delete user_roles for any user (assign / remove roles)
CREATE POLICY "user_roles_insert_admin" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.code = 'admin'
    )
  );

CREATE POLICY "user_roles_delete_admin" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.code = 'admin'
    )
  );

-- RPC: report counts per user (for admin users list)
CREATE OR REPLACE FUNCTION public.get_report_counts(user_ids uuid[])
RETURNS TABLE(user_id uuid, report_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT reported_id AS user_id, count(*)::bigint
  FROM public.user_reports
  WHERE reported_id = ANY(user_ids)
  GROUP BY reported_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_counts(uuid[]) TO authenticated;
