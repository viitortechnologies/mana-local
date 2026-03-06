-- Require profile completion (or within 21-day grace) to request a reuse product. Incomplete profiles are viewer-only.
DROP POLICY IF EXISTS "reuse_orders_insert_buyer" ON public.reuse_orders;
CREATE POLICY "reuse_orders_insert_buyer" ON public.reuse_orders
FOR INSERT TO authenticated
WITH CHECK (
  buyer_id = auth.uid()
  AND (SELECT public.profile_completion_ok(auth.uid()))
);

COMMENT ON POLICY "reuse_orders_insert_buyer" ON public.reuse_orders IS
  'Buyer can request only when profile is complete or within 21-day signup grace.';
