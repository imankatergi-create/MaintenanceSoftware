/*
# Add PM History Table

1. New Tables
- `pm_history` — permanent audit log of every PM completion attempt (pass or fail).
  - `id` (uuid, primary key)
  - `pm_work_order_id` (text, references pm_work_orders.id) — which PM this attempt belongs to
  - `eq_id` (text, references equipment.id) — which equipment was measured
  - `result` (text) — 'pass' or 'fail'
  - `readings` (jsonb) — full checklist state snapshot at time of attempt
  - `fail_details` (text) — human-readable summary of which readings failed and why
  - `technician` (text) — who performed the PM
  - `comment` (text) — technician's explanation when the PM failed (empty for passes)
  - `attempt` (integer) — attempt number (1, 2, 3...) for this PM work order
  - `completed_at` (timestamptz) — when the attempt was recorded

2. Security
- Enable RLS on `pm_history`.
- Allow anon + authenticated full CRUD (single-tenant CMMS, no sign-in screen).
*/ 

CREATE TABLE IF NOT EXISTS pm_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_work_order_id text REFERENCES pm_work_orders(id) ON DELETE CASCADE,
  eq_id text REFERENCES equipment(id) ON DELETE CASCADE,
  result text NOT NULL DEFAULT 'pass',
  readings jsonb DEFAULT '{}',
  fail_details text DEFAULT '',
  technician text DEFAULT '',
  comment text DEFAULT '',
  attempt integer NOT NULL DEFAULT 1,
  completed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pm_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pm_history" ON pm_history;
CREATE POLICY "anon_select_pm_history" ON pm_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pm_history" ON pm_history;
CREATE POLICY "anon_insert_pm_history" ON pm_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pm_history" ON pm_history;
CREATE POLICY "anon_update_pm_history" ON pm_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_pm_history" ON pm_history;
CREATE POLICY "anon_delete_pm_history" ON pm_history FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_pm_history_pm_id ON pm_history(pm_work_order_id);
CREATE INDEX IF NOT EXISTS idx_pm_history_eq_id ON pm_history(eq_id);
