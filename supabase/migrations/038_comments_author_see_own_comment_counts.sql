-- 1. Let comment author see their own comments (even pending) so "posted comments" show in post preview
CREATE POLICY "comments_select_author_own" ON public.comments
  FOR SELECT TO authenticated
  USING (auth.uid() = author_id);

-- 2. RPC to get approved comment counts per post (for home screen)
CREATE OR REPLACE FUNCTION public.get_post_comment_counts(post_ids uuid[])
RETURNS TABLE(post_id uuid, comment_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.post_id, COUNT(*)::bigint
  FROM public.comments c
  WHERE c.post_id = ANY(post_ids)
    AND c.approved_at IS NOT NULL
  GROUP BY c.post_id;
$$;

COMMENT ON FUNCTION public.get_post_comment_counts(uuid[]) IS 'Returns approved comment count per post for the given post IDs.';
