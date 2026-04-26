-- ============================================================
-- Update Samsara RPCs to resolve drivers via driver_unit_assignments.
-- Each RPC now joins LATERAL resolve_driver_for_unit_at() to enrich
-- alerts with the actual driver who was on the unit at the time.
-- Where no mapping exists, the message-text capture is the fallback.
--
-- Return shapes change, so we DROP first (CREATE OR REPLACE can't
-- alter RETURNS TABLE columns).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_samsara_overview(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_samsara_driver_offenders(timestamptz, timestamptz, int);
DROP FUNCTION IF EXISTS public.get_samsara_unit_offenders(timestamptz, timestamptz, int);
DROP FUNCTION IF EXISTS public.get_samsara_critical_events(timestamptz, timestamptz, int);

-- 1) Overview ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_samsara_overview(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE (
  total_alerts          bigint,
  unique_drivers        bigint,
  unique_units          bigint,
  critical_count        bigint,
  high_count            bigint,
  operational_count     bigint,
  total_alerts_previous bigint,
  unmapped_drivers      bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH win AS (
    SELECT (p_end - p_start) AS len
  ),
  base AS (
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
      (regexp_match(m.message_text, 'Driver:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1] AS driver_id,
      COALESCE(
        (regexp_match(m.message_text, 'Vehicle Alert\s*-\s*Unit\s+([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1],
        (regexp_match(m.message_text, 'Unit:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1]
      ) AS unit_id
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name ILIKE '%samsara%'
      AND m.message_text IS NOT NULL
  ),
  current_window AS (
    SELECT
      b.*,
      r.driver_id   AS resolved_driver_id,
      r.driver_name AS resolved_driver_name,
      COALESCE(r.driver_id, b.driver_id) AS canonical_driver_id,
      (r.driver_id IS NOT NULL)          AS is_resolved
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_unit_at(b.unit_id, b.created_at)
    ) r ON b.unit_id IS NOT NULL
    WHERE b.created_at >= p_start AND b.created_at < p_end
      AND b.alert_type <> 'other'
      AND COALESCE(b.driver_id, '') <> '99999'
  ),
  previous_window AS (
    SELECT b.* FROM base b, win
    WHERE b.created_at >= (p_start - win.len) AND b.created_at < p_start
      AND b.alert_type <> 'other'
      AND COALESCE(b.driver_id, '') <> '99999'
  )
  SELECT
    (SELECT COUNT(*)                                                                                              FROM current_window),
    (SELECT COUNT(DISTINCT canonical_driver_id) FILTER (WHERE canonical_driver_id IS NOT NULL)                    FROM current_window),
    (SELECT COUNT(DISTINCT unit_id)             FILTER (WHERE unit_id IS NOT NULL)                                FROM current_window),
    (SELECT COUNT(*) FILTER (WHERE alert_type IN ('crash','distraction'))                                         FROM current_window),
    (SELECT COUNT(*) FILTER (WHERE alert_type IN ('vehicle_fault','speeding','harsh_brake','def_system'))         FROM current_window),
    (SELECT COUNT(*) FILTER (WHERE alert_type IN ('idle','fuel_low'))                                             FROM current_window),
    (SELECT COUNT(*)                                                                                              FROM previous_window),
    (SELECT COUNT(DISTINCT canonical_driver_id) FILTER (WHERE NOT is_resolved AND canonical_driver_id IS NOT NULL) FROM current_window);
$$;

-- 2) Driver offenders -------------------------------------------
CREATE OR REPLACE FUNCTION public.get_samsara_driver_offenders(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 10
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
      (regexp_match(m.message_text, 'Driver:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1] AS driver_id_raw,
      COALESCE(
        (regexp_match(m.message_text, 'Vehicle Alert\s*-\s*Unit\s+([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1],
        (regexp_match(m.message_text, 'Unit:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1]
      ) AS unit_id
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
      r.driver_id   AS resolved_driver_id,
      r.driver_name AS resolved_driver_name,
      COALESCE(r.driver_id,    b.driver_id_raw) AS canonical_driver_id,
      r.driver_name                              AS canonical_driver_name,
      (r.driver_id IS NOT NULL)                  AS is_resolved
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_unit_at(b.unit_id, b.created_at)
    ) r ON b.unit_id IS NOT NULL
    WHERE b.alert_type IN ('speeding','harsh_brake','idle','fuel_low','distraction','def_system')
      AND COALESCE(b.driver_id_raw, '') <> '99999'
  ),
  filtered AS (
    SELECT * FROM resolved
    WHERE canonical_driver_id IS NOT NULL
  ),
  by_driver_unit AS (
    SELECT
      canonical_driver_id,
      unit_id,
      COUNT(*) AS pair_count
    FROM filtered
    WHERE unit_id IS NOT NULL
    GROUP BY canonical_driver_id, unit_id
  ),
  units_per_driver AS (
    SELECT
      canonical_driver_id,
      array_agg(unit_id ORDER BY pair_count DESC, unit_id ASC) AS units_driven
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
  LIMIT GREATEST(p_limit, 1);
$$;

-- 3) Unit offenders ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_samsara_unit_offenders(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 10
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
        (regexp_match(m.message_text, 'Vehicle Alert\s*-\s*Unit\s+([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1],
        (regexp_match(m.message_text, 'Unit:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1]
      ) AS unit_id,
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
      r.driver_name AS resolved_driver_name
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_unit_at(b.unit_id, b.created_at)
    ) r ON b.unit_id IS NOT NULL
    WHERE b.alert_type IN ('vehicle_fault','idle')
      AND b.unit_id IS NOT NULL
  ),
  by_unit_driver AS (
    SELECT unit_id, resolved_driver_name, COUNT(*) AS pair_count
    FROM resolved
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
    FROM resolved
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
  LIMIT GREATEST(p_limit, 1);
$$;

-- 4) Critical events --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_samsara_critical_events(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  alert_type   text,
  driver_id    text,
  driver_name  text,
  unit_id      text,
  message_full text,
  occurred_at  timestamptz
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
        WHEN m.message_text ILIKE '%severe speed%' OR m.message_text ILIKE '%15+ mph%' OR m.message_text ILIKE '%15 mph over%' THEN 'severe_speeding'
        ELSE 'other'
      END AS alert_type,
      (regexp_match(m.message_text, 'Driver:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1] AS driver_id_raw,
      COALESCE(
        (regexp_match(m.message_text, 'Vehicle Alert\s*-\s*Unit\s+([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1],
        (regexp_match(m.message_text, 'Unit:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1]
      ) AS unit_id
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
      r.driver_id   AS resolved_driver_id,
      r.driver_name AS resolved_driver_name
    FROM base b
    LEFT JOIN LATERAL (
      SELECT * FROM public.resolve_driver_for_unit_at(b.unit_id, b.created_at)
    ) r ON b.unit_id IS NOT NULL
  )
  SELECT
    alert_type,
    COALESCE(resolved_driver_id,   driver_id_raw)             AS driver_id,
    resolved_driver_name                                       AS driver_name,
    unit_id,
    message_text                                               AS message_full,
    created_at                                                 AS occurred_at
  FROM resolved
  WHERE alert_type IN ('crash','distraction','severe_speeding')
    AND COALESCE(driver_id_raw, '') <> '99999'
  ORDER BY
    CASE alert_type
      WHEN 'crash' THEN 1
      WHEN 'severe_speeding' THEN 2
      WHEN 'distraction' THEN 3
    END,
    created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_samsara_overview(timestamptz, timestamptz)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_samsara_driver_offenders(timestamptz, timestamptz, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_samsara_unit_offenders(timestamptz, timestamptz, int)   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_samsara_critical_events(timestamptz, timestamptz, int)  TO anon, authenticated, service_role;
