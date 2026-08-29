/*
# Add SLA target configuration table

1. New Table
- `sla_config` — defines resolution-time targets per priority level (P1–P5).
  Columns:
  - `priority` text PRIMARY KEY (e.g. 'P1', 'P2', 'P3', 'P4')
  - `label` text (human-readable label, e.g. 'Emergency')
  - `target_hours` int (resolution window in hours from creation)
  - `warning_pct` int (percentage of window elapsed before "At risk" alert, default 75)
  - `color` text (display color for the priority pill)
2. Security
- RLS enabled with anon+authenticated full CRUD (same pattern as all other tables).
3. Important Notes
- Seeded with sensible defaults: P1=4h, P2=8h, P3=24h, P4=72h.
- The Configuration page lets the admin edit these targets.
- Work order SLA % and status are computed from these targets at display time.
*/

CREATE TABLE IF NOT EXISTS sla_config (
  priority text PRIMARY KEY,
  label text NOT NULL,
  target_hours int NOT NULL DEFAULT 24,
  warning_pct int NOT NULL DEFAULT 75,
  color text DEFAULT 'var(--primary)',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sla_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_sla_config" ON sla_config FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_sla_config" ON sla_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_sla_config" ON sla_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_sla_config" ON sla_config FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO sla_config (priority, label, target_hours, warning_pct, color) VALUES
  ('P1', 'Emergency', 4, 75, 'var(--crit)'),
  ('P2', 'Urgent', 8, 75, 'var(--warn)'),
  ('P3', 'Standard', 24, 75, 'var(--info)'),
  ('P4', 'Low Priority', 72, 75, 'var(--text-3)')
ON CONFLICT (priority) DO NOTHING;