-- ============================================================
-- Samsara polish (Session 1.5 follow-ups):
--   1. RLS policies on driver_unit_assignments for authenticated CRUD
--      (anon already covered by 20260502; this covers the same surface
--      for authenticated, which is the role the UI will use once auth
--      lands; the policies are additive and idempotent).
--   2. New get_samsara_unmapped_events() RPC for the unmapped pill
--      drilldown — aggregates per (unit_id, alert_type) to keep the
--      panel scannable.
--   3. Pagination on driver/unit offenders — adds p_offset and bumps
--      default p_limit to 25 (signature change → DROP + CREATE).
--   4. count_samsara_driver_offenders / count_samsara_unit_offenders
--      so the UI can show "Showing 25 of N · Show all".
-- ============================================================

-- 1) RLS policies on driver_unit_assignments.
-- The 20260502 migration already added an "Allow all" policy that
-- covers anon. We keep that and add explicit named policies for the
-- authenticated role so the surface is reviewable in pg_policy.

DROP POLICY IF EXISTS "authenticated can read assignments"   ON public.driver_unit_assignments;
DROP POLICY IF EXISTS "authenticated can write assignments"  ON public.driver_unit_assignments;
DROP POLICY IF EXISTS "authenticated can update assignments" ON public.driver_unit_assignments;
DROP POLICY IF EXISTS "authenticated can delete assignments" ON public.driver_unit_assignments;

CREATE POLICY "authenticated can read assignments"
  ON public.driver_unit_assignments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated can write assignments"
  ON public.driver_unit_assignments FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update assignments"
  ON public.driver_unit_assignments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete assignments"
  ON public.driver_unit_assignments FOR DELETE
  TO authenticated USING (true);


-- 2) Unmapped events RPC.
-- For a given window, returns alert events whose unit_id captured from
-- the message did NOT resolve via driver_unit_assignments. Aggregated
-- per (unit_id, alert_type) so a unit with 5 unmapped speeding events
-- shows as one row, not five.

CREATE OR REPLACE FUNCTION public.get_samsara_unmapped_events(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  unit_id      text,
  alert_type   text,
  occurred_at  timestamptz,
  message_hint text,
  alert_count  bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      m.message_text,
      m.created_at,
      CASE
        WHEN m.message_text ILIKE '%crash%' OR m.message_text ILIKE '%collision%' OR m.message_text ILIKE '%impact%' THEN 'crash'
        WHEN m.message_text ILIKE '%distract%' OR m.message_text ILIKE '%inattent%' THEN 'distraction'
        WHEN m.message_text ILIKE '%vehicle alert%' AND (m.message_text ILIKE '%spn %' OR m.message_text ILIKE '%fmi %' OR m.message_text ILIKE '%fault:%') THEN 'vehicle_fault'
        WHEN m.message_text ILIKE '%speed%alert%' OR m.message_text ILIKE '%speed%exceed%' OR m.message_text ILIKE '%speed%mph%' OR m.message_text ILIKE '%speed%posted%' THEN 'speeding'
        WHEN m.message_text ILIKE '%harsh%' AND (m.message_text ILIKE '%brak%' OR m.message_text ILIKE '%accel%') THEN 'harsh_brake'
        WHEN m.message_text ILIKE '%def level%' OR m.message_text ILIKE '%diesel exhaust fluid%' THEN 'def_system'
        WHEN m.message_text ILIKE '%engine idle alert%' THEN 'idle'
        WHEN m.message_text ILIKE '%fuel low%' OR m.message_text ILIKE '%low fuel%' THEN 'fuel_low'
        ELSE 'other'
      END AS alert_type,
      -- Use the same canonical extractor the resolver uses so we match the
      -- same unit values the report aggregates by.
      COALESCE(
        public.extract_tms_unit_id(m.message_text),
        public.extract_samsara_unit_id(m.message_text),
        public.extract_driver_line_value(m.message_text)
      ) AS unit_id
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name ILIKE '%samsara%'
      AND m.created_at >= p_start
      AND m.created_at <  p_end
      AND m.message_text IS NOT NULL
  ),
  unmapped AS (
    SELECT b.*
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_message(b.message_text, b.created_at)
    ) r ON true
    WHERE b.unit_id IS NOT NULL
      AND b.alert_type <> 'other'
      AND r.driver_id IS NULL
  ),
  agg AS (
    SELECT
      unit_id,
      alert_type,
      MAX(created_at)                                                                 AS latest_occurred_at,
      LEFT(REGEXP_REPLACE((ARRAY_AGG(message_text ORDER BY created_at DESC))[1], '\s+', ' ', 'g'), 120) AS hint,
      COUNT(*)                                                                        AS cnt
    FROM unmapped
    GROUP BY unit_id, alert_type
  )
  SELECT
    unit_id,
    alert_type,
    latest_occurred_at,
    hint,
    cnt
  FROM agg
  ORDER BY cnt DESC, latest_occurred_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_samsara_unmapped_events(timestamptz, timestamptz, int)
  TO anon, authenticated, service_role;


