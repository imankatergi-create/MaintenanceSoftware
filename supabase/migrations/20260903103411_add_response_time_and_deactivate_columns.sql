/*
# Add response time tracking and deactivation columns

1. Changes to work_orders table:
- Add `completed_at` (timestamptz, nullable) — stores when the work order was closed/completed.
- Add `response_time_hours` (numeric, nullable) — stores how long it took to complete the work order, in hours.

2. Changes to equipment table:
- Add `active` (boolean, default true) — allows deactivating equipment without deleting it.

3. Changes to parts table:
- Add `active` (boolean, default true) — allows deactivating spare parts without deleting them.

4. Security
- No new tables. Existing RLS policies already cover these columns.
*/

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS response_time_hours numeric;

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
