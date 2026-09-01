/*
# Recall documents table and storage bucket

1. New Tables
- `recall_documents` — stores metadata for files uploaded against a specific equipment recall.
  - `id` (uuid, primary key)
  - `recall_id` (uuid, references equipment_recalls(id) ON DELETE CASCADE)
  - `file_name` (text, the original filename the user chose)
  - `storage_path` (text, the path inside the `recall-docs` storage bucket)
  - `file_type` (text, MIME type)
  - `file_size` (bigint, bytes)
  - `uploaded_at` (timestamptz, default now())
  - `uploaded_by` (text, who uploaded it — free text label for this no-auth app)

2. Storage
- Creates a public storage bucket `recall-docs` so uploaded recall notices,
  manufacturer letters, and correction documents can be downloaded by anyone with the link.
- Storage policies allow anon + authenticated to upload, read, and delete
  objects in the `recall-docs` bucket (single-tenant, no-auth app).

3. Security
- RLS enabled on `recall_documents`.
- CRUD policies scoped to `anon, authenticated` (no-auth app — data is shared).
*/

CREATE TABLE IF NOT EXISTS recall_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_id uuid REFERENCES equipment_recalls(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_type text,
  file_size bigint DEFAULT 0,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by text DEFAULT 'Admin'
);

ALTER TABLE recall_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recall_doc_select" ON recall_documents;
CREATE POLICY "recall_doc_select" ON recall_documents FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "recall_doc_insert" ON recall_documents;
CREATE POLICY "recall_doc_insert" ON recall_documents FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recall_doc_delete" ON recall_documents;
CREATE POLICY "recall_doc_delete" ON recall_documents FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_recall_documents_recall_id ON recall_documents(recall_id);

-- Create the storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('recall-docs', 'recall-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow anon + authenticated to manage objects in recall-docs
DROP POLICY IF EXISTS "recall_doc_bucket_upload" ON storage.objects;
CREATE POLICY "recall_doc_bucket_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'recall-docs');

DROP POLICY IF EXISTS "recall_doc_bucket_read" ON storage.objects;
CREATE POLICY "recall_doc_bucket_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'recall-docs');

DROP POLICY IF EXISTS "recall_doc_bucket_delete" ON storage.objects;
CREATE POLICY "recall_doc_bucket_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'recall-docs');
