/*
# Add workflow_id to work_orders

1. Changes
- Adds a `workflow_id` column (text, nullable) to the `work_orders` table.
- This column stores the ID of the workflow assigned to a work order, linking
  the Workflow Designer's state machines to individual work orders.
- No data is lost — existing rows get NULL for the new column.
2. Security
- No changes to RLS policies. The existing anon/authenticated CRUD policies on
  work_orders already cover the new column since they grant access to all columns.
*/

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS workflow_id text;
