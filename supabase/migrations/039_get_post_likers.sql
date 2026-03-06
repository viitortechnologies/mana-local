-- RPC to return likers of a post with profile (name, avatar) for feed "Likes" sheet.
-- Uses SECURITY DEFINER so any authenticated user can see who liked a post.
CREATE OR REPLACE FUNCTION public.get_post_likers(post_id uuid)
RETURNS TABLE(id uuid, name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.avatar_url
  FROM public.post_likes pl
  JOIN public.profiles p ON p.id = pl.user_id
  WHERE pl.post_id = get_post_likers.post_id;
$$;

COMMENT ON FUNCTION public.get_post_likers(uuid) IS 'Returns id, name, avatar_url for users who liked the given post.';

-- RPC to return approved comments for a post with author name/avatar for feed "Comments" sheet.
CREATE OR REPLACE FUNCTION public.get_post_comment_list(post_id uuid)
RETURNS TABLE(id uuid, body text, author_id uuid, name text, avatar_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.body, c.author_id, p.name, p.avatar_url, c.created_at
  FROM public.comments c
  JOIN public.profiles p ON p.id = c.author_id
  WHERE c.post_id = get_post_comment_list.post_id
    AND c.approved_at IS NOT NULL
  ORDER BY c.created_at ASC;
$$;

COMMENT ON FUNCTION public.get_post_comment_list(uuid) IS 'Returns approved comments with author name/avatar for the given post.';
