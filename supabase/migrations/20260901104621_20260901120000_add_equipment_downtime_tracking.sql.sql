/*
# Add equipment downtime tracking

1. New Tables
- `downtime_events`: records each period a piece of equipment is out of service.
  - `id` (uuid, primary key)
  - `eq_id` (text, references equipment) — which machine was down
  - `work_order_id` (text, nullable, references work_orders) — the WO that caused the downtime
  - `start_time` (timestamptz) — when the downtime began
  - `end_time` (timestamptz, nullable) — when the machine was back in service (null = still down)
  - `duration_hours` (numeric, nullable) — computed duration in hours once ended
  - `reason` (text) — why the machine is down (work order title or manual note)
  - `status` (text, default 'open') — 'open' while machine is down, 'resolved' when back
  - `created_at` (timestamptz)

2. Modified Tables
- `equipment`: adds `downtime_limit_hours` (numeric, default 24) — the maximum allowed downtime in hours before the biomedical manager must be notified.
- `equipment`: adds `track_downtime` (boolean, default false) — whether this equipment has a downtime checker enabled.

3. Security
- RLS enabled on `downtime_events`.
- This application has no sign-in screen; uses shared anon + authenticated CRUD policies (same pattern as all other tables).

4. Important Notes
- When a work order is created or advanced and the equipment is marked as down, a downtime_event is opened.
- When the work order is closed or the equipment status returns to available, the downtime_event is ended.
- The system checks downtime limits and notifies the biomedical manager when equipment is near, at, or over the limit.
*/

-- Add downtime tracking columns to equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS track_downtime boolean DEFAULT false;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS downtime_limit_hours numeric DEFAULT 24;

-- Create downtime events table
CREATE TABLE IF NOT EXISTS downtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eq_id text NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  work_order_id text REFERENCES work_orders(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  duration_hours numeric,
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE downtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "downtime_select" ON downtime_events;
CREATE POLICY "downtime_select" ON downtime_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "downtime_insert" ON downtime_events;
CREATE POLICY "downtime_insert" ON downtime_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "downtime_update" ON downtime_events;
CREATE POLICY "downtime_update" ON downtime_events FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "downtime_delete" ON downtime_events;
CREATE POLICY "downtime_delete" ON downtime_events FOR DELETE
  TO anon, authenticated USING (true);

-- Index for quick lookup of open events per equipment
CREATE INDEX IF NOT EXISTS idx_downtime_events_eq_open ON downtime_events(eq_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_downtime_events_eq ON downtime_events(eq_id);
