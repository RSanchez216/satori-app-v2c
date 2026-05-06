-- Phase 3: enable the Samsara watchlist seeds.
--
-- The Phase 2 migration shipped `Samsara — Morning` and `Samsara — Evening`
-- with is_enabled=FALSE so the dispatcher's stub branch wouldn't fire while
-- generate-briefing was still a stub. Phase 3 deploys the real engine, so
-- we flip them on. Idempotent.

UPDATE public.briefings
   SET is_enabled = TRUE
 WHERE briefing_type = 'watchlist'
   AND name IN ('Samsara — Morning', 'Samsara — Evening')
   AND is_enabled IS NOT TRUE;
