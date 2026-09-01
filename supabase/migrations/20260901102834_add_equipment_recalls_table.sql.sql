/*
# Equipment recalls table

1. New Tables
- `equipment_recalls` — tracks manufacturer safety recalls against specific equipment assets.
  - `id` (uuid, primary key)
  - `eq_id` (text, references equipment(id) ON DELETE CASCADE)
  - `recall_number` (text, manufacturer or regulatory recall identifier)
  - `title` (text, short description of the recall)
  - `description` (text, detailed description of the issue)
  - `severity` (text, 'safety' | 'correction' | 'advisory' — defaults to 'correction')
  - `status` (text, 'open' | 'in_progress' | 'resolved' — defaults to 'open')
  - `issued_date` (date, when the manufacturer issued the recall)
  - `resolved_date` (date, when the recall was resolved, nullable)
  - `resolution_notes` (text, notes on how the recall was addressed, nullable)
  - `created_at` (timestamptz, default now())
  - `created_by` (text, free-text label of who logged the recall)

2. Security
- RLS enabled on `equipment_recalls`.
- CRUD policies scoped to `anon, authenticated` (no-auth app — data is shared).
*/

CREATE TABLE IF NOT EXISTS equipment_recalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eq_id text REFERENCES equipment(id) ON DELETE CASCADE,
  recall_number text,
  title text NOT NULL,
  description text,
  severity text DEFAULT 'correction',
  status text DEFAULT 'open',
  issued_date date,
  resolved_date date,
  resolution_notes text,
  created_at timestamptz DEFAULT now(),
  created_by text DEFAULT 'Admin'
);

ALTER TABLE equipment_recalls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eq_recall_select" ON equipment_recalls;
CREATE POLICY "eq_recall_select" ON equipment_recalls FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eq_recall_insert" ON equipment_recalls;
CREATE POLICY "eq_recall_insert" ON equipment_recalls FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eq_recall_update" ON equipment_recalls;
CREATE POLICY "eq_recall_update" ON equipment_recalls FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eq_recall_delete" ON equipment_recalls;
CREATE POLICY "eq_recall_delete" ON equipment_recalls FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_equipment_recalls_eq_id ON equipment_recalls(eq_id);
CREATE INDEX IF NOT EXISTS idx_equipment_recalls_status ON equipment_recalls(status);
