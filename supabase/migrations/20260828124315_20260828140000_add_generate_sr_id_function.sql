/*
# Add generate_sr_id function

1. New Functions
- `generate_sr_id()` — atomically returns the next available service request ID
  in the format `SR-NNNN` by scanning existing IDs in the service_requests table.
  This prevents duplicate-key errors when a clinical user (whose in-memory SR list
  is filtered to only their own requests) generates an ID that already belongs
  to another user's request.
2. Security
- The function is SECURITY DEFINER, owned by postgres, and callable by anon + authenticated.
  It only reads the `id` column (text) — no sensitive data is exposed.
3. Notes
- The function is idempotent and safe to re-run.
- It scans existing IDs, extracts the numeric suffix, and returns the next sequential ID.
*/

CREATE OR REPLACE FUNCTION public.generate_sr_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_num integer := 1006;
  sr_id text;
BEGIN
  SELECT COALESCE(MAX(CAST(REPLACE(id, 'SR-', '') AS integer)), 1006)
  INTO max_num
  FROM service_requests
  WHERE id LIKE 'SR-%' AND id ~ '^SR-[0-9]+$';

  sr_id := 'SR-' || lpad(CAST(max_num + 1 AS text), 4, '0');
  RETURN sr_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sr_id() TO anon, authenticated;
