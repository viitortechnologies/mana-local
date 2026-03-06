-- Mana Local – Production-ready schema
-- Locations (fixed list for header)
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pincode text NOT NULL,
  display_name text NOT NULL GENERATED ALWAYS AS (name || ' ' || pincode) STORED,
  created_at timestamptz DEFAULT now(),
  UNIQUE(name, pincode)
);

INSERT INTO public.locations (name, pincode) VALUES
  ('Armoor', '503224'),
  ('Nirmal', '504106'),
  ('Jagtial', '505327')
ON CONFLICT (name, pincode) DO NOTHING;

-- Roles
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  can_post boolean DEFAULT false,
  can_moderate boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.roles (code, label, can_post, can_moderate) VALUES
  ('admin', 'Admin', true, true),
  ('community_member', 'Community Member', true, false),
  ('moderator', 'Moderator', true, true),
  ('delivery_partner', 'Delivery Partner', false, false)
ON CONFLICT (code) DO NOTHING;

-- user_roles: many roles per user, one active at a time (active stored in app/session)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role_id)
);

-- profiles: one per user; edits (except avatar) require admin approval
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  gender text,
  email text,
  email_verified_at timestamptz,
  job_type text,
  location_id uuid REFERENCES public.locations(id),
  area text,
  about text,
  status_text text,
  avatar_url text,
  date_of_birth date,
  -- approval
  pending_name text,
  pending_gender text,
  pending_job_type text,
  pending_location_id uuid REFERENCES public.locations(id),
  pending_area text,
  pending_about text,
  pending_status_text text,
  pending_date_of_birth date,
  profile_approved_at timestamptz,
  profile_completed_at timestamptz,
  can_post boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 21-day logic: if profile not completed within 21 days, restrict
CREATE OR REPLACE FUNCTION public.profile_completion_ok(p uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT profile_completed_at IS NOT NULL FROM public.profiles WHERE id = p),
    (SELECT (created_at + interval '21 days') > now() FROM public.profiles WHERE id = p)
  );
$$;

-- posts
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('problem', 'question', 'historical', 'business', 'general')),
  title text,
  body text,
  media_urls text[] DEFAULT '{}',
  approved_at timestamptz,
  view_count int DEFAULT 0,
  like_count int DEFAULT 0,
  share_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_location ON public.posts(location_id);
CREATE INDEX IF NOT EXISTS idx_posts_approved ON public.posts(approved_at) WHERE approved_at IS NOT NULL;

-- comments
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON public.comments(post_id);

-- reuse_items
CREATE TABLE IF NOT EXISTS public.reuse_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  mrp numeric NOT NULL CHECK (mrp >= 0),
  selling_price numeric NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  delivery_option text NOT NULL CHECK (delivery_option IN ('self_pickup', 'third_party')),
  delivery_charge numeric NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  media_urls text[] DEFAULT '{}',
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reuse_items_location ON public.reuse_items(location_id);
CREATE INDEX IF NOT EXISTS idx_reuse_items_approved ON public.reuse_items(approved_at) WHERE approved_at IS NOT NULL;

-- post_likes (for like count)
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- RLS
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reuse_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- locations: read for all
CREATE POLICY "locations_select" ON public.locations FOR SELECT TO authenticated USING (true);

-- roles: read for all
CREATE POLICY "roles_select" ON public.roles FOR SELECT TO authenticated USING (true);

-- user_roles: users see own
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_insert_own" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- profiles: read own + admins read all; insert/update own (avatar immediate, rest pending)
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = auth.uid() AND r.code = 'admin'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- posts: approved visible; app filters by location_id
CREATE POLICY "posts_select" ON public.posts FOR SELECT TO authenticated
  USING (approved_at IS NOT NULL);
CREATE POLICY "posts_insert" ON public.posts FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = author_id
  AND location_id IS NOT NULL
  AND (SELECT can_post FROM public.profiles WHERE id = auth.uid())
  AND (SELECT public.profile_completion_ok(auth.uid()))
);
CREATE POLICY "posts_update_admin" ON public.posts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = auth.uid() AND r.code = 'admin'));

-- comments: approved visible; insert if profile ok
CREATE POLICY "comments_select" ON public.comments FOR SELECT TO authenticated
  USING (approved_at IS NOT NULL);
CREATE POLICY "comments_insert" ON public.comments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = author_id
  AND (SELECT public.profile_completion_ok(auth.uid()))
);
CREATE POLICY "comments_update_admin" ON public.comments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = auth.uid() AND r.code = 'admin'));

-- post_likes
CREATE POLICY "post_likes_select" ON public.post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "post_likes_insert" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (SELECT public.profile_completion_ok(auth.uid()))
);
CREATE POLICY "post_likes_delete_own" ON public.post_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- reuse_items: approved visible; app filters by location_id
CREATE POLICY "reuse_select" ON public.reuse_items FOR SELECT TO authenticated
  USING (approved_at IS NOT NULL);
CREATE POLICY "reuse_insert" ON public.reuse_items FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = seller_id
  AND (SELECT public.profile_completion_ok(auth.uid()))
);
CREATE POLICY "reuse_update_admin" ON public.reuse_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = auth.uid() AND r.code = 'admin'));

-- Trigger: new user gets profile + community_member role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  SELECT id INTO rid FROM public.roles WHERE code = 'community_member' LIMIT 1;
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  IF rid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, rid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Increment post view count (RLS does not allow arbitrary update)
CREATE OR REPLACE FUNCTION public.increment_post_view(post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.posts SET view_count = view_count + 1 WHERE id = post_id;
END;
$$;
