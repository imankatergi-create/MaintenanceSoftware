/*
# Support multiple departments per user

## Purpose
Currently each user has a single `dept` text column on the `users` table.
The user wants to assign users to multiple departments so that department-scoped
users can see equipment/service requests across all their assigned departments.

## Changes
1. New table `user_departments`:
   - `user_id` (text, references users.id, ON DELETE CASCADE)
   - `dept` (text, not null) — department name
   - Composite primary key (user_id, dept) to prevent duplicates
2. Data migration: for every existing user with a non-null, non-empty `dept`,
   insert a row into `user_departments`.
3. The `users.dept` column is kept for backward compatibility — the frontend
   will read from `user_departments` going forward but existing code that
   references `users.dept` still works. We also sync `users.dept` to a
   comma-separated list of the user's departments for backward-compatible reads.
4. RLS enabled on `user_departments` with full CRUD for anon+authenticated
   (single-tenant CMMS pattern used throughout this app).

## Security
- RLS enabled on `user_departments`.
- CRUD policies for anon + authenticated (matches existing app pattern).
*/