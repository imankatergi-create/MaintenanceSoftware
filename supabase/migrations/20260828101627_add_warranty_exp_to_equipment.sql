/*
# Add warranty expiry date to equipment

1. Modified Tables
- `equipment` — add `warranty_exp` (date, nullable) column to track the actual
  warranty expiration date. The existing `warranty` text column stays for
  backward compatibility but the app will now derive warranty status from
  `warranty_exp` when available.
2. Security
- No policy changes. RLS already enabled on equipment.
*/

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS warranty_exp date;
