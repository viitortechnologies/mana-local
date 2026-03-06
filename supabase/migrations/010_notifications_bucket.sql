-- Storage bucket for admin notification images (optional; create via Dashboard if this fails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('notifications', 'notifications', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload (admin sends from app with auth)
CREATE POLICY "notifications_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'notifications');

CREATE POLICY "notifications_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'notifications');
