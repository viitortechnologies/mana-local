-- Admin can reject items; store rejection/approval comment.
ALTER TABLE public.reuse_items
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_comment text;

COMMENT ON COLUMN public.reuse_items.rejected_at IS 'Set when admin rejects the listing; pending = approved_at and rejected_at both null.';
COMMENT ON COLUMN public.reuse_items.admin_comment IS 'Admin note when approving or rejecting (optional but recommended).';
