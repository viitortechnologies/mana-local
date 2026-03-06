-- Listings expire in 21 days; user can set active/inactive and reactivate from My products.
ALTER TABLE public.reuse_items
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill: existing approved items get expires_at = created_at + 21 days if not set
UPDATE public.reuse_items
SET expires_at = created_at + interval '21 days'
WHERE expires_at IS NULL AND approved_at IS NOT NULL;

-- New rows can set expires_at on insert; default for approved_at flow handled in app
COMMENT ON COLUMN public.reuse_items.is_active IS 'User can toggle; inactive items are hidden from public listing.';
COMMENT ON COLUMN public.reuse_items.expires_at IS 'Listing expires at this time; reactivate sets to now() + 21 days.';

CREATE INDEX IF NOT EXISTS idx_reuse_items_active_expires ON public.reuse_items(is_active, expires_at)
  WHERE is_active = true AND approved_at IS NOT NULL;
