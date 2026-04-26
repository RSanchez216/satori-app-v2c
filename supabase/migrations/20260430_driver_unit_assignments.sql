-- ============================================================
-- Driver-to-Unit assignments table.
-- Time-bounded: a driver was assigned to a unit from start_date
-- (inclusive) until end_date (exclusive). end_date NULL means
-- "still active". Multiple overlapping records are allowed; the
-- resolver picks the latest start_date when there's overlap.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.driver_unit_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       text        NOT NULL,
  driver_id     text        NOT NULL,
  driver_name   text        NOT NULL,
  start_date    timestamptz NOT NULL,
  end_date      timestamptz,
  source        text        DEFAULT 'csv_import',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Hot path: lookups by unit + time
CREATE INDEX IF NOT EXISTS idx_dua_unit_dates
  ON public.driver_unit_assignments (unit_id, start_date DESC, end_date);

-- Resolve who was driving a given unit at a given timestamp. If multiple
-- assignments cover the timestamp (overlapping records), the most recent
-- start_date wins.
CREATE OR REPLACE FUNCTION public.resolve_driver_for_unit_at(
  p_unit_id text,
  p_ts      timestamptz
)
RETURNS TABLE (
  driver_id   text,
  driver_name text
)
LANGUAGE sql
STABLE
AS $$
  SELECT a.driver_id, a.driver_name
  FROM public.driver_unit_assignments a
  WHERE a.unit_id = p_unit_id
    AND a.start_date <= p_ts
    AND (a.end_date IS NULL OR a.end_date > p_ts)
  ORDER BY a.start_date DESC
  LIMIT 1;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_unit_assignments
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_driver_for_unit_at(text, timestamptz)
  TO anon, authenticated, service_role;

-- "Current driver per unit" view for quick lookups
CREATE OR REPLACE VIEW public.v_unit_current_driver AS
  SELECT DISTINCT ON (a.unit_id)
    a.unit_id,
    a.driver_id,
    a.driver_name,
    a.start_date,
    a.end_date
  FROM public.driver_unit_assignments a
  WHERE a.start_date <= now()
    AND (a.end_date IS NULL OR a.end_date > now())
  ORDER BY a.unit_id, a.start_date DESC;

GRANT SELECT ON public.v_unit_current_driver TO anon, authenticated, service_role;
