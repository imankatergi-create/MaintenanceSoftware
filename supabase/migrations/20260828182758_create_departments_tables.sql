-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create department_roles junction table
CREATE TABLE IF NOT EXISTS department_roles (
  department_id text NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (department_id, role_id)
);

-- Enable RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_roles ENABLE ROW LEVEL SECURITY;

-- Policies for departments (app handles scoping)
CREATE POLICY "select_departments" ON departments FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_departments" ON departments FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_departments" ON departments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_departments" ON departments FOR DELETE
  TO anon, authenticated USING (true);

-- Policies for department_roles
CREATE POLICY "select_dept_roles" ON department_roles FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_dept_roles" ON department_roles FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "delete_dept_roles" ON department_roles FOR DELETE
  TO anon, authenticated USING (true);

-- Seed initial departments
INSERT INTO departments (id, name, description) VALUES
  ('dept-icu', 'ICU', 'Intensive Care Unit'),
  ('dept-radiology', 'Radiology', 'Radiology and Imaging'),
  ('dept-or', 'Operating Room', 'Operating Theatre'),
  ('dept-emergency', 'Emergency', 'Emergency Department'),
  ('dept-nephrology', 'Nephrology', 'Nephrology / Dialysis'),
  ('dept-facilities', 'Facilities', 'Facilities Management'),
  ('dept-nicu', 'NICU', 'Neonatal Intensive Care Unit')
ON CONFLICT (id) DO NOTHING;