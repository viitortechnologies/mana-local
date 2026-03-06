-- Add category and subcategory to reuse_items for better discovery
ALTER TABLE public.reuse_items
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS subcategory text;

-- Backfill existing rows with a generic category so NOT NULL is safe later if desired
UPDATE public.reuse_items
SET category = COALESCE(category, 'general');

-- Optional: enforce NOT NULL going forward (commented out for now to avoid breaking manual inserts)
-- ALTER TABLE public.reuse_items ALTER COLUMN category SET NOT NULL;

-- Reviews (rating + optional comment) for reuse items
CREATE TABLE IF NOT EXISTS public.reuse_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reuse_item_id uuid NOT NULL REFERENCES public.reuse_items(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (reuse_item_id, reviewer_id)
);

ALTER TABLE public.reuse_reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they were created earlier (idempotent reruns)
DROP POLICY IF EXISTS "reuse_reviews_select" ON public.reuse_reviews;
DROP POLICY IF EXISTS "reuse_reviews_insert_own" ON public.reuse_reviews;
DROP POLICY IF EXISTS "reuse_reviews_update_own" ON public.reuse_reviews;
DROP POLICY IF EXISTS "reuse_reviews_delete_own" ON public.reuse_reviews;
DROP POLICY IF EXISTS "profiles_select_seller_of_approved_reuse" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_reuse_reviewer" ON public.profiles;

-- Anyone signed-in can see reviews
CREATE POLICY "reuse_reviews_select" ON public.reuse_reviews
FOR SELECT TO authenticated
USING (true);

-- Only the reviewer can insert/update/delete their own review
CREATE POLICY "reuse_reviews_insert_own" ON public.reuse_reviews
FOR INSERT TO authenticated
WITH CHECK (reviewer_id = auth.uid() AND (SELECT public.profile_completion_ok(auth.uid())));

CREATE POLICY "reuse_reviews_update_own" ON public.reuse_reviews
FOR UPDATE TO authenticated
USING (reviewer_id = auth.uid())
WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "reuse_reviews_delete_own" ON public.reuse_reviews
FOR DELETE TO authenticated
USING (reviewer_id = auth.uid());

-- Allow reading seller profile for approved reuse items
CREATE POLICY "profiles_select_seller_of_approved_reuse" ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reuse_items r
    WHERE r.seller_id = profiles.id AND r.approved_at IS NOT NULL
  )
);

-- Allow reading reviewer profile for reuse reviews
CREATE POLICY "profiles_select_reuse_reviewer" ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reuse_reviews rr
    WHERE rr.reviewer_id = profiles.id
  )
);


