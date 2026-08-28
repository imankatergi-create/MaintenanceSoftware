/*
# Add technician assignments to PM work orders

1. Modified Tables
- `pm_work_orders`: adds `technician` (text) to store the specific technician assigned to each generated PM work order.
- Existing PM work orders are backfilled from the matching PM plan's technician where available.

2. Application Behavior
- Technicians can see and open only PM work orders assigned to their own technician record.
- Supervisors and other authorized staff continue to see all PM work orders.
- New PM work orders inherit the technician selected on their PM plan.

3. Security
- No new table or policy is created. Existing single-tenant access policies remain unchanged.
- The application enforces technician visibility using the existing signed-in user and technician records.

4. Data Safety
- This migration only adds a nullable column and fills it from existing plan data. No existing columns or rows are removed.
*/

ALTER TABLE pm_work_orders
  ADD COLUMN IF NOT EXISTS technician text;

UPDATE pm_work_orders pm
SET technician = plan.technician
FROM pm_plans plan
WHERE pm.technician IS NULL
  AND plan.technician IS NOT NULL
  AND plan.technician <> ''
  AND plan.technician <> 'Unassigned'
  AND plan.eq_id = pm.eq_id
  AND plan.freq = pm.freq;
