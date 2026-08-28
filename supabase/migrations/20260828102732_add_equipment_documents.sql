/*
# Equipment documents table and storage bucket

1. New Tables
- `equipment_documents` — stores metadata for files uploaded against an equipment asset.
  - `id` (uuid, primary key)
  - `eq_id` (text, references equipment(id) ON DELETE CASCADE)
  - `file_name` (text, the original filename the user chose)
  - `storage_path` (text, the path inside the `equipment-docs` storage bucket)
  - `file_type` (text, MIME type)
  - `file_size` (bigint, bytes)
  - `uploaded_at` (timestamptz, default now())
  - `uploaded_by` (text, who uploaded it — free text label for this no-auth app)

2. Storage
- Creates a public storage bucket `equipment-docs` so uploaded PDFs, images,
  and warranty documents can be downloaded by anyone with the link.
- Storage policies allow anon + authenticated to upload, read, and delete
  objects in the `equipment-docs` bucket (single-tenant, no-auth app).

3. Security
- RLS enabled on `equipment_documents`.
- CRUD policies scoped to `anon, authenticated` (no-auth app — data is shared).
*/

CREATE TABLE IF NOT EXISTS equipment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eq_id text REFERENCES equipment(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_type text,
  file_size bigint DEFAULT 0,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by text DEFAULT 'Admin'
);

ALTER TABLE equipment_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eq_doc_select" ON equipment_documents;
CREATE POLICY "eq_doc_select" ON equipment_documents FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eq_doc_insert" ON equipment_documents;
CREATE POLICY "eq_doc_insert" ON equipment_documents FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eq_doc_delete" ON equipment_documents;
CREATE POLICY "eq_doc_delete" ON equipment_documents FOR DELETE
  TO anon, authenticated USING (true);

-- Create the storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment-docs', 'equipment-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow anon + authenticated to manage objects
DROP POLICY IF EXISTS "allow_public_upload" ON storage.objects;
CREATE POLICY "allow_public_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'equipment-docs');

DROP POLICY IF EXISTS "allow_public_read" ON storage.objects;
CREATE POLICY "allow_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'equipment-docs');

DROP POLICY IF EXISTS "allow_public_delete" ON storage.objects;
CREATE POLICY "allow_public_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'equipment-docs');
