-- ============ PM PLANS ============
-- Stores recurring preventive maintenance plan definitions.
-- Each plan defines: which equipment, which checklist template, frequency,
-- assigned technician, start date, and whether it's active.

CREATE TABLE IF NOT EXISTS pm_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  eq_id text REFERENCES equipment(id) ON DELETE CASCADE,
  tpl text DEFAULT 'generic',
  freq text DEFAULT 'Quarterly',
  technician text DEFAULT 'Unassigned',
  team text DEFAULT 'Biomedical',
  start_date date NOT NULL,
  active boolean DEFAULT true,
  last_generated date,
  next_due date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pm_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pmplan_select" ON pm_plans;
CREATE POLICY "pmplan_select" ON pm_plans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pmplan_insert" ON pm_plans;
CREATE POLICY "pmplan_insert" ON pm_plans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pmplan_update" ON pm_plans;
CREATE POLICY "pmplan_update" ON pm_plans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pmplan_delete" ON pm_plans;
CREATE POLICY "pmplan_delete" ON pm_plans FOR DELETE TO anon, authenticated USING (true);
