-- Add user_id column to service_requests so each user can see only their own requests
ALTER TABLE service_requests ADD COLUMN user_id text;

-- Backfill: try to match existing 'by' text to user names
UPDATE service_requests sr
SET user_id = u.id
FROM users u
WHERE sr.user_id IS NULL
  AND u.name IS NOT NULL
  AND sr.by IS NOT NULL
  AND lower(trim(sr.by)) = lower(trim(u.name));

-- Backfill remaining unmatched rows with a placeholder so they're visible to admins
UPDATE service_requests SET user_id = 'unknown' WHERE user_id IS NULL;

ALTER TABLE service_requests ALTER COLUMN user_id SET NOT NULL;
