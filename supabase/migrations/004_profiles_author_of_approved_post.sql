-- Allow any authenticated user to read profile (id, name, created_at) of authors of approved posts,
-- so the app can show "Author: name" and "Days since: N" on post cards and detail.
CREATE POLICY "profiles_select_author_of_approved_post" ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.author_id = profiles.id AND p.approved_at IS NOT NULL
  )
);
