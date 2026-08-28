-- Drop FK constraints that prevent PM work order IDs from being used in notifications
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_work_order_id_fkey;
ALTER TABLE email_notifications DROP CONSTRAINT IF EXISTS email_notifications_work_order_id_fkey;
