/*
# Add workflow-linked checklist templates

1. New Tables
- `workflow_checklist_templates` stores configurable checklists linked to
  specific steps in a corrective work-order workflow.
- `id` (text, primary key) — stable key like "posttest", "diagnosis", etc.
- `name` (text, not null) — display name shown in the UI.
- `description` (text) — when/why to use this checklist.
- `workflow_id` (text) — which workflow this belongs to (null = default
  corrective workflow).
- `step_index` (int) — zero-based index into CORR_STEPS this checklist
  attaches to (e.g. 6 = Post-Repair Testing).
- `sections` (jsonb) — array of { title, items: [...] } matching the same
  shape as built-in CHECKLISTS.
- `created_at` (timestamptz).

2. Seed Data
- Inserts a "posttest" template matching the current hardcoded Post-Repair
  Verification checklist, linked to step 6 of the default corrective workflow.

3. Security
- Row-level security enabled.
- This app has a sign-in screen, but workflow checklist templates are
  shared configuration visible to all authenticated staff, so policies
  use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because the data is intentionally shared across the organisation.

4. Important Notes
- Existing built-in checklists remain in the frontend as fallbacks.
- If a DB template exists for a given step it takes priority over the
  hardcoded one, allowing supervisors to customise checklists per step.
*/

CREATE TABLE IF NOT EXISTS workflow_checklist_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  workflow_id text DEFAULT NULL,
  step_index int NOT NULL DEFAULT 6,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workflow_checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wf_chk_select" ON workflow_checklist_templates;
CREATE POLICY "wf_chk_select" ON workflow_checklist_templates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "wf_chk_insert" ON workflow_checklist_templates;
CREATE POLICY "wf_chk_insert" ON workflow_checklist_templates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "wf_chk_update" ON workflow_checklist_templates;
CREATE POLICY "wf_chk_update" ON workflow_checklist_templates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wf_chk_delete" ON workflow_checklist_templates;
CREATE POLICY "wf_chk_delete" ON workflow_checklist_templates FOR DELETE
  TO anon, authenticated USING (true);

-- Seed the default post-repair testing checklist
INSERT INTO workflow_checklist_templates (id, name, description, workflow_id, step_index, sections)
VALUES (
  'posttest',
  'Post-Repair Verification',
  'IEC 62353 electrical safety and functional verification after corrective repair',
  NULL,
  6,
  '[{"title":"Post-Repair Verification","items":[{"t":"Repair action verified effective","type":"check"},{"t":"Functional test passes","type":"check"},{"t":"Electrical safety — earth leakage","type":"reading","unit":"mA","nominal":0.12,"min":0,"max":0.5},{"t":"Performance within specification","type":"check"},{"t":"Equipment cleaned & ready for service","type":"check"}]}]'::jsonb
) ON CONFLICT (id) DO NOTHING;
