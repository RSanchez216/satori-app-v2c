-- ============================================================
-- The 20260430 migration only granted SELECT/INSERT/UPDATE/DELETE on
-- driver_unit_assignments to authenticated + service_role. The app's
-- browser client uses the anon role (no auth flow), so the import
-- in /sources?tab=drivers was failing with "permission denied for
-- table driver_unit_assignments".
-- Match the rest of the app's pattern (kb_violations etc.) and grant
-- to anon as well.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_unit_assignments
  TO anon;
