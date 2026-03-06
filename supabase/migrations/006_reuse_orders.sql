-- Orders for reuse items (buyer requests to seller)
CREATE TABLE IF NOT EXISTS public.reuse_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reuse_item_id uuid NOT NULL REFERENCES public.reuse_items(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  delivery_option text NOT NULL CHECK (delivery_option IN ('self_pickup', 'third_party')),
  delivery_charge numeric NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  buyer_name text,
  buyer_phone text,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reuse_orders ENABLE ROW LEVEL SECURITY;

-- Buyer can insert their own orders
CREATE POLICY "reuse_orders_insert_buyer" ON public.reuse_orders
FOR INSERT TO authenticated
WITH CHECK (buyer_id = auth.uid());

-- Buyer and seller can see the order
CREATE POLICY "reuse_orders_select_buyer_seller" ON public.reuse_orders
FOR SELECT TO authenticated
USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Seller can update status
CREATE POLICY "reuse_orders_update_seller" ON public.reuse_orders
FOR UPDATE TO authenticated
USING (seller_id = auth.uid())
WITH CHECK (seller_id = auth.uid());

