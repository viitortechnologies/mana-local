-- Reuse product images bucket (public so listing thumbnails work).
-- App uploads with path: <user_id>/<timestamp>-<index>.<ext>
INSERT INTO storage.buckets (id, name, public)
VALUES ('reuse', 'reuse', true)
ON CONFLICT (id) DO NOTHING;

-- Insert: authenticated users can upload only to their own folder (first path segment = auth.uid())
CREATE POLICY "reuse_storage_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reuse'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Select: public read so product images load in listings and detail
CREATE POLICY "reuse_storage_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reuse');

CREATE POLICY "reuse_storage_select_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'reuse');

-- Update/Delete: only own folder (for replacing images)
CREATE POLICY "reuse_storage_update_authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'reuse' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'reuse' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "reuse_storage_delete_authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reuse' AND (storage.foldername(name))[1] = auth.uid()::text);
