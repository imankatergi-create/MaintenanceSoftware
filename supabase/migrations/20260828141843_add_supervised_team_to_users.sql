/*
# Add supervised_team column to users

1. Modified Tables
- `users` — add `supervised_team` (text, nullable) column.
  When a user is a supervisor, this column stores the team name they oversee
  (e.g. "Biomedical", "Imaging", "Facilities"). This allows the system to
  route PM pass/fail notifications and emails to the correct supervisor
  for each team, rather than picking any user with "supervisor" in their role.

2. Security
- No new tables. Existing RLS policies on `users` already cover the new column.
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS supervised_team text;
