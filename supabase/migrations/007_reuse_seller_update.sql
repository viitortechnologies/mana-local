-- Allow sellers to update their own reuse items (without needing admin)
-- Drop first so migration can be re-run safely
DROP POLICY IF EXISTS "reuse_update_seller_own" ON public.reuse_items;

CREATE POLICY "reuse_update_seller_own" ON public.reuse_items
FOR UPDATE TO authenticated
USING (seller_id = auth.uid())
WITH CHECK (seller_id = auth.uid());


