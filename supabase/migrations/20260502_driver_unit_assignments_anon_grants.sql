-- ============================================================
-- The 20260430 migration was missing two pieces required for the
-- browser client (anon role) to read/write the table:
--
--  1. INSERT/UPDATE/DELETE grants to anon (was authenticated/service
--     role only — the app has no auth flow, so anon is the role used
--     for all client writes).
--
--  2. RLS policy. Supabase Cloud auto-enables RLS on new tables, and
--     without a permissive policy PostgREST returns 401 on every
--     access. The rest of the app uses an "Allow all" policy on each
--     table (see schema.sql). Match that pattern.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_unit_assignments
  TO anon;

-- Ensure RLS is on (idempotent; no-op if Cloud already enabled it)
ALTER TABLE public.driver_unit_assignments ENABLE ROW LEVEL SECURITY;

-- Drop + recreate so reapply is safe
DROP POLICY IF EXISTS "Allow all" ON public.driver_unit_assignments;
CREATE POLICY "Allow all" ON public.driver_unit_assignments
  FOR ALL USING (true) WITH CHECK (true);
