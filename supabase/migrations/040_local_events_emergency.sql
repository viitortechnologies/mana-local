-- Local events (user-submitted, approval flow)
CREATE TABLE IF NOT EXISTS public.local_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_location text,
  organizer_name text,
  contact_number text,
  image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_events_location ON public.local_events(location_id);
CREATE INDEX IF NOT EXISTS idx_local_events_status ON public.local_events(status) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_local_events_date ON public.local_events(event_date);

ALTER TABLE public.local_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "local_events_select_approved" ON public.local_events
  FOR SELECT TO authenticated
  USING (status = 'approved');

CREATE POLICY "local_events_select_own" ON public.local_events
  FOR SELECT TO authenticated
  USING (submitted_by = auth.uid());

CREATE POLICY "local_events_insert" ON public.local_events
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "local_events_update_own" ON public.local_events
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid());

-- Admin/reviewer can update status (approve/reject)
CREATE POLICY "local_events_update_admin" ON public.local_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid() AND (r.code = 'admin' OR r.code = 'reviewer'))
  );

-- Emergency contacts (admin-managed, per location or global)
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('ambulance', 'police', 'fire', 'hospital', 'blood_bank')),
  name text NOT NULL,
  phone text NOT NULL,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_location ON public.emergency_contacts(location_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_category ON public.emergency_contacts(category);

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emergency_contacts_select" ON public.emergency_contacts
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.local_events IS 'User-submitted local events; only approved visible publicly.';
COMMENT ON TABLE public.emergency_contacts IS 'Emergency numbers; insert/update via admin or seed.';

-- Seed generic emergency numbers (India). Run once; replace with your local numbers as needed.
INSERT INTO public.emergency_contacts (location_id, category, name, phone, display_order) VALUES
  (NULL, 'ambulance', 'Emergency Ambulance', '102', 0),
  (NULL, 'ambulance', 'National Ambulance', '108', 1),
  (NULL, 'police', 'Police Emergency', '100', 0),
  (NULL, 'fire', 'Fire Brigade', '101', 0),
  (NULL, 'hospital', 'COVID Helpline', '1075', 0);
