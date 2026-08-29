-- Add dept_scoped column to roles table
-- When true, users with this role only see equipment/work orders from their assigned department
-- When false, users with this role see everything regardless of their department assignment
ALTER TABLE roles ADD COLUMN IF NOT EXISTS dept_scoped boolean DEFAULT false;