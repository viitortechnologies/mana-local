-- Allow authenticated users to add reuse items without requiring profile_completion_ok.
-- Fixes "new row violates row-level security policy" when adding a new product.
DROP POLICY IF EXISTS "reuse_insert" ON public.reuse_items;
CREATE POLICY "reuse_insert" ON public.reuse_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);