-- 3) Pagination support on driver/unit offenders.
-- Adding p_offset is a signature change, so DROP + CREATE.

DROP FUNCTION IF EXISTS public.get_samsara_driver_offenders(timestamptz, timestamptz, int);
DROP FUNCTION IF EXISTS public.get_samsara_unit_offenders(timestamptz, timestamptz, int);

CREATE OR REPLACE FUNCTION public.get_samsara_driver_offenders(
  p_start  timestamptz,
  p_end    timestamptz,
  p_limit  int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  driver_id          text,
  driver_name        text,
  is_resolved        boolean,
  total_alerts       bigint,
  speeding_count     bigint,
  harsh_brake_count  bigint,
  idle_count         bigint,
  fuel_low_count     bigint,
  distraction_count  bigint,
  def_count          bigint,
  alert_types_hit    int,
  last_alert_at      timestamptz,
  risk_score         numeric,
  units_driven       text[]
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      m.message_text,
      m.created_at,
      CASE
        WHEN m.message_text ILIKE '%crash%' OR m.message_text ILIKE '%collision%' OR m.message_text ILIKE '%impact%' THEN 'crash'
        WHEN m.message_text ILIKE '%distract%' OR m.message_text ILIKE '%inattent%' THEN 'distraction'
        WHEN m.message_text ILIKE '%vehicle alert%' AND (m.message_text ILIKE '%spn %' OR m.message_text ILIKE '%fmi %' OR m.message_text ILIKE '%fault:%') THEN 'vehicle_fault'
        WHEN m.message_text ILIKE '%speed%alert%' OR m.message_text ILIKE '%speed%exceed%' OR m.message_text ILIKE '%speed%mph%' OR m.message_text ILIKE '%speed%posted%' THEN 'speeding'
        WHEN m.message_text ILIKE '%harsh%' AND (m.message_text ILIKE '%brak%' OR m.message_text ILIKE '%accel%') THEN 'harsh_brake'
        WHEN m.message_text ILIKE '%def level%' OR m.message_text ILIKE '%diesel exhaust fluid%' THEN 'def_system'
        WHEN m.message_text ILIKE '%engine idle alert%' THEN 'idle'
        WHEN m.message_text ILIKE '%fuel low%' OR m.message_text ILIKE '%low fuel%' THEN 'fuel_low'
        ELSE 'other'
      END AS alert_type,
      public.extract_driver_line_value(m.message_text) AS driver_id_raw,
      COALESCE(
        public.extract_tms_unit_id(m.message_text),
        public.extract_samsara_unit_id(m.message_text)
      ) AS unit_id_extracted
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name ILIKE '%samsara%'
      AND m.message_text IS NOT NULL
      AND m.created_at >= p_start
      AND m.created_at <  p_end
  ),
  resolved AS (
    SELECT
      b.*,
      r.driver_id       AS resolved_driver_id,
      r.driver_name     AS resolved_driver_name,
      r.matched_unit_id,
      COALESCE(r.matched_unit_id, b.unit_id_extracted)        AS unit_id,
      COALESCE(r.driver_id,       b.driver_id_raw)            AS canonical_driver_id,
      r.driver_name                                            AS canonical_driver_name,
      (r.driver_id IS NOT NULL)                                AS is_resolved
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_message(b.message_text, b.created_at)
    ) r ON true
    WHERE b.alert_type IN ('speeding','harsh_brake','idle','fuel_low','distraction','def_system')
      AND COALESCE(b.driver_id_raw, '') <> '99999'
  ),
  filtered AS (
    SELECT * FROM resolved
    WHERE canonical_driver_id IS NOT NULL
  ),
  by_driver_unit AS (
    SELECT canonical_driver_id, unit_id, COUNT(*) AS pair_count
    FROM filtered
    WHERE unit_id IS NOT NULL
    GROUP BY canonical_driver_id, unit_id
  ),
  units_per_driver AS (
    SELECT canonical_driver_id, array_agg(unit_id ORDER BY pair_count DESC, unit_id ASC) AS units_driven
    FROM by_driver_unit
    GROUP BY canonical_driver_id
  ),
  driver_aggregate AS (
    SELECT
      canonical_driver_id,
      MAX(canonical_driver_name)                                          AS canonical_driver_name,
      bool_or(is_resolved)                                                AS is_resolved,
      COUNT(*)                                                            AS total_alerts,
      COUNT(*) FILTER (WHERE alert_type = 'speeding')                     AS speeding_count,
      COUNT(*) FILTER (WHERE alert_type = 'harsh_brake')                  AS harsh_brake_count,
      COUNT(*) FILTER (WHERE alert_type = 'idle')                         AS idle_count,
      COUNT(*) FILTER (WHERE alert_type = 'fuel_low')                     AS fuel_low_count,
      COUNT(*) FILTER (WHERE alert_type = 'distraction')                  AS distraction_count,
      COUNT(*) FILTER (WHERE alert_type = 'def_system')                   AS def_count,
      COUNT(DISTINCT alert_type)::int                                     AS alert_types_hit,
      MAX(created_at)                                                     AS last_alert_at,
      (
        5 * COUNT(*) FILTER (WHERE alert_type = 'distraction') +
        3 * COUNT(*) FILTER (WHERE alert_type IN ('speeding','harsh_brake','def_system')) +
        1 * COUNT(*) FILTER (WHERE alert_type IN ('idle','fuel_low'))
      )::numeric                                                          AS risk_score
    FROM filtered
    GROUP BY canonical_driver_id
  )
  SELECT
    da.canonical_driver_id   AS driver_id,
    da.canonical_driver_name AS driver_name,
    da.is_resolved,
    da.total_alerts,
    da.speeding_count,
    da.harsh_brake_count,
    da.idle_count,
    da.fuel_low_count,
    da.distraction_count,
    da.def_count,
    da.alert_types_hit,
    da.last_alert_at,
    da.risk_score,
    COALESCE(upd.units_driven, ARRAY[]::text[]) AS units_driven
  FROM driver_aggregate da
  LEFT JOIN units_per_driver upd ON upd.canonical_driver_id = da.canonical_driver_id
  ORDER BY da.risk_score DESC, da.total_alerts DESC
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.get_samsara_unit_offenders(
  p_start  timestamptz,
  p_end    timestamptz,
  p_limit  int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  unit_id              text,
  fault_count          bigint,
  fault_codes_distinct int,
  idle_count           bigint,
  total_alerts         bigint,
  last_alert_at        timestamptz,
  drivers              text[]
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      m.message_text,
      m.created_at,
      CASE
        WHEN m.message_text ILIKE '%vehicle alert%' AND (m.message_text ILIKE '%spn %' OR m.message_text ILIKE '%fmi %' OR m.message_text ILIKE '%fault:%') THEN 'vehicle_fault'
        WHEN m.message_text ILIKE '%engine idle alert%' THEN 'idle'
        ELSE 'other'
      END AS alert_type,
      COALESCE(
        public.extract_tms_unit_id(m.message_text),
        public.extract_samsara_unit_id(m.message_text)
      ) AS unit_id_extracted,
      (regexp_match(m.message_text, 'SPN\s+(\d+)\s+FMI\s+(\d+)', 'i')) AS spn_fmi
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name ILIKE '%samsara%'
      AND m.message_text IS NOT NULL
      AND m.created_at >= p_start
      AND m.created_at <  p_end
  ),
  resolved AS (
    SELECT
      b.*,
      r.driver_name AS resolved_driver_name,
      COALESCE(r.matched_unit_id, b.unit_id_extracted) AS unit_id
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_message(b.message_text, b.created_at)
    ) r ON true
    WHERE b.alert_type IN ('vehicle_fault','idle')
  ),
  filtered AS (
    SELECT * FROM resolved WHERE unit_id IS NOT NULL
  ),
  by_unit_driver AS (
    SELECT unit_id, resolved_driver_name, COUNT(*) AS pair_count
    FROM filtered
    WHERE resolved_driver_name IS NOT NULL
    GROUP BY unit_id, resolved_driver_name
  ),
  drivers_per_unit AS (
    SELECT unit_id, array_agg(resolved_driver_name ORDER BY pair_count DESC, resolved_driver_name ASC) AS drivers
    FROM by_unit_driver
    GROUP BY unit_id
  ),
  unit_aggregate AS (
    SELECT
      unit_id,
      COUNT(*) FILTER (WHERE alert_type = 'vehicle_fault')                AS fault_count,
      COUNT(DISTINCT spn_fmi[1] || '/' || spn_fmi[2])
        FILTER (WHERE alert_type = 'vehicle_fault' AND spn_fmi IS NOT NULL)::int AS fault_codes_distinct,
      COUNT(*) FILTER (WHERE alert_type = 'idle')                         AS idle_count,
      COUNT(*)                                                            AS total_alerts,
      MAX(created_at)                                                     AS last_alert_at
    FROM filtered
    GROUP BY unit_id
  )
  SELECT
    ua.unit_id,
    ua.fault_count,
    ua.fault_codes_distinct,
    ua.idle_count,
    ua.total_alerts,
    ua.last_alert_at,
    COALESCE(dpu.drivers, ARRAY[]::text[]) AS drivers
  FROM unit_aggregate ua
  LEFT JOIN drivers_per_unit dpu ON dpu.unit_id = ua.unit_id
  ORDER BY ua.fault_count DESC, ua.total_alerts DESC
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_samsara_driver_offenders(timestamptz, timestamptz, int, int)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_samsara_unit_offenders(timestamptz, timestamptz, int, int)
  TO anon, authenticated, service_role;


