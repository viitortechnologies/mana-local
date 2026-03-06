-- RPC to return request (order) counts per reuse item for listing/detail display.
-- Uses SECURITY DEFINER so counts are correct regardless of RLS (buyer/seller only see orders).
-- Returns only (reuse_item_id, request_count); no order details exposed.

CREATE OR REPLACE FUNCTION public.get_reuse_request_counts(reuse_item_ids uuid[])
RETURNS TABLE(reuse_item_id uuid, request_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ro.reuse_item_id, count(*)::bigint
  FROM public.reuse_orders ro
  WHERE ro.reuse_item_id = ANY(reuse_item_ids)
  GROUP BY ro.reuse_item_id;
$$;

COMMENT ON FUNCTION public.get_reuse_request_counts(uuid[]) IS
  'Returns order count per reuse item for display; does not expose order details.';

GRANT EXECUTE ON FUNCTION public.get_reuse_request_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reuse_request_counts(uuid[]) TO anon;
