-- Filters zero-fault units off the Samsara Unit Watchlist.
--
-- The watchlist is a "repeat offender" surface keyed on vehicle faults.
-- Units with idle alerts but no faults (e.g. 9411, M87) were landing on
-- the list because the upstream filter accepted alert_type IN
-- ('vehicle_fault','idle'). Adding `fault_count > 0` to the final SELECT
-- removes them while keeping idle counts populated for units that DO
-- have faults.
--
-- Both RPCs (the list and its count companion) get the same filter so
-- the "Show all (N)" footer matches the visible row count.
--
-- Return signatures are unchanged; CREATE OR REPLACE is sufficient.

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
  drivers              text[],
  top_issues           jsonb
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
  fault_breakdown AS (
    SELECT
      unit_id,
      spn_fmi[1]::int AS spn,
      spn_fmi[2]::int AS fmi,
      COUNT(*)        AS pair_count
    FROM filtered
    WHERE alert_type = 'vehicle_fault'
      AND spn_fmi IS NOT NULL
    GROUP BY unit_id, spn_fmi[1]::int, spn_fmi[2]::int
  ),
  top_issues_per_unit AS (
    SELECT
      unit_id,
      jsonb_agg(
        jsonb_build_object('spn', spn, 'fmi', fmi, 'count', pair_count)
        ORDER BY pair_count DESC, spn ASC, fmi ASC
      ) AS top_issues
    FROM fault_breakdown
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
    COALESCE(dpu.drivers, ARRAY[]::text[])      AS drivers,
    COALESCE(tipu.top_issues, '[]'::jsonb)      AS top_issues
  FROM unit_aggregate ua
  LEFT JOIN drivers_per_unit    dpu  ON dpu.unit_id  = ua.unit_id
  LEFT JOIN top_issues_per_unit tipu ON tipu.unit_id = ua.unit_id
  WHERE ua.fault_count > 0
  ORDER BY ua.fault_count DESC, ua.total_alerts DESC
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_samsara_unit_offenders(timestamptz, timestamptz, int, int)
  TO anon, authenticated, service_role;


-- Companion count RPC — same filter so "Show all (N)" matches list length.
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
    HAVING COUNT(*) FILTER (WHERE alert_type = 'vehicle_fault') > 0
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.count_samsara_unit_offenders(timestamptz, timestamptz)
  TO anon, authenticated, service_role;
