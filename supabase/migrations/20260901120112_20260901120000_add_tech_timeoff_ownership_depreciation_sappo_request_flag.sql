/*
# Technician Time-Off, Asset Ownership Types, Depreciation, SAP PO Number, Request Flag-for-Deletion

## Overview
This migration adds support for:
1. Technician time-off tracking (blocks work order assignment during off dates)
2. Dynamic asset ownership types (Owned, Leased, Outsourced, Rented, etc.)
3. Asset depreciation fields and calculation
4. SAP PO Number on spare parts
5. Service request flag-for-deletion workflow with permissions

## New Tables

### technician_timeoff
- `id` (text, PK) — unique identifier
- `tech_id` (text, not null) — FK to technicians.id
- `start_date` (date, not null) — first day off
- `end_date` (date, not null) — last day off (inclusive)
- `reason` (text) — optional reason (vacation, sick, training, etc.)
- `created_at` (timestamptz, default now())

### asset_ownership_types
- `id` (text, PK) — unique identifier
- `name` (text, not null, unique) — e.g. "Owned", "Leased", "Outsourced", "Rented"
- `sort_order` (int, default 0) — display ordering
- `created_at` (timestamptz, default now())

## Modified Tables

### equipment
- `ownership_type` (text, default 'Owned')
- `depreciation_years` (int, default 5) — useful life in years
- `depreciation_method` (text, default 'straight-line')
- `acquisition_date` (date) — date acquired
- `salvage_value` (numeric, default 0) — estimated residual value
- `flagged` (boolean, default false) — capital equipment flag

### parts
- `sap_po_number` (text) — SAP purchase order number

### service_requests
- `flagged_for_deletion` (boolean, default false)
- `flagged_by` (text) — who flagged
- `flagged_reason` (text) — why flagged
- `flagged_at` (timestamptz) — when flagged
- `deletion_reason` (text) — reason recorded on deletion

## Security
- RLS enabled on technician_timeoff and asset_ownership_types
- CRUD policies for anon + authenticated
*/

-- Technician time-off table
CREATE TABLE IF NOT EXISTS technician_timeoff (
  id text PRIMARY KEY,
  tech_id text NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE technician_timeoff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_timeoff" ON technician_timeoff;
CREATE POLICY "anon_select_timeoff" ON technician_timeoff FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_timeoff" ON technician_timeoff;
CREATE POLICY "anon_insert_timeoff" ON technician_timeoff FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_timeoff" ON technician_timeoff;
CREATE POLICY "anon_update_timeoff" ON technician_timeoff FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_timeoff" ON technician_timeoff;
CREATE POLICY "anon_delete_timeoff" ON technician_timeoff FOR DELETE
  TO anon, authenticated USING (true);

-- Asset ownership types table
CREATE TABLE IF NOT EXISTS asset_ownership_types (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE asset_ownership_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_own_types" ON asset_ownership_types;
CREATE POLICY "anon_select_own_types" ON asset_ownership_types FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_own_types" ON asset_ownership_types;
CREATE POLICY "anon_insert_own_types" ON asset_ownership_types FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_own_types" ON asset_ownership_types;
CREATE POLICY "anon_update_own_types" ON asset_ownership_types FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_own_types" ON asset_ownership_types;
CREATE POLICY "anon_delete_own_types" ON asset_ownership_types FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default ownership types
INSERT INTO asset_ownership_types (id, name, sort_order) VALUES
  ('own-1', 'Owned', 1),
  ('own-2', 'Leased', 2),
  ('own-3', 'Outsourced', 3),
  ('own-4', 'Rented', 4)
ON CONFLICT (name) DO NOTHING;

-- Add columns to equipment
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'ownership_type') THEN
    ALTER TABLE equipment ADD COLUMN ownership_type text DEFAULT 'Owned';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'depreciation_years') THEN
    ALTER TABLE equipment ADD COLUMN depreciation_years int DEFAULT 5;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'depreciation_method') THEN
    ALTER TABLE equipment ADD COLUMN depreciation_method text DEFAULT 'straight-line';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'acquisition_date') THEN
    ALTER TABLE equipment ADD COLUMN acquisition_date date;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'salvage_value') THEN
    ALTER TABLE equipment ADD COLUMN salvage_value numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'flagged') THEN
    ALTER TABLE equipment ADD COLUMN flagged boolean DEFAULT false;
  END IF;
END $$;

-- Add SAP PO number to parts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parts' AND column_name = 'sap_po_number') THEN
    ALTER TABLE parts ADD COLUMN sap_po_number text;
  END IF;
END $$;

-- Add flag-for-deletion columns to service_requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_requests' AND column_name = 'flagged_for_deletion') THEN
    ALTER TABLE service_requests ADD COLUMN flagged_for_deletion boolean DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_requests' AND column_name = 'flagged_by') THEN
    ALTER TABLE service_requests ADD COLUMN flagged_by text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_requests' AND column_name = 'flagged_reason') THEN
    ALTER TABLE service_requests ADD COLUMN flagged_reason text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_requests' AND column_name = 'flagged_at') THEN
    ALTER TABLE service_requests ADD COLUMN flagged_at timestamptz;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_requests' AND column_name = 'deletion_reason') THEN
    ALTER TABLE service_requests ADD COLUMN deletion_reason text;
  END IF;
END $$;

-- Add "Flag for Deletion" permission for Service Requests module
INSERT INTO permissions (id, role_id, module, action, allowed)
SELECT gen_random_uuid(), r.id, 'Service Requests', 'Flag for Deletion', false
FROM roles r
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p
  WHERE p.role_id = r.id AND p.module = 'Service Requests' AND p.action = 'Flag for Deletion'
);

-- Add PM reminder days config to settings_config if the table exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings_config') THEN
    INSERT INTO settings_config (key, value, category, label, description)
    VALUES ('pm_reminder_days', '1', 'Preventive Maintenance', 'PM Reminder Days Before Due', 'Number of days before PM due date to send reminder notification')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;