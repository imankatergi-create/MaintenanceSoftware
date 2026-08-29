/*
# Add email notification preferences to roles

1. Modified Tables
- `roles` — adds 9 boolean columns to control which email notifications a role receives:
  - `email_sr_create` — email on new service request creation
  - `email_sr_update` — email on service request update (status change, assignment)
  - `email_sr_close` — email on service request closure
  - `email_wo_create` — email on new work order creation
  - `email_wo_update` — email on work order update (status change, advancement)
  - `email_wo_close` — email on work order closure
  - `email_pm_create` — email on new PM work order creation/generation
  - `email_pm_update` — email on PM work order update
  - `email_pm_close` — email on PM work order closure
2. Security
- No RLS changes needed; existing policies on `roles` already allow anon + authenticated CRUD.
3. Important Notes
- All columns default to `false` so existing roles start with no email notifications.
- The admin can toggle these per-role from the Roles & Permissions page.
- When a notification is fired, the system checks the recipient's role preferences before sending the email.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_sr_create') THEN
    ALTER TABLE roles ADD COLUMN email_sr_create boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_sr_update') THEN
    ALTER TABLE roles ADD COLUMN email_sr_update boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_sr_close') THEN
    ALTER TABLE roles ADD COLUMN email_sr_close boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_wo_create') THEN
    ALTER TABLE roles ADD COLUMN email_wo_create boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_wo_update') THEN
    ALTER TABLE roles ADD COLUMN email_wo_update boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_wo_close') THEN
    ALTER TABLE roles ADD COLUMN email_wo_close boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_pm_create') THEN
    ALTER TABLE roles ADD COLUMN email_pm_create boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_pm_update') THEN
    ALTER TABLE roles ADD COLUMN email_pm_update boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'email_pm_close') THEN
    ALTER TABLE roles ADD COLUMN email_pm_close boolean DEFAULT false;
  END IF;
END $$;