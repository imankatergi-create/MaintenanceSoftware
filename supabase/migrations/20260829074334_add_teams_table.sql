CREATE TABLE IF NOT EXISTS teams (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  color text DEFAULT 'var(--primary)',
  sort_order integer DEFAULT 99,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_teams" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_teams" ON teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_teams" ON teams FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_teams" ON teams FOR DELETE TO authenticated USING (true);

INSERT INTO teams (id, name, description, color, sort_order) VALUES
  ('biomedical', 'Biomedical', 'Biomedical engineering team', 'var(--primary)', 1),
  ('imaging', 'Imaging', 'Imaging systems team', 'var(--info)', 2),
  ('facilities', 'Facilities', 'Facilities maintenance team', 'var(--ok)', 3),
  ('vendor', 'Vendor', 'External vendor / contractor', 'var(--warn)', 4)
ON CONFLICT (id) DO NOTHING;