-- 4) Count RPCs — needed for "Showing 25 of N · Show all".
-- Each mirrors the same WHERE/grouping as its offender sibling so the
-- count is consistent with what the offender list returns.

CREATE OR REPLACE FUNCTION public.count_samsara_driver_offenders(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      m.message_text,
      m.created_at,
      CASE
        WHEN m.message_text ILIKE '%crash%' OR m.message_text ILIKE '%collision%' OR m.message_text ILIKE '%impact%' THEN 'crash'
        WHEN m.message_text ILIKE '%distract%' OR m.message_text ILIKE '%inattent%' THEN 'distraction'
        WHEN m.message_text ILIKE '%vehicle alert%' AND (m.message_text ILIKE '%spn %' OR m.message_text ILIKE '%fmi %' OR m.message_text ILIKE '%fault:%') THEN 'vehicle_fault'
        WHEN m.message_text ILIKE '%speed%alert%' OR m.message_text ILIKE '%speed%exceed%' OR m.message_text ILIKE '%speed%mph%' OR m.message_text ILIKE '%speed%posted%' THEN 'speeding'
        WHEN m.message_text ILIKE '%harsh%' AND (m.message_text ILIKE '%brak%' OR m.message_text ILIKE '%accel%') THEN 'harsh_brake'
        WHEN m.message_text ILIKE '%def level%' OR m.message_text ILIKE '%diesel exhaust fluid%' THEN 'def_system'
        WHEN m.message_text ILIKE '%engine idle alert%' THEN 'idle'
        WHEN m.message_text ILIKE '%fuel low%' OR m.message_text ILIKE '%low fuel%' THEN 'fuel_low'
        ELSE 'other'
      END AS alert_type,
      public.extract_driver_line_value(m.message_text) AS driver_id_raw
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name ILIKE '%samsara%'
      AND m.message_text IS NOT NULL
      AND m.created_at >= p_start
      AND m.created_at <  p_end
  ),
  resolved AS (
    SELECT
      b.*,
      r.driver_id AS resolved_driver_id,
      COALESCE(r.driver_id, b.driver_id_raw) AS canonical_driver_id
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_message(b.message_text, b.created_at)
    ) r ON true
    WHERE b.alert_type IN ('speeding','harsh_brake','idle','fuel_low','distraction','def_system')
      AND COALESCE(b.driver_id_raw, '') <> '99999'
  )
  SELECT COUNT(*)::bigint FROM (
    SELECT canonical_driver_id
    FROM resolved
    WHERE canonical_driver_id IS NOT NULL
    GROUP BY canonical_driver_id
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.count_samsara_unit_offenders(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      m.message_text,
      m.created_at,
      CASE
        WHEN m.message_text ILIKE '%vehicle alert%' AND (m.message_text ILIKE '%spn %' OR m.message_text ILIKE '%fmi %' OR m.message_text ILIKE '%fault:%') THEN 'vehicle_fault'
        WHEN m.message_text ILIKE '%engine idle alert%' THEN 'idle'
        ELSE 'other'
      END AS alert_type,
      COALESCE(
        public.extract_tms_unit_id(m.message_text),
        public.extract_samsara_unit_id(m.message_text)
      ) AS unit_id_extracted
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name ILIKE '%samsara%'
      AND m.message_text IS NOT NULL
      AND m.created_at >= p_start
      AND m.created_at <  p_end
  ),
  resolved AS (
    SELECT
      b.*,
      COALESCE(r.matched_unit_id, b.unit_id_extracted) AS unit_id
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_message(b.message_text, b.created_at)
    ) r ON true
    WHERE b.alert_type IN ('vehicle_fault','idle')
  )
  SELECT COUNT(*)::bigint FROM (
    SELECT unit_id
    FROM resolved
    WHERE unit_id IS NOT NULL
    GROUP BY unit_id
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.count_samsara_driver_offenders(timestamptz, timestamptz)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_samsara_unit_offenders(timestamptz, timestamptz)
  TO anon, authenticated, service_role;
