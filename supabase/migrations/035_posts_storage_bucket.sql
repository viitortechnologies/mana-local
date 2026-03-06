-- Community post media bucket (cover + images + videos). Public so post media loads in feed.
-- App uploads with path: <user_id>/<timestamp>-<index>.<ext>
INSERT INTO storage.buckets (id, name, public)
VALUES ('posts', 'posts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "posts_storage_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "posts_storage_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'posts');

CREATE POLICY "posts_storage_select_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'posts');

CREATE POLICY "posts_storage_update_authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'posts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "posts_storage_delete_authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = auth.uid()::text);
