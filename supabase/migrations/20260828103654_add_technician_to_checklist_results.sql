/*
# Add technician column to checklist_results

1. Changes
- Add `technician` text column to `checklist_results` (nullable, defaults to empty string).
  Stores the name of the technician who performed / was assigned to the checklist verification.
2. Security
- No RLS policy changes needed — the table already has full CRUD policies for anon, authenticated.
3. Notes
- Non-destructive: uses DO $$ ... IF NOT EXISTS ... END $$ to avoid errors on re-run.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_results' AND column_name = 'technician'
  ) THEN
    ALTER TABLE checklist_results ADD COLUMN technician text DEFAULT '';
  END IF;
END $$;
