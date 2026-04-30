-- Enable Supabase Realtime on the three public tables that have
-- silently-inert postgres_changes subscribers in the codebase:
--
--   public.messages              -- Samsara live-data hook (samsara-offenders)
--   public.sources               -- sidebar sources count + Sources page
--   public.knowledge_base_rules  -- Knowledge Base page
--
-- Phase 1 diagnosis showed `pg_publication_tables` was empty for
-- `supabase_realtime`, so every existing supabase.channel('postgres_changes')
-- subscription in the codebase was returning 'SUBSCRIBED' but never
-- delivering events. Adding all three here in one shot.
--
-- ALTER PUBLICATION ... ADD TABLE is not idempotent in Postgres (it
-- errors if the table is already published), so each statement is
-- guarded against double-apply via pg_publication_tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sources;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'knowledge_base_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_base_rules;
  END IF;
END $$;
