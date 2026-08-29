/*
# Create departments and department_roles tables

## Purpose
- Departments: master list of departments (ICU, Radiology, etc.)
- Department_roles: links departments to roles, so certain roles are scoped to certain departments

## Changes
1. Creates `departments` table with id, name, description, created_at
2. Creates `department_roles` junction table linking departments to roles
3. Enables RLS on both tables with full CRUD for anon+authenticated (app handles scoping)
4. Seeds initial departments
*/