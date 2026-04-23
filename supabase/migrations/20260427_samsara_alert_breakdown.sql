-- ============================================================
-- Samsara alert breakdown by type + urgency tier, within a window.
-- Uses message-text pattern matching against the Manas Express
-- Samsara Alerts source. No schema changes required.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_samsara_alert_breakdown(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE (
  alert_type text,       -- stable key, e.g. 'crash', 'speeding'
  tier       text,       -- 'critical' | 'high' | 'operational' | 'info'
  count      bigint,
  last_at    timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH samsara_msgs AS (
    SELECT m.message_text, m.created_at
    FROM public.messages m
    JOIN public.sources s ON s.id = m.source_id
    WHERE s.name = 'Manas Express Samsara Alerts'
      AND m.created_at >= p_start
      AND m.created_at <  p_end
      AND m.message_text IS NOT NULL
  ),
  classified AS (
    SELECT
      CASE
        -- critical tier
        WHEN message_text ILIKE '%crash%'
          OR message_text ILIKE '%collision%'
          OR message_text ILIKE '%impact%'             THEN 'crash'
        WHEN message_text ILIKE '%distract%'
          OR message_text ILIKE '%inattent%'           THEN 'distraction'
        -- high tier
        WHEN message_text ILIKE '%vehicle alert%'
          AND (message_text ILIKE '%spn %'
               OR message_text ILIKE '%fmi %'
               OR message_text ILIKE '%fault:%')       THEN 'vehicle_fault'
        WHEN (message_text ILIKE '%speed%alert%'
              OR message_text ILIKE '%speed%exceed%'
              OR message_text ILIKE '%speed%mph%'
              OR message_text ILIKE '%speed%posted%')  THEN 'speeding'
        WHEN message_text ILIKE '%harsh%'
          AND (message_text ILIKE '%brak%'
               OR message_text ILIKE '%accel%')        THEN 'harsh_brake'
        WHEN message_text ILIKE '%def level%'
          OR message_text ILIKE '%diesel exhaust fluid%' THEN 'def_system'
        -- operational tier
        WHEN message_text ILIKE '%engine idle alert%'  THEN 'idle'
        WHEN message_text ILIKE '%fuel low%'
          OR message_text ILIKE '%low fuel%'           THEN 'fuel_low'
        -- info tier
        WHEN message_text ILIKE '%daily safety digest%' THEN 'daily_digest'
        ELSE 'other'
      END AS alert_type,
      created_at
    FROM samsara_msgs
  )
  SELECT
    alert_type,
    CASE alert_type
      WHEN 'crash'         THEN 'critical'
      WHEN 'distraction'   THEN 'critical'
      WHEN 'vehicle_fault' THEN 'high'
      WHEN 'speeding'      THEN 'high'
      WHEN 'harsh_brake'   THEN 'high'
      WHEN 'def_system'    THEN 'high'
      WHEN 'idle'          THEN 'operational'
      WHEN 'fuel_low'      THEN 'operational'
      WHEN 'daily_digest'  THEN 'info'
      ELSE                      'info'
    END AS tier,
    COUNT(*)        AS count,
    MAX(created_at) AS last_at
  FROM classified
  WHERE alert_type <> 'other'
  GROUP BY alert_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_samsara_alert_breakdown(timestamptz, timestamptz)
  TO anon, authenticated, service_role;
