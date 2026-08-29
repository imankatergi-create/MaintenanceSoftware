/*
# Add status column to service_requests

1. Changes
- Add `status` column to `service_requests` (text, nullable) to track the request lifecycle: open, submitted, converted, closed.
- Existing rows get NULL status, which the app treats as "open/submitted".
2. Notes
- This allows the close-out confirmation flow to mark the original service request as "closed" when the requestor approves the repair.
- No RLS changes needed — the column is accessible under existing service_requests policies.
*/

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS status text;
