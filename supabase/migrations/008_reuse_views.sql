-- Add view_count to reuse_items and helper function to increment
ALTER TABLE public.reuse_items
ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_reuse_view(reuse_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.reuse_items
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = reuse_id;
END;
$$;

