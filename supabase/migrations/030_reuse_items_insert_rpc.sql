-- Insert reuse item via RPC so it works even when RLS policy blocks direct insert.
-- Caller must be authenticated and seller_id must equal auth.uid().
CREATE OR REPLACE FUNCTION public.insert_reuse_item(
  p_location_id uuid,
  p_seller_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_subcategory text DEFAULT NULL,
  p_mrp numeric DEFAULT 0,
  p_delivery_option text DEFAULT 'self_pickup',
  p_delivery_charge numeric DEFAULT 0,
  p_media_urls text[] DEFAULT '{}',
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() != p_seller_id THEN
    RAISE EXCEPTION 'seller_id must be the current user';
  END IF;

  v_expires_at := COALESCE(p_expires_at, (now() + interval '21 days')::timestamptz);

  INSERT INTO public.reuse_items (
    location_id,
    seller_id,
    title,
    description,
    category,
    subcategory,
    mrp,
    selling_price,
    delivery_option,
    delivery_charge,
    media_urls,
    is_active,
    expires_at
  ) VALUES (
    p_location_id,
    p_seller_id,
    p_title,
    NULLIF(trim(p_description), ''),
    p_category,
    NULLIF(trim(p_subcategory), ''),
    COALESCE(p_mrp, 0),
    0,
    COALESCE(p_delivery_option, 'self_pickup'),
    COALESCE(p_delivery_charge, 0),
    COALESCE(p_media_urls, '{}'),
    true,
    v_expires_at
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_reuse_item(uuid, uuid, text, text, text, text, numeric, text, numeric, text[], timestamptz) TO authenticated;
COMMENT ON FUNCTION public.insert_reuse_item IS 'Insert a reuse item as the current user (seller_id). Bypasses RLS to avoid policy issues.';
