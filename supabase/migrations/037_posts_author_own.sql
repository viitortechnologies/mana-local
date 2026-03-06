-- Allow post author to select, update, and delete their own posts (for "My requests" Post tab).

-- Author can see their own posts (including pending approval)
CREATE POLICY "posts_select_author" ON public.posts
  FOR SELECT TO authenticated
  USING (auth.uid() = author_id);

-- Author can update their own posts (e.g. edit before/after approval)
CREATE POLICY "posts_update_author" ON public.posts
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Author can delete their own posts (withdraw / remove)
CREATE POLICY "posts_delete_author" ON public.posts
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);
