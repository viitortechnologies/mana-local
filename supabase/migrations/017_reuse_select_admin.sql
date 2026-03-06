-- Allow admins to select all reuse_items (including pending approval) for the approve-products screen.
CREATE POLICY "reuse_select_admin" ON public.reuse_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.code = 'admin'
    )
  );
