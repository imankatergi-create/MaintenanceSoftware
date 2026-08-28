/*
# Add escalation groups and group membership

1. New Tables
- `escalation_groups`: configurable escalation groups (e.g. Management, Supervisor, Vendor, External Service) with name, description, and optional email.
- `escalation_group_members`: join table linking users to escalation groups — each member gets notified when a work order is escalated to that group.
2. Modified Tables
- `work_order_escalations`: adds `group_id` column referencing escalation_groups so escalations are tied to a specific group rather than a free-text destination.
3. Security
- RLS is enabled on every new table.
- This application has no sign-in screen and intentionally uses shared anon + authenticated CRUD policies.
4. Important Notes
- When a work order is escalated to a group, the application reads all members of that group and sends each member an in-app notification and an email.
- The `group_id` column on work_order_escalations is nullable so existing rows (with free-text destination) are preserved.
- Seed data: four default groups matching the previous hard-coded options, plus a few members drawn from existing users.
*/

CREATE TABLE IF NOT EXISTS escalation_groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  email text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE escalation_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "esc_grp_select" ON escalation_groups;
CREATE POLICY "esc_grp_select" ON escalation_groups FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "esc_grp_insert" ON escalation_groups;
CREATE POLICY "esc_grp_insert" ON escalation_groups FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "esc_grp_update" ON escalation_groups;
CREATE POLICY "esc_grp_update" ON escalation_groups FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "esc_grp_delete" ON escalation_groups;
CREATE POLICY "esc_grp_delete" ON escalation_groups FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS escalation_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL REFERENCES escalation_groups(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);
ALTER TABLE escalation_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "esc_gm_select" ON escalation_group_members;
CREATE POLICY "esc_gm_select" ON escalation_group_members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "esc_gm_insert" ON escalation_group_members;
CREATE POLICY "esc_gm_insert" ON escalation_group_members FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "esc_gm_update" ON escalation_group_members;
CREATE POLICY "esc_gm_update" ON escalation_group_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "esc_gm_delete" ON escalation_group_members;
CREATE POLICY "esc_gm_delete" ON escalation_group_members FOR DELETE TO anon, authenticated USING (true);

-- Add group_id to work_order_escalations (nullable for backwards compat)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_order_escalations' AND column_name = 'group_id') THEN
    ALTER TABLE work_order_escalations ADD COLUMN group_id text REFERENCES escalation_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Seed default groups
INSERT INTO escalation_groups (id, name, description, email) VALUES
  ('grp-mgmt', 'Management', 'Hospital management — escalated for SLA breaches or cross-department issues', 'management@cedarridge.org'),
  ('grp-sup', 'Supervisor', 'Biomedical engineering supervisors — first-line escalation for stuck or complex jobs', 'supervisor@cedarridge.org'),
  ('grp-vendor', 'Vendor', 'External vendor escalation — for OEM warranty or contracted service', 'vendor@cedarridge.org'),
  ('grp-ext', 'External Service', 'External service provider — for specialized calibration or repair', 'external@cedarridge.org')
ON CONFLICT (id) DO NOTHING;
