/*
# Add per-user notification read tracking

1. New Tables
- `notification_reads`
  - `notification_id` (uuid, references notifications, ON DELETE CASCADE)
  - `user_id` (text, references users(id), ON DELETE CASCADE)
  - `read_at` (timestamptz, when the user read it)
  - Composite primary key on (notification_id, user_id) — one read record per user per notification
2. Purpose
- Previously, notifications had a single `read` boolean shared by all users. When one user opened a notification, it appeared read for everyone.
- This table tracks read status per individual user, so each user sees their own unread/read state independently.
3. Security
- Enable RLS on `notification_reads`.
- Allow anon + authenticated full CRUD (the app uses anon key with a custom CMMS_USER identity, not Supabase auth).
*/

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_reads_select" ON notification_reads;
CREATE POLICY "notif_reads_select" ON notification_reads FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "notif_reads_insert" ON notification_reads;
CREATE POLICY "notif_reads_insert" ON notification_reads FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notif_reads_delete" ON notification_reads;
CREATE POLICY "notif_reads_delete" ON notification_reads FOR DELETE
  TO anon, authenticated USING (true);
