/*
# Link work orders to their source service request

1. Changes
- Add `source_sr_id` column to `work_orders` (text, nullable) to track which service request a work order was converted from.
2. Notes
- This allows the close-out confirmation flow to also close the original service request when the requestor approves the repair.
- No RLS policy changes needed — the column is readable/writable under existing work_orders policies.
*/

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS source_sr_id text;
