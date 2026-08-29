/*
# Add close-out confirmation columns to work_orders

1. Modified Tables
- `work_orders`
  - `closeout_status` (text) — tracks the close-out confirmation state:
    - NULL / 'pending_closeout' — technician finished, awaiting requestor review
    - 'confirmed' — requestor confirmed the work is complete
    - 'rejected' — requestor rejected the close-out (work order reopens)
  - `closeout_reason` (text) — when the requestor rejects, stores their explanation of why the work was not complete
  - `closeout_history` (jsonb) — array of { action, by, reason, timestamp } entries preserving the full history of close-out attempts (technician submits, requestor confirms/rejects, reopens, etc.)

2. Security
- No new tables. Existing RLS policies on work_orders already allow anon+authenticated CRUD.
- No policy changes needed — the new columns are covered by the existing permissive update policy.

3. Important Notes
- All three columns are nullable / have defaults so existing rows are unaffected.
- `closeout_history` is a jsonb array so each reopen/reject event appends without data loss.
*/
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS closeout_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closeout_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closeout_history jsonb DEFAULT '[]'::jsonb;
