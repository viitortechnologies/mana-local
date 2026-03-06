-- Allow buyers to cancel their own pending reuse orders, with optional note.
-- Idempotent: drop policy if it exists before (re)creating.

DROP POLICY IF EXISTS "reuse_orders_update_buyer_cancel" ON public.reuse_orders;

CREATE POLICY "reuse_orders_update_buyer_cancel" ON public.reuse_orders
FOR UPDATE TO authenticated
USING (
  buyer_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  buyer_id = auth.uid()
);

COMMENT ON POLICY "reuse_orders_update_buyer_cancel" ON public.reuse_orders IS
  'Buyer can cancel their own pending reuse orders.';

