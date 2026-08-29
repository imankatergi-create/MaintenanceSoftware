/*
# Add department column to users

## Purpose
Links each user to a department so that:
- Equipment visibility can be scoped by department (users only see equipment in their department)
- Service request forms only show equipment from the user's department
- Work order reports can display the requestor's department

## Changes
1. Adds `dept` column (text, nullable) to the `users` table
2. No RLS changes needed — existing policies already allow anon/authenticated full access

## Notes
- Users without a dept value (e.g. admins, supervisors) will see all equipment
- Only users with a dept set will be scoped to that department's equipment
*/