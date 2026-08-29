/*
# Add configuration tables for Settings page

This migration creates the tables that back the unified Settings page,
matching the Excel setup workbook tabs:

1. New Tables
- `criticality_levels` — configurable criticality tiers (Life Support, High Risk, Medium, Low)
  with description, default priority, default PM frequency, and color.
  Used by the Equipment form's criticality dropdown and the dashboard donut chart.
- `priorities` — priority levels (P1–P5) with label, response target, resolution target,
  and which criticality they apply to. Extends sla_config with response targets and P5.
- `asset_categories` — equipment categories with subcategory, equipment group, default
  criticality, default PM strategy, and technical field set. Used by the Equipment form.
- `pm_frequencies` — PM frequency options (Quarterly, Semi-annual, Annual, etc.) used by
  PM plans and equipment.
- `system_settings` — key/value store for miscellaneous system-wide settings
  (e.g. organization name, default language, numbering prefixes).

2. Security
- RLS enabled on all new tables with anon+authenticated full CRUD (same as existing tables).

3. Important Notes
- Seeded with defaults from the Excel setup workbook.
- The Settings page lets the admin create/update/delete rows in these tables.
- Dashboard charts (criticality donut, PM compliance, etc.) read from these tables
  so they become dynamic based on the admin's configuration.
*/

