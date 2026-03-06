-- Seller comment and timestamp when approving or rejecting a request
ALTER TABLE public.reuse_orders
  ADD COLUMN IF NOT EXISTS seller_note text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

COMMENT ON COLUMN public.reuse_orders.seller_note IS 'Comment from seller when approving or rejecting (e.g. Deal done and handovered).';
COMMENT ON COLUMN public.reuse_orders.status_changed_at IS 'When status was set to accepted or rejected.';
