/*
# Add conditional branching support to workflows

1. Changes
- Add `step_config` (jsonb, default '{}') to `workflows` table.
  This stores per-step configuration including whether a step is a "decision" step
  and the branching targets (yes_next, no_next) for decision steps.
  Example: {"2": {"type": "decision", "question": "Does this need a work order?", "yes_next": 3, "no_next": 5}}
- Add `submitted_step` (int) to `checklist_results` table.
  This records the workflow step the technician was on when they submitted for close-out,
  so that if the requestor/creator rejects the close-out, the work order can return to
  that exact step instead of resetting to the beginning.

2. Security
- No new tables. Existing RLS policies on workflows and checklist_results remain unchanged.
- No changes to access control.

3. Important Notes
- step_config is a jsonb column keyed by step index (as string), with optional fields:
  - "type": "decision" marks a step as a branching decision point
  - "question": the prompt text shown to the technician (e.g. "Does this need a work order?")
  - "yes_next": step index to jump to if the technician answers Yes
  - "no_next": step index to jump to if the technician answers No
  If a step has no entry in step_config, it behaves as a normal linear step (advance to step + 1).
- submitted_step is nullable. It is set when a work order is submitted for close-out and
  cleared/reset when the work order is rejected and reopened.
*/

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS step_config jsonb DEFAULT '{}';
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS submitted_step int;
