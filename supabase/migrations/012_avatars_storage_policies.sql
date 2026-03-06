-- Ensure avatars bucket exists (public so avatar URLs work).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload, read, update, and delete their own avatar files.
-- Path format in app: avatars/<user_id>/<filename> so (storage.foldername(name))[1] = auth.uid()::text.

-- Insert: users can upload only to their own folder (avatars/<their-uid>/...)
CREATE POLICY "avatars_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Select: authenticated and public (so avatar URLs work for profile views)
CREATE POLICY "avatars_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_select_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'avatars');

-- Update: needed for upsert; restrict to own folder
CREATE POLICY "avatars_update_authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Delete: users can remove only their own files (e.g. when replacing avatar)
CREATE POLICY "avatars_delete_authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
