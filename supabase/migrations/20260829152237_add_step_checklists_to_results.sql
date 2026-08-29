ALTER TABLE checklist_results
  ADD COLUMN IF NOT EXISTS step_checklists jsonb DEFAULT '{}'::jsonb;
