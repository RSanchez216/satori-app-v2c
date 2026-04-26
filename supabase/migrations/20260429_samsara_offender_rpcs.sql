-- ============================================================
-- Samsara Repeat Offender RPCs
-- Parses message_text in SQL via regex; no schema changes.
-- All four RPCs share the same classification + extraction
-- logic via inline CTEs (DRY would require a SQL function
-- returning a setof, which adds complexity for marginal gain).
-- ============================================================

-- 1) Overview stats: fleet totals + comparison to previous period
CREATE OR REPLACE FUNCTION public.get_samsara_overview(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE (
  total_alerts          bigint,
  unique_drivers        bigint,
  unique_units          bigint,
  critical_count        bigint,   -- crash + distraction
  high_count            bigint,   -- vehicle_fault + speeding + harsh_brake + def_system
  operational_count     bigint,   -- idle + fuel_low
  total_alerts_previous bigint    -- same-length window immediately before p_start
)
LANGUAGE sql
STABLE
AS $$
  WITH win AS (
    SELECT (p_end - p_start) AS len
  ),
  base AS (
    SELECT
      m.id,
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
    SELECT * FROM base
    WHERE created_at >= p_start AND created_at < p_end
      AND alert_type <> 'other'
      AND COALESCE(driver_id, '') <> '99999'
  ),
  previous_window AS (
    SELECT b.* FROM base b, win
    WHERE b.created_at >= (p_start - win.len) AND b.created_at < p_start
      AND b.alert_type <> 'other'
      AND COALESCE(b.driver_id, '') <> '99999'
  )
  SELECT
    (SELECT COUNT(*)                                                                              FROM current_window),
    (SELECT COUNT(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL)                        FROM current_window),
    (SELECT COUNT(DISTINCT unit_id)   FILTER (WHERE unit_id IS NOT NULL)                          FROM current_window),
    (SELECT COUNT(*) FILTER (WHERE alert_type IN ('crash','distraction'))                         FROM current_window),
    (SELECT COUNT(*) FILTER (WHERE alert_type IN ('vehicle_fault','speeding','harsh_brake','def_system')) FROM current_window),
    (SELECT COUNT(*) FILTER (WHERE alert_type IN ('idle','fuel_low'))                             FROM current_window),
    (SELECT COUNT(*)                                                                              FROM previous_window);
$$;

-- 2) Top driver offenders with breakdown
CREATE OR REPLACE FUNCTION public.get_samsara_driver_offenders(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  driver_id          text,
  total_alerts       bigint,
  speeding_count     bigint,
  harsh_brake_count  bigint,
  idle_count         bigint,
  fuel_low_count     bigint,
  distraction_count  bigint,
  def_count          bigint,
  alert_types_hit    int,
  last_alert_at      timestamptz,
  risk_score         numeric
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
      (regexp_match(m.message_text, 'Driver:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1] AS driver_id
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name ILIKE '%samsara%'
      AND m.message_text IS NOT NULL
      AND m.created_at >= p_start
      AND m.created_at <  p_end
  ),
  filtered AS (
    SELECT * FROM base
    WHERE alert_type IN ('speeding','harsh_brake','idle','fuel_low','distraction','def_system')
      AND driver_id IS NOT NULL
      AND driver_id <> '99999'
  )
  SELECT
    driver_id,
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
  GROUP BY driver_id
  ORDER BY risk_score DESC, total_alerts DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- 3) Top unit offenders (vehicle faults + idle attributed to unit)
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
  last_alert_at        timestamptz
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
  filtered AS (
    SELECT * FROM base
    WHERE alert_type IN ('vehicle_fault','idle')
      AND unit_id IS NOT NULL
  )
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
  ORDER BY fault_count DESC, total_alerts DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- 4) Critical events: every crash, severe speeding, and distraction event
CREATE OR REPLACE FUNCTION public.get_samsara_critical_events(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  alert_type   text,
  driver_id    text,
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
      (regexp_match(m.message_text, 'Driver:?\s*\*?\*?\s*([A-Z0-9]*\d[A-Z0-9]*)', 'i'))[1] AS driver_id,
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
  )
  SELECT
    alert_type,
    driver_id,
    unit_id,
    message_text                                                          AS message_full,
    created_at                                                            AS occurred_at
  FROM base
  WHERE alert_type IN ('crash','distraction','severe_speeding')
    AND COALESCE(driver_id, '') <> '99999'
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
