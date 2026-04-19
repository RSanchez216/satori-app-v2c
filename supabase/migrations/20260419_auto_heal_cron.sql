-- Migration: auto-heal-stuck-contexts cron job
-- Adds 'auto_heal' to the activity_type allowlist and schedules the
-- auto-heal-stuck-contexts edge function to run every 5 minutes.
--
-- !! BEFORE RUNNING: replace the two placeholder values below !!
--   <SUPABASE_URL>        → your project URL, e.g. https://abcxyz.supabase.co
--   <SERVICE_ROLE_KEY>    → your service_role key (Settings → API in dashboard)

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

-- ── 3. Remove existing job (idempotent) ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-heal-stuck-contexts') THEN
    PERFORM cron.unschedule('auto-heal-stuck-contexts');
  END IF;
END $$;

-- ── 4. Schedule edge function every 5 minutes ──────────────────────────────
SELECT cron.schedule(
  'auto-heal-stuck-contexts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := '<SUPABASE_URL>/functions/v1/auto-heal-stuck-contexts',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  )::text;
  $$
);
