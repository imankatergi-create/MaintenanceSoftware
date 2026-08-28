/*
# Add requestor column to work_orders

1. Modified Tables
- `work_orders`: adds `requestor` text column (nullable) to track who reported the fault.
  This lets the system notify the original requestor when the work order status changes
  or when the work order is closed.

2. Security
- No RLS policy changes needed — the column is covered by existing work_orders policies.
*/

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS requestor text;
