/*
# Add work-order action records and notifications

1. New Tables
- `part_requests`: requested parts, quantity, requester, status, and work order link.
- `work_order_escalations`: escalation reason, destination, priority, and status.
- `notifications`: in-app messages linked to work orders and recipients.
- `email_notifications`: durable email queue with delivery status.
2. Security
- RLS is enabled on every new table.
- This application has no sign-in screen and intentionally uses shared anon + authenticated CRUD policies.
3. Important Notes
- These tables preserve action history instead of relying on temporary toast messages.
- Email rows are queued durably so delivery can be connected to an approved email provider without losing events.
*/

CREATE TABLE IF NOT EXISTS part_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id text NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  part_id text NOT NULL REFERENCES parts(id),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  requested_by text NOT NULL DEFAULT 'Admin',
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'Requested',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE part_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "part_req_select" ON part_requests;
CREATE POLICY "part_req_select" ON part_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "part_req_insert" ON part_requests;
CREATE POLICY "part_req_insert" ON part_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "part_req_update" ON part_requests;
CREATE POLICY "part_req_update" ON part_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "part_req_delete" ON part_requests;
CREATE POLICY "part_req_delete" ON part_requests FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS work_order_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id text NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  reason text NOT NULL,
  destination text NOT NULL DEFAULT 'Management',
  priority text NOT NULL DEFAULT 'P1',
  escalated_by text NOT NULL DEFAULT 'Admin',
  status text NOT NULL DEFAULT 'Open',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE work_order_escalations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wo_esc_select" ON work_order_escalations;
CREATE POLICY "wo_esc_select" ON work_order_escalations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "wo_esc_insert" ON work_order_escalations;
CREATE POLICY "wo_esc_insert" ON work_order_escalations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "wo_esc_update" ON work_order_escalations;
CREATE POLICY "wo_esc_update" ON work_order_escalations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "wo_esc_delete" ON work_order_escalations;
CREATE POLICY "wo_esc_delete" ON work_order_escalations FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id text REFERENCES work_orders(id) ON DELETE CASCADE,
  recipient text NOT NULL DEFAULT 'Management',
  title text NOT NULL,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select" ON notifications;
CREATE POLICY "notif_select" ON notifications FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "notif_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_update" ON notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "notif_delete" ON notifications;
CREATE POLICY "notif_delete" ON notifications FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id text REFERENCES work_orders(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text DEFAULT '',
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text DEFAULT '',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_notif_select" ON email_notifications;
CREATE POLICY "email_notif_select" ON email_notifications FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "email_notif_insert" ON email_notifications;
CREATE POLICY "email_notif_insert" ON email_notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "email_notif_update" ON email_notifications;
CREATE POLICY "email_notif_update" ON email_notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "email_notif_delete" ON email_notifications;
CREATE POLICY "email_notif_delete" ON email_notifications FOR DELETE TO anon, authenticated USING (true);
