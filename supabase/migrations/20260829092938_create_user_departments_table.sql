/*
# Create user_departments table and migrate existing dept data

1. New Tables
   - user_departments (user_id text FK users(id) ON DELETE CASCADE, dept text, PK(user_id, dept))
2. Data Migration
   - Insert one row per existing user.dept value that is non-null and non-empty.
3. Security
   - RLS enabled, anon+authenticated CRUD (matches existing CMMS pattern).
*/

CREATE TABLE IF NOT EXISTS user_departments (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dept text NOT NULL,
  PRIMARY KEY (user_id, dept)
);

ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_departments" ON user_departments;
CREATE POLICY "anon_select_user_departments" ON user_departments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_departments" ON user_departments;
CREATE POLICY "anon_insert_user_departments" ON user_departments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_departments" ON user_departments;
CREATE POLICY "anon_update_user_departments" ON user_departments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_departments" ON user_departments;
CREATE POLICY "anon_delete_user_departments" ON user_departments FOR DELETE
  TO anon, authenticated USING (true);

-- Migrate existing single-dept values into the new table
INSERT INTO user_departments (user_id, dept)
SELECT id, dept FROM users
WHERE dept IS NOT NULL AND trim(dept) <> ''
ON CONFLICT DO NOTHING;