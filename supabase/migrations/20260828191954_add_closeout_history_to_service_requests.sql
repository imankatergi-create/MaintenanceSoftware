/*
# Add closeout_history to service_requests

1. Changes
- Add `closeout_history` column to `service_requests` (jsonb, nullable) to track close-out/reject actions by the requestor.
2. Notes
- Stores an array of { action, by, reason, timestamp } entries.
- No RLS changes needed — accessible under existing service_requests policies.
*/

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS closeout_history jsonb;
