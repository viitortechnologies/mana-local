-- Allow admin and reviewer to see all posts (including unapproved) and to update posts (approve).
-- Uses existing is_reviewer_or_admin() and reviewer_users table from 032.

-- Moderators can select all posts (for approve-posts screen)
DROP POLICY IF EXISTS "posts_select_moderator" ON public.posts;
CREATE POLICY "posts_select_moderator" ON public.posts
  FOR SELECT TO authenticated
  USING (public.is_reviewer_or_admin());

-- Moderators (admin + reviewer) can update posts (e.g. set approved_at)
DROP POLICY IF EXISTS "posts_update_admin" ON public.posts;
CREATE POLICY "posts_update_moderator" ON public.posts
  FOR UPDATE TO authenticated
  USING (public.is_reviewer_or_admin());
