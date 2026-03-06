-- Allow any authenticated user with profile_completion_ok to create posts (remove can_post gate).
-- Run this so "anyone" can post in community without admin granting can_post.
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
CREATE POLICY "posts_insert" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND location_id IS NOT NULL
    AND (SELECT public.profile_completion_ok(auth.uid()))
  );
