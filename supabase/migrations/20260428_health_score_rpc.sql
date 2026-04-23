-- ============================================================
-- Health Score: 100 - penalties from alert-worthy non-Samsara
-- contexts in the window. Returns current + previous-period
-- score for trend delta. Breakdown counts let the tile render
-- "-18 pts · 3 critical contexts" style detail.
--
-- Samsara messages are excluded because the Samsara Alerts tile
-- tracks them separately; including them here previously pinned
-- the score to 0%.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_health_score(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE (
  score              numeric,
  score_previous     numeric,
  critical_count     bigint,
  high_count         bigint,
  medium_count       bigint,
  low_count          bigint,
  critical_penalty   numeric,
  high_penalty       numeric,
  medium_penalty     numeric,
  low_penalty        numeric,
  total_count        bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH samsara_sources AS (
    SELECT id FROM public.sources WHERE name ILIKE '%samsara%'
  ),
  win AS (
    SELECT (p_end - p_start) AS len
  ),
  current_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE lower(c.severity) = 'critical') AS crit,
      COUNT(*) FILTER (WHERE lower(c.severity) = 'high')     AS high,
      COUNT(*) FILTER (WHERE lower(c.severity) = 'medium')   AS med,
      COUNT(*) FILTER (WHERE lower(c.severity) = 'low')      AS low
    FROM public.message_contexts c
    WHERE c.alert_worthy = true
      AND (c.source_id IS NULL OR c.source_id NOT IN (SELECT id FROM samsara_sources))
      AND c.created_at >= p_start
      AND c.created_at <  p_end
  ),
  previous_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE lower(c.severity) = 'critical') AS crit,
      COUNT(*) FILTER (WHERE lower(c.severity) = 'high')     AS high,
      COUNT(*) FILTER (WHERE lower(c.severity) = 'medium')   AS med,
      COUNT(*) FILTER (WHERE lower(c.severity) = 'low')      AS low
    FROM public.message_contexts c
    CROSS JOIN win
    WHERE c.alert_worthy = true
      AND (c.source_id IS NULL OR c.source_id NOT IN (SELECT id FROM samsara_sources))
      AND c.created_at >= (p_start - win.len)
      AND c.created_at <  p_start
  ),
  scored AS (
    SELECT
      cc.crit,
      cc.high,
      cc.med,
      cc.low,
      (6.0 * cc.crit  + 3.0 * cc.high  + 1.0 * cc.med  + 0.25 * cc.low) AS current_penalty,
      (6.0 * pc.crit  + 3.0 * pc.high  + 1.0 * pc.med  + 0.25 * pc.low) AS previous_penalty
    FROM current_counts cc, previous_counts pc
  )
  SELECT
    GREATEST(10, LEAST(100, 100 - current_penalty))::numeric  AS score,
    GREATEST(10, LEAST(100, 100 - previous_penalty))::numeric AS score_previous,
    crit                                                       AS critical_count,
    high                                                       AS high_count,
    med                                                        AS medium_count,
    low                                                        AS low_count,
    (6.0  * crit)::numeric                                     AS critical_penalty,
    (3.0  * high)::numeric                                     AS high_penalty,
    (1.0  * med)::numeric                                      AS medium_penalty,
    (0.25 * low)::numeric                                      AS low_penalty,
    (crit + high + med + low)                                  AS total_count
  FROM scored;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_score(timestamptz, timestamptz)
  TO anon, authenticated, service_role;
