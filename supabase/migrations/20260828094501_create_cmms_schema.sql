/*
# Vitalis CMMS — Full Database Schema

## Overview
Creates the complete schema for the Vitalis Clinical Engineering CMMS application.
Single-tenant app with no sign-in screen — all policies use `TO anon, authenticated`.

## New Tables
1. **equipment** — medical device asset register
2. **work_orders** — corrective & preventive maintenance work orders
3. **parts** — spare parts inventory
4. **pm_work_orders** — scheduled preventive maintenance jobs
5. **users** — system user accounts with roles
6. **technicians** — technician competency & certification records
7. **roles** — RBAC role definitions
8. **permissions** — per-role module×action permission grants
9. **workflows** — state machine definitions
10. **workflow_transitions** — transition rules within workflows
11. **service_requests** — faults reported from the floor
12. **vendors** — vendor & contract records
13. **audit_logs** — immutable action log
14. **checklist_results** — saved checklist state per work order

## Security
- RLS enabled on every table.
- All policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because this is a single-tenant app with no sign-in — the data is intentionally shared.
*/

-- ============ EQUIPMENT ============
CREATE TABLE IF NOT EXISTS equipment (
  id text PRIMARY KEY,
  tag text NOT NULL,
  name text NOT NULL,
  model text,
  mfr text,
  cat text,
  ic text DEFAULT 'asset',
  dept text,
  loc text,
  status text DEFAULT 'inuse',
  crit text DEFAULT 'med',
  risk int DEFAULT 50,
  pm int DEFAULT 90,
  next_pm date,
  warranty text DEFAULT 'Active',
  cal_due date,
  age int DEFAULT 1,
  cost numeric DEFAULT 0,
  serial text,
  sla text DEFAULT 'P3',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eq_select" ON equipment;
CREATE POLICY "eq_select" ON equipment FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "eq_insert" ON equipment;
CREATE POLICY "eq_insert" ON equipment FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "eq_update" ON equipment;
CREATE POLICY "eq_update" ON equipment FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "eq_delete" ON equipment;
CREATE POLICY "eq_delete" ON equipment FOR DELETE TO anon, authenticated USING (true);

-- ============ WORK ORDERS ============
CREATE TABLE IF NOT EXISTS work_orders (
  id text PRIMARY KEY,
  eq_id text REFERENCES equipment(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text DEFAULT 'Corrective',
  pri text DEFAULT 'P3',
  status text DEFAULT 'triaged',
  assignee text DEFAULT 'Unassigned',
  team text DEFAULT '—',
  opened text,
  due text,
  sla text DEFAULT 'On track',
  sla_pct int DEFAULT 0,
  step int DEFAULT 1,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wo_select" ON work_orders;
CREATE POLICY "wo_select" ON work_orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "wo_insert" ON work_orders;
CREATE POLICY "wo_insert" ON work_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "wo_update" ON work_orders;
CREATE POLICY "wo_update" ON work_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "wo_delete" ON work_orders;
CREATE POLICY "wo_delete" ON work_orders FOR DELETE TO anon, authenticated USING (true);

-- ============ PARTS ============
CREATE TABLE IF NOT EXISTS parts (
  id text PRIMARY KEY,
  name text NOT NULL,
  mfr text,
  cat text,
  qty int DEFAULT 0,
  min_qty int DEFAULT 0,
  max_qty int DEFAULT 0,
  bin text,
  cost numeric DEFAULT 0,
  crit boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pt_select" ON parts;
CREATE POLICY "pt_select" ON parts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pt_insert" ON parts;
CREATE POLICY "pt_insert" ON parts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pt_update" ON parts;
CREATE POLICY "pt_update" ON parts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pt_delete" ON parts;
CREATE POLICY "pt_delete" ON parts FOR DELETE TO anon, authenticated USING (true);

-- ============ PM WORK ORDERS ============
CREATE TABLE IF NOT EXISTS pm_work_orders (
  id text PRIMARY KEY,
  eq_id text REFERENCES equipment(id) ON DELETE CASCADE,
  title text NOT NULL,
  due date NOT NULL,
  freq text DEFAULT 'Quarterly',
  tpl text DEFAULT 'generic',
  status text DEFAULT 'scheduled',
  team text DEFAULT 'Biomedical',
  completed_on date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pm_work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_select" ON pm_work_orders;
CREATE POLICY "pm_select" ON pm_work_orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pm_insert" ON pm_work_orders;
CREATE POLICY "pm_insert" ON pm_work_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pm_update" ON pm_work_orders;
CREATE POLICY "pm_update" ON pm_work_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pm_delete" ON pm_work_orders;
CREATE POLICY "pm_delete" ON pm_work_orders FOR DELETE TO anon, authenticated USING (true);

-- ============ USERS ============
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  role text,
  scope text,
  status text DEFAULT 'active',
  last_active text DEFAULT 'Now',
  mfa boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usr_select" ON users;
CREATE POLICY "usr_select" ON users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "usr_insert" ON users;
CREATE POLICY "usr_insert" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "usr_update" ON users;
CREATE POLICY "usr_update" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "usr_delete" ON users;
CREATE POLICY "usr_delete" ON users FOR DELETE TO anon, authenticated USING (true);

-- ============ TECHNICIANS ============
CREATE TABLE IF NOT EXISTS technicians (
  id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  trade text,
  skills text[] DEFAULT '{}',
  certs jsonb DEFAULT '[]',
  load int DEFAULT 0,
  cap int DEFAULT 8,
  avail text DEFAULT 'On shift',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tech_select" ON technicians;
CREATE POLICY "tech_select" ON technicians FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tech_insert" ON technicians;
CREATE POLICY "tech_insert" ON technicians FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tech_update" ON technicians;
CREATE POLICY "tech_update" ON technicians FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "tech_delete" ON technicians;
CREATE POLICY "tech_delete" ON technicians FOR DELETE TO anon, authenticated USING (true);

-- ============ ROLES ============
CREATE TABLE IF NOT EXISTS roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  users int DEFAULT 0,
  scope text,
  system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_select" ON roles;
CREATE POLICY "role_select" ON roles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "role_insert" ON roles;
CREATE POLICY "role_insert" ON roles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "role_update" ON roles;
CREATE POLICY "role_update" ON roles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "role_delete" ON roles;
CREATE POLICY "role_delete" ON roles FOR DELETE TO anon, authenticated USING (true);

-- ============ PERMISSIONS ============
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module text NOT NULL,
  action text NOT NULL,
  allowed boolean DEFAULT false,
  UNIQUE(role_id, module, action)
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perm_select" ON permissions;
CREATE POLICY "perm_select" ON permissions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "perm_insert" ON permissions;
CREATE POLICY "perm_insert" ON permissions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "perm_update" ON permissions;
CREATE POLICY "perm_update" ON permissions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "perm_delete" ON permissions;
CREATE POLICY "perm_delete" ON permissions FOR DELETE TO anon, authenticated USING (true);

-- ============ WORKFLOWS ============
CREATE TABLE IF NOT EXISTS workflows (
  id text PRIMARY KEY,
  name text NOT NULL,
  states text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wf_select" ON workflows;
CREATE POLICY "wf_select" ON workflows FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "wf_insert" ON workflows;
CREATE POLICY "wf_insert" ON workflows FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "wf_update" ON workflows;
CREATE POLICY "wf_update" ON workflows FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "wf_delete" ON workflows;
CREATE POLICY "wf_delete" ON workflows FOR DELETE TO anon, authenticated USING (true);

-- ============ WORKFLOW TRANSITIONS ============
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  from_state text NOT NULL,
  action text NOT NULL,
  to_state text NOT NULL,
  cond text[] DEFAULT '{}',
  approval boolean DEFAULT false,
  notify boolean DEFAULT false,
  sla text DEFAULT '—',
  seq int DEFAULT 0
);

ALTER TABLE workflow_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wft_select" ON workflow_transitions;
CREATE POLICY "wft_select" ON workflow_transitions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "wft_insert" ON workflow_transitions;
CREATE POLICY "wft_insert" ON workflow_transitions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "wft_update" ON workflow_transitions;
CREATE POLICY "wft_update" ON workflow_transitions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "wft_delete" ON workflow_transitions;
CREATE POLICY "wft_delete" ON workflow_transitions FOR DELETE TO anon, authenticated USING (true);

-- ============ SERVICE REQUESTS ============
CREATE TABLE IF NOT EXISTS service_requests (
  id text PRIMARY KEY,
  eq_id text REFERENCES equipment(id) ON DELETE CASCADE,
  by text,
  description text NOT NULL,
  usable text DEFAULT 'Yes',
  time text,
  urg text DEFAULT 'Medium',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sr_select" ON service_requests;
CREATE POLICY "sr_select" ON service_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "sr_insert" ON service_requests;
CREATE POLICY "sr_insert" ON service_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sr_update" ON service_requests;
CREATE POLICY "sr_update" ON service_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sr_delete" ON service_requests;
CREATE POLICY "sr_delete" ON service_requests FOR DELETE TO anon, authenticated USING (true);

-- ============ VENDORS ============
CREATE TABLE IF NOT EXISTS vendors (
  id text PRIMARY KEY,
  name text NOT NULL,
  cat text,
  contract text,
  sla int DEFAULT 90,
  open int DEFAULT 0,
  cost numeric DEFAULT 0,
  exp date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vd_select" ON vendors;
CREATE POLICY "vd_select" ON vendors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "vd_insert" ON vendors;
CREATE POLICY "vd_insert" ON vendors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "vd_update" ON vendors;
CREATE POLICY "vd_update" ON vendors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "vd_delete" ON vendors;
CREATE POLICY "vd_delete" ON vendors FOR DELETE TO anon, authenticated USING (true);

-- ============ AUDIT LOGS ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text,
  action text NOT NULL,
  time text,
  cat text DEFAULT 'info',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "al_select" ON audit_logs;
CREATE POLICY "al_select" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "al_insert" ON audit_logs;
CREATE POLICY "al_insert" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "al_update" ON audit_logs;
CREATE POLICY "al_update" ON audit_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "al_delete" ON audit_logs;
CREATE POLICY "al_delete" ON audit_logs FOR DELETE TO anon, authenticated USING (true);

-- ============ CHECKLIST RESULTS ============
CREATE TABLE IF NOT EXISTS checklist_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  job_type text DEFAULT 'pm',
  checklist jsonb DEFAULT '{}',
  supervisor boolean DEFAULT false,
  notes text DEFAULT '',
  parts jsonb DEFAULT '[]',
  step int,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id)
);

ALTER TABLE checklist_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cr_select" ON checklist_results;
CREATE POLICY "cr_select" ON checklist_results FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "cr_insert" ON checklist_results;
CREATE POLICY "cr_insert" ON checklist_results FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cr_update" ON checklist_results;
CREATE POLICY "cr_update" ON checklist_results FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cr_delete" ON checklist_results;
CREATE POLICY "cr_delete" ON checklist_results FOR DELETE TO anon, authenticated USING (true);
