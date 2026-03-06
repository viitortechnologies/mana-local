-- Ensure authenticated users can insert reuse_items when they are the seller.
-- Fixes "new row violates row-level security policy for table reuse_items" on add product.
DROP POLICY IF EXISTS "reuse_insert" ON public.reuse_items;
CREATE POLICY "reuse_insert" ON public.reuse_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);

COMMENT ON POLICY "reuse_insert" ON public.reuse_items IS
  'Authenticated user can add a reuse item only as seller (seller_id = auth.uid()).';
