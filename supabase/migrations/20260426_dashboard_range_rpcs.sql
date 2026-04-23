-- ============================================================
-- Generalized Dashboard KB RPCs: accept explicit window bounds.
-- Previous-period comparison uses same-length window immediately
-- before p_start (apples-to-apples regardless of range size).
-- The today-only versions (get_violations_today_summary,
-- get_top_violated_rules_today) remain in place; cleanup is a
-- separate pass once nothing else calls them.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_violations_summary(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE (
  total          bigint,
  critical       bigint,
  high           bigint,
  medium         bigint,
  low            bigint,
  total_previous bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH win AS (
    SELECT (p_end - p_start) AS len
  ),
  context_max_severity AS (
    -- Each context gets bucketed into its single highest-severity rule
    -- so the severity totals sum to `total` instead of double-counting.
    SELECT
      v.context_id,
      MIN(
        CASE r.severity
          WHEN 'critical' THEN 1
          WHEN 'high'     THEN 2
          WHEN 'medium'   THEN 3
          WHEN 'low'      THEN 4
        END
      ) AS sev_rank
    FROM public.kb_violations v
    JOIN public.knowledge_base_rules r ON r.rule_id = v.rule_id
    WHERE v.detected_at >= p_start AND v.detected_at < p_end
    GROUP BY v.context_id
  ),
  current_period AS (
    SELECT
      COUNT(*)                              AS total,
      COUNT(*) FILTER (WHERE sev_rank = 1)  AS crit,
      COUNT(*) FILTER (WHERE sev_rank = 2)  AS high,
      COUNT(*) FILTER (WHERE sev_rank = 3)  AS med,
      COUNT(*) FILTER (WHERE sev_rank = 4)  AS low
    FROM context_max_severity
  ),
  previous_period AS (
    SELECT COUNT(DISTINCT v.context_id) AS total
    FROM public.kb_violations v
    CROSS JOIN win
    WHERE v.detected_at >= (p_start - win.len)
      AND v.detected_at <  p_start
  )
  SELECT
    current_period.total, current_period.crit, current_period.high,
    current_period.med, current_period.low,
    previous_period.total
  FROM current_period, previous_period;
$$;

CREATE OR REPLACE FUNCTION public.get_top_violated_rules(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  rule_id         text,
  title           text,
  domain          text,
  severity        text,
  violation_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.rule_id,
    r.title,
    r.domain,
    r.severity,
    COUNT(DISTINCT v.context_id) AS violation_count
  FROM public.kb_violations v
  JOIN public.knowledge_base_rules r ON r.rule_id = v.rule_id
  WHERE v.detected_at >= p_start
    AND v.detected_at <  p_end
  GROUP BY r.rule_id, r.title, r.domain, r.severity
  ORDER BY violation_count DESC, r.severity ASC, r.title ASC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_violations_summary(timestamptz, timestamptz)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_violated_rules(timestamptz, timestamptz, int)
  TO anon, authenticated, service_role;
