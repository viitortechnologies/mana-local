-- Run this in Supabase Dashboard → SQL Editor if "Add new product" still fails with
-- "new row violates row-level security policy for table reuse_items".
-- Then try adding a product again.

DROP POLICY IF EXISTS "reuse_insert" ON public.reuse_items;
CREATE POLICY "reuse_insert" ON public.reuse_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);
