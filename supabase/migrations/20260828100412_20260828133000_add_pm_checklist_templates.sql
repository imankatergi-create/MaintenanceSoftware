/*
# Add reusable preventive-maintenance checklist templates

1. New Tables
- `pm_checklist_templates` stores reusable checklist definitions for preventive maintenance.
- `id` is a stable text key used by PM work orders.
- `name` is the checklist name shown to staff.
- `description` explains when the checklist should be used.
- `sections` stores checklist sections and items as JSON.
- `created_at` records when the template was created.

2. Security
- Row-level security is enabled.
- This app has no sign-in screen, so the shared single-tenant app allows anon and authenticated users to read, create, update, and delete templates.

3. Important Notes
- Existing built-in checklists remain available in the app.
- Custom templates are additive and do not remove or alter existing PM records.
*/

CREATE TABLE IF NOT EXISTS pm_checklist_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pm_checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_templates_select" ON pm_checklist_templates;
CREATE POLICY "pm_templates_select" ON pm_checklist_templates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pm_templates_insert" ON pm_checklist_templates;
CREATE POLICY "pm_templates_insert" ON pm_checklist_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pm_templates_update" ON pm_checklist_templates;
CREATE POLICY "pm_templates_update" ON pm_checklist_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pm_templates_delete" ON pm_checklist_templates;
CREATE POLICY "pm_templates_delete" ON pm_checklist_templates FOR DELETE TO anon, authenticated USING (true);
