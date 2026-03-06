-- Reviewer role: can contribute to the community and review users, products, and guidelines.
INSERT INTO public.roles (code, label, can_post, can_moderate) VALUES
  ('reviewer', 'Reviewer', true, true)
ON CONFLICT (code) DO NOTHING;
