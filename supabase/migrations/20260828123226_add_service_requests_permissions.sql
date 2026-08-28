-- Add "Service Requests" permission rows for all existing roles

-- Full access for admin and manager roles
INSERT INTO permissions (role_id, module, action, allowed)
SELECT r.id, 'Service Requests', a.action, true
FROM roles r
CROSS JOIN (VALUES ('View'), ('Create'), ('Edit'), ('Approve'), ('Delete')) AS a(action)
WHERE r.id IN ('sysadmin', 'cmmsadmin', 'biomanager', 'bioeng', 'biotech', 'facil', 'deptmgr', 'quality')
ON CONFLICT (role_id, module, action) DO NOTHING;

-- View + Create for requester (Clinical Department User) and deptmgr
INSERT INTO permissions (role_id, module, action, allowed)
SELECT r.id, 'Service Requests', a.action, true
FROM roles r
CROSS JOIN (VALUES ('View'), ('Create')) AS a(action)
WHERE r.id IN ('requester')
ON CONFLICT (role_id, module, action) DO NOTHING;

-- View-only for auditor, exec, finance, procure, store, vendor
INSERT INTO permissions (role_id, module, action, allowed)
SELECT r.id, 'Service Requests', 'View', true
FROM roles r
WHERE r.id IN ('auditor', 'exec', 'finance', 'procure', 'store', 'vendor')
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Ensure all roles have a row for every action (false where not yet granted)
INSERT INTO permissions (role_id, module, action, allowed)
SELECT r.id, 'Service Requests', a.action, false
FROM roles r
CROSS JOIN (VALUES ('View'), ('Create'), ('Edit'), ('Approve'), ('Delete')) AS a(action)
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p
  WHERE p.role_id = r.id AND p.module = 'Service Requests' AND p.action = a.action
)
ON CONFLICT (role_id, module, action) DO NOTHING;
