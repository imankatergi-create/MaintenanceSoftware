ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_technician boolean NOT NULL DEFAULT false;

-- Set flags based on existing role names
UPDATE roles SET is_superadmin = true WHERE name = 'Superadmin';
UPDATE roles SET is_technician = true WHERE name = 'Biomedical Technician' OR name = 'Facility Engineer / Technician';

-- Add a column to users to cache the role flags for quick access
-- (not strictly needed since we join roles, but useful for the app)
