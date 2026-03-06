-- Nested comments (parent_id), comment likes, and post like/share count sync

-- 1. Comments: add parent_id for replies, like_count
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS like_count int DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_parent ON public.comments(post_id, parent_id);

COMMENT ON COLUMN public.comments.parent_id IS 'When set, this comment is a reply to another comment.';
COMMENT ON COLUMN public.comments.like_count IS 'Number of likes on this comment; kept in sync by trigger.';

-- 2. Comment likes table
CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes(comment_id);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select" ON public.comment_likes;
CREATE POLICY "comment_likes_select" ON public.comment_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comment_likes_insert" ON public.comment_likes;
CREATE POLICY "comment_likes_insert" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (SELECT public.profile_completion_ok(auth.uid()))
);

DROP POLICY IF EXISTS "comment_likes_delete_own" ON public.comment_likes;
CREATE POLICY "comment_likes_delete_own" ON public.comment_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3. Sync post.like_count when post_likes change
CREATE OR REPLACE FUNCTION public.sync_post_like_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS post_likes_sync_count ON public.post_likes;
CREATE TRIGGER post_likes_sync_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_like_count();

-- Backfill post.like_count from current post_likes (one-time)
UPDATE public.posts p
SET like_count = COALESCE((SELECT COUNT(*) FROM public.post_likes pl WHERE pl.post_id = p.id), 0)
WHERE like_count IS DISTINCT FROM (SELECT COUNT(*) FROM public.post_likes pl WHERE pl.post_id = p.id);

-- 4. Sync comment.like_count when comment_likes change
CREATE OR REPLACE FUNCTION public.sync_comment_like_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS comment_likes_sync_count ON public.comment_likes;
CREATE TRIGGER comment_likes_sync_count
  AFTER INSERT OR DELETE ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_comment_like_count();

-- 5. RPC to increment share count (called when user taps Share)
CREATE OR REPLACE FUNCTION public.increment_post_share(post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.posts SET share_count = share_count + 1 WHERE id = post_id;
END;
$$;

COMMENT ON FUNCTION public.increment_post_share(uuid) IS 'Increment share count when user shares the post.';
