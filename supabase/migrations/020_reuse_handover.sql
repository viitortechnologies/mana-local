-- When seller approves one request, item moves to handover; no more requests/approvals.
ALTER TABLE public.reuse_items
  ADD COLUMN IF NOT EXISTS handover_order_id uuid REFERENCES public.reuse_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reuse_items_handover ON public.reuse_items(handover_order_id) WHERE handover_order_id IS NOT NULL;

COMMENT ON COLUMN public.reuse_items.handover_order_id IS 'Set when seller approves one order; item is then in handover, no new orders.';
