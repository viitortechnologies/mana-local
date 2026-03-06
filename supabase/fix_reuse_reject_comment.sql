-- Run in Supabase SQL Editor to add Reject + admin comment support for approve products.
-- Required for Approve/Reject with comment on the Approve products screen.

ALTER TABLE public.reuse_items
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_comment text;

COMMENT ON COLUMN public.reuse_items.rejected_at IS 'Set when admin rejects the listing.';
COMMENT ON COLUMN public.reuse_items.admin_comment IS 'Admin note when approving or rejecting.';