-- ============ CRITICALITY LEVELS ============
CREATE TABLE IF NOT EXISTS criticality_levels (
  id text PRIMARY KEY,
  level text NOT NULL,
  description text DEFAULT '',
  default_priority text DEFAULT 'P3',
  default_pm_frequency text DEFAULT 'Annual',
  color text DEFAULT 'var(--text-3)',
  sort_order int NOT NULL DEFAULT 99,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE criticality_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_criticality_levels" ON criticality_levels;
CREATE POLICY "select_criticality_levels" ON criticality_levels FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_criticality_levels" ON criticality_levels;
CREATE POLICY "insert_criticality_levels" ON criticality_levels FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_criticality_levels" ON criticality_levels;
CREATE POLICY "update_criticality_levels" ON criticality_levels FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_criticality_levels" ON criticality_levels;
CREATE POLICY "delete_criticality_levels" ON criticality_levels FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO criticality_levels (id, level, description, default_priority, default_pm_frequency, color, sort_order) VALUES
  ('life', 'Life Support', 'Failure endangers life directly', 'P1', 'Quarterly + safety test', 'var(--crit)', 1),
  ('high', 'High Risk', 'Major clinical/operational impact', 'P2', 'Semi-annual', 'var(--warn)', 2),
  ('med', 'Medium', 'Important but has backup', 'P3', 'Semi-annual/Annual', 'var(--info)', 3),
  ('low', 'Low', 'Minimal patient impact', 'P4', 'Annual', 'var(--text-3)', 4)
ON CONFLICT (id) DO NOTHING;

-- ============ PRIORITIES (extends sla_config with response targets + P5) ============
CREATE TABLE IF NOT EXISTS priorities (
  priority text PRIMARY KEY,
  label text NOT NULL,
  example_trigger text DEFAULT '',
  response_target text DEFAULT '',
  resolution_target text DEFAULT '',
  resolution_hours int DEFAULT 24,
  warning_pct int DEFAULT 75,
  applies_to text DEFAULT '',
  color text DEFAULT 'var(--primary)',
  sort_order int NOT NULL DEFAULT 99,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE priorities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_priorities" ON priorities;
CREATE POLICY "select_priorities" ON priorities FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_priorities" ON priorities;
CREATE POLICY "insert_priorities" ON priorities FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_priorities" ON priorities;
CREATE POLICY "update_priorities" ON priorities FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_priorities" ON priorities;
CREATE POLICY "delete_priorities" ON priorities FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO priorities (priority, label, example_trigger, response_target, resolution_target, resolution_hours, warning_pct, applies_to, color, sort_order) VALUES
  ('P1', 'Emergency', 'Life-support equipment down', '15 minutes', '4 hours', 4, 75, 'Life-support assets', 'var(--crit)', 1),
  ('P2', 'Critical', 'Major clinical impact', '1 hour', '24 hours', 24, 75, 'High-risk assets', 'var(--warn)', 2),
  ('P3', 'High', 'Important service affected', '4 hours', '72 hours', 72, 75, 'Medium assets', 'var(--info)', 3),
  ('P4', 'Normal', 'Standard failure', '8 hours', '5 days', 120, 75, 'General', 'var(--text-3)', 4),
  ('P5', 'Low', 'Minor / cosmetic', '1 day', '10 days', 240, 75, 'Low-risk assets', 'var(--text-3)', 5)
ON CONFLICT (priority) DO NOTHING;

-- ============ ASSET CATEGORIES ============
CREATE TABLE IF NOT EXISTS asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  subcategory text DEFAULT '',
  equipment_group text DEFAULT '',
  default_criticality text DEFAULT 'med',
  default_pm_strategy text DEFAULT '',
  technical_fields text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_asset_categories" ON asset_categories;
CREATE POLICY "select_asset_categories" ON asset_categories FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_asset_categories" ON asset_categories;
CREATE POLICY "insert_asset_categories" ON asset_categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_asset_categories" ON asset_categories;
CREATE POLICY "update_asset_categories" ON asset_categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_asset_categories" ON asset_categories;
CREATE POLICY "delete_asset_categories" ON asset_categories FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO asset_categories (category, subcategory, equipment_group, default_criticality, default_pm_strategy, technical_fields) VALUES
  ('Ventilator', 'ICU Ventilator', 'Life-support', 'life', 'Quarterly PM + Safety', 'FiO2, Tidal volume, Pressure, Rate'),
  ('Imaging', 'MRI', 'High-voltage', 'high', 'Semi-annual + Vendor', 'Field strength, Gradient, Coils, Chiller'),
  ('Imaging', 'CT', 'High-voltage', 'high', 'Semi-annual', 'kVp, mAs, Tube, Detector'),
  ('Infusion', 'Volumetric Pump', '—', 'high', 'Semi-annual', 'Flow rate, Occlusion, Battery'),
  ('Defibrillator', 'Manual/AED', 'Life-support', 'life', 'Quarterly + Safety', 'Energy, Charge time, ECG, Pacing'),
  ('Facility', 'Generator', 'Power', 'med', 'Monthly load test', 'kVA, Fuel, Transfer time, Runtime hrs')
ON CONFLICT DO NOTHING;

-- ============ PM FREQUENCIES ============
CREATE TABLE IF NOT EXISTS pm_frequencies (
  id text PRIMARY KEY,
  label text NOT NULL,
  months_interval int NOT NULL DEFAULT 12,
  sort_order int NOT NULL DEFAULT 99,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pm_frequencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_pm_frequencies" ON pm_frequencies;
CREATE POLICY "select_pm_frequencies" ON pm_frequencies FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_pm_frequencies" ON pm_frequencies;
CREATE POLICY "insert_pm_frequencies" ON pm_frequencies FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_pm_frequencies" ON pm_frequencies;
CREATE POLICY "update_pm_frequencies" ON pm_frequencies FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_pm_frequencies" ON pm_frequencies;
CREATE POLICY "delete_pm_frequencies" ON pm_frequencies FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO pm_frequencies (id, label, months_interval, sort_order) VALUES
  ('monthly', 'Monthly', 1, 1),
  ('quarterly', 'Quarterly', 3, 2),
  ('semiannual', 'Semi-annual', 6, 3),
  ('annual', 'Annual', 12, 4),
  ('biennial', 'Biennial', 24, 5)
ON CONFLICT (id) DO NOTHING;

-- ============ SYSTEM SETTINGS ============
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_system_settings" ON system_settings;
CREATE POLICY "select_system_settings" ON system_settings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_system_settings" ON system_settings;
CREATE POLICY "insert_system_settings" ON system_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_system_settings" ON system_settings;
CREATE POLICY "update_system_settings" ON system_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_system_settings" ON system_settings;
CREATE POLICY "delete_system_settings" ON system_settings FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO system_settings (key, value, category) VALUES
  ('org_name', 'Cedar Ridge Medical Center', 'general'),
  ('wo_prefix', 'WO', 'numbering'),
  ('pm_prefix', 'PM', 'numbering'),
  ('sr_prefix', 'SR', 'numbering'),
  ('eq_prefix', 'EQ', 'numbering')
ON CONFLICT (key) DO NOTHING;