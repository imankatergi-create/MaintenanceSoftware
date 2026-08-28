/*
# Add auth support columns to users table

1. Modified Tables
- `users`: adds `auth_id` (uuid, references auth.users) to link CMMS user records to Supabase Auth accounts.
- `users`: adds `must_change_password` (boolean, default false) — set to true when a user is created with a temp password so they are forced to change it on first login.
- `users`: adds `temp_password` (text, nullable) — stores the temporary password set by the admin so the user can be told what it is. Cleared after first login.
2. Security
- No RLS changes needed; existing policies on `users` already allow anon + authenticated CRUD.
3. Important Notes
- The `auth_id` column is nullable so existing user records (created before auth) are preserved.
- The `must_change_password` flag is checked by the frontend after login to decide whether to show the change-password screen.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'auth_id') THEN
    ALTER TABLE users ADD COLUMN auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'must_change_password') THEN
    ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'temp_password') THEN
    ALTER TABLE users ADD COLUMN temp_password text;
  END IF;
END $$;
