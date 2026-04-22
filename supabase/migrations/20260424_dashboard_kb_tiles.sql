-- ============================================================
-- Dashboard KB Tiles: violations today + top violated rules
-- All time windows use America/Chicago midnight boundaries.
-- ============================================================

-- Helper: returns today's CT midnight as a UTC timestamptz
CREATE OR REPLACE FUNCTION public.ct_today_midnight_utc()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT (date_trunc('day', (now() AT TIME ZONE 'America/Chicago')) AT TIME ZONE 'America/Chicago');
$$;

-- Helper: returns yesterday's CT midnight as a UTC timestamptz
CREATE OR REPLACE FUNCTION public.ct_yesterday_midnight_utc()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT (date_trunc('day', (now() AT TIME ZONE 'America/Chicago')) - interval '1 day') AT TIME ZONE 'America/Chicago';
$$;

-- ============================================================
-- RPC 1: get_violations_today_summary
-- Returns one row: totals + severity breakdown + yesterday total
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_violations_today_summary()
RETURNS TABLE (
  total_today     bigint,
  critical_today  bigint,
  high_today      bigint,
  medium_today    bigint,
  low_today       bigint,
  total_yesterday bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH today_window AS (
    SELECT
      public.ct_today_midnight_utc()                         AS day_start,
      public.ct_today_midnight_utc() + interval '1 day'     AS day_end
  ),
  yesterday_window AS (
    SELECT
      public.ct_yesterday_midnight_utc()                     AS day_start,
      public.ct_today_midnight_utc()                         AS day_end
  ),
  today AS (
    SELECT
      COUNT(*)                                                       AS total,
      COUNT(*) FILTER (WHERE r.severity = 'critical')                AS crit,
      COUNT(*) FILTER (WHERE r.severity = 'high')                    AS high,
      COUNT(*) FILTER (WHERE r.severity = 'medium')                  AS med,
      COUNT(*) FILTER (WHERE r.severity = 'low')                     AS low
    FROM public.kb_violations v
    JOIN public.knowledge_base_rules r ON r.rule_id = v.rule_id
    CROSS JOIN today_window tw
    WHERE v.detected_at >= tw.day_start
      AND v.detected_at <  tw.day_end
  ),
  yesterday AS (
    SELECT COUNT(*) AS total
    FROM public.kb_violations v
    CROSS JOIN yesterday_window yw
    WHERE v.detected_at >= yw.day_start
      AND v.detected_at <  yw.day_end
  )
  SELECT
    today.total, today.crit, today.high, today.med, today.low,
    yesterday.total
  FROM today, yesterday;
$$;

-- ============================================================
-- RPC 2: get_top_violated_rules_today
-- Returns top N rules by violation count since CT midnight
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_top_violated_rules_today(p_limit int DEFAULT 10)
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
    COUNT(v.id) AS violation_count
  FROM public.kb_violations v
  JOIN public.knowledge_base_rules r ON r.rule_id = v.rule_id
  WHERE v.detected_at >= public.ct_today_midnight_utc()
    AND v.detected_at <  public.ct_today_midnight_utc() + interval '1 day'
  GROUP BY r.rule_id, r.title, r.domain, r.severity
  ORDER BY violation_count DESC, r.severity ASC, r.title ASC
  LIMIT GREATEST(p_limit, 1);
$$;

-- ============================================================
-- RPC 3: get_context_ids_for_rule
-- Used by Context Inbox rule_id click-through filter
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_context_ids_for_rule(p_rule_id text)
RETURNS TABLE (context_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT context_id FROM public.kb_violations WHERE rule_id = p_rule_id;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.ct_today_midnight_utc()              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ct_yesterday_midnight_utc()          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_violations_today_summary()       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_violated_rules_today(int)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_context_ids_for_rule(text)       TO anon, authenticated, service_role;
