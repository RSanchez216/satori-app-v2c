-- Briefings v2 — foundation schema extension (Phase 2).
--
-- ALTERs only. Safe to re-run.
--
-- Existing `briefings` rows default to briefing_type='legacy' so the
-- run-scheduled-reports dispatcher continues routing them to
-- `tori-evening-briefing` with no behavior change. New `watchlist`
-- rows route to the (Phase 3) `generate-briefing` engine.

-- 1. Add v2 columns to existing briefings table
ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS briefing_type TEXT NOT NULL DEFAULT 'legacy'
    CHECK (briefing_type IN ('legacy','watchlist','alert_digest','drill_in')),
  ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Single-default constraint via expression-based partial unique index.
--    The `((1))` is the Postgres idiom for "any constant" — combined with
--    the WHERE clause, this enforces "at most one row with is_default=TRUE"
--    at the DB level. Cheaper and more atomic than a trigger.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_briefings_single_default
  ON briefings ((1)) WHERE is_default;

-- 3. Lookup index for dispatcher routing (run-scheduled-reports filters
--    by briefing_type to choose engine).
CREATE INDEX IF NOT EXISTS idx_briefings_type
  ON briefings(briefing_type);

-- 4. Realtime publication — guarded against double-apply per the
--    pattern in 20260508_enable_realtime_subscriptions.sql.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'briefings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.briefings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'briefing_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.briefing_history;
  END IF;
END $$;

-- 5. FTS index on messages.message_text — cheap insurance for Phase 6's
--    keyword scope filter on alert_digest. Generated column means the
--    tsvector populates automatically on insert/update; GIN index
--    accelerates @@ matches.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(message_text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_messages_search_tsv
  ON messages USING gin(search_tsv);

-- 6. Seed data — Samsara Morning + Samsara Evening (idempotent on name).
--    Both shipped with is_enabled=FALSE so the cron stub branch in
--    run-scheduled-reports doesn't fire generate-briefing while it's
--    still a stub. Phase 3 flips both to TRUE when the real engine ships.
--
--    `topics` and `min_severity` are populated to satisfy the legacy
--    NOT-NULL columns; the watchlist handler ignores them and reads
--    only `scope`.
INSERT INTO briefings (
  name, description, briefing_type, scope, is_enabled, is_default,
  frequency, send_time, timezone, topics, min_severity
)
VALUES
  ('Samsara — Morning',
   'Driver/unit watchlist + critical events + coaching for the past 24h.',
   'watchlist', '{"source_type":"samsara"}'::jsonb,
   FALSE, TRUE,
   'daily', '06:00', 'America/Chicago', ARRAY['all'], 'low'),
  ('Samsara — Evening',
   'End-of-day watchlist update.',
   'watchlist', '{"source_type":"samsara"}'::jsonb,
   FALSE, FALSE,
   'daily', '18:00', 'America/Chicago', ARRAY['all'], 'low')
ON CONFLICT DO NOTHING;
