-- Migration: auto-heal-stuck-contexts cron job
-- Adds 'auto_heal' to the activity_type allowlist and schedules the
-- auto-heal-stuck-contexts edge function to run every 5 minutes.
--
-- Prerequisites (run once in SQL editor or set via Supabase dashboard):
--   ALTER DATABASE postgres SET app.supabase_url     = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';

-- ── 1. Extend tori_activity_log activity types ─────────────────────────────
ALTER TABLE tori_activity_log
  DROP CONSTRAINT IF EXISTS tori_activity_log_activity_type_check;

ALTER TABLE tori_activity_log
  ADD CONSTRAINT tori_activity_log_activity_type_check
  CHECK (activity_type IN (
    'call_outbound',
    'call_inbound',
    'telegram_sent',
    'email_sent',
    'kb_flagged',
    'synthesis',
    'alert',
    'evening_briefing',
    'evening_briefing_error',
    'auto_heal'
  ));

-- ── 2. Enable required extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 3. Schedule edge function every 5 minutes ──────────────────────────────
-- Remove any existing job with this name first to make migration idempotent.
SELECT cron.unschedule('auto-heal-stuck-contexts')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-heal-stuck-contexts'
);

SELECT cron.schedule(
  'auto-heal-stuck-contexts',   -- job name
  '*/5 * * * *',                -- every 5 minutes
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/auto-heal-stuck-contexts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )::text;
  $$
);
