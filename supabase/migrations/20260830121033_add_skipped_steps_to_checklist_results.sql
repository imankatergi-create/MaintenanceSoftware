/*
# Track skipped workflow steps

When a decision step routes the technician forward (e.g. answering "No" to
"Does this need a work order?" skips the "Convert to WO" step), those
intermediate steps should display as "Skipped" — not "Done" — in the stepper.

- Add `skipped_steps` (int[]) to `checklist_results`. Stores the step indices
  that were bypassed by a decision branch.
*/

ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS skipped_steps int[] DEFAULT '{}';
