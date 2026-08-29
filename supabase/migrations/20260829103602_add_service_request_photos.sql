/*
# Add Service Request Photos

1. New Tables
- `service_request_photos`
  - `id` (uuid, primary key)
  - `sr_id` (text, references service_requests.id, NOT NULL) — which request the photo belongs to
  - `storage_path` (text, NOT NULL) — path in the `sr-photos` storage bucket
  - `name` (text) — original filename
  - `mime_type` (text) — image MIME type
  - `size` (bigint) — file size in bytes
  - `uploaded_at` (timestamptz, default now())
  - `uploaded_by` (text) — name of the user who uploaded

2. Storage
- Creates a public storage bucket `sr-photos` for service request photos.

3. Security
- RLS enabled on `service_request_photos`.
- All CRUD open to `anon, authenticated` (single-tenant CMMS, no auth gate on SR data).
*/

CREATE TABLE IF NOT EXISTS service_request_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sr_id text NOT NULL,
  storage_path text NOT NULL,
  name text,
  mime_type text,
  size bigint,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by text
);

ALTER TABLE service_request_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "srp_select" ON service_request_photos;
CREATE POLICY "srp_select" ON service_request_photos FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "srp_insert" ON service_request_photos;
CREATE POLICY "srp_insert" ON service_request_photos FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "srp_update" ON service_request_photos;
CREATE POLICY "srp_update" ON service_request_photos FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "srp_delete" ON service_request_photos;
CREATE POLICY "srp_delete" ON service_request_photos FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('sr-photos', 'sr-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sr_photos_upload" ON storage.objects;
CREATE POLICY "sr_photos_upload" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'sr-photos');

DROP POLICY IF EXISTS "sr_photos_read" ON storage.objects;
CREATE POLICY "sr_photos_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'sr-photos');

DROP POLICY IF EXISTS "sr_photos_delete" ON storage.objects;
CREATE POLICY "sr_photos_delete" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'sr-photos');
