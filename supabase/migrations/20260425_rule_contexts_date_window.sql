-- Extend get_context_ids_for_rule with optional date window on detected_at.
-- Drop the original single-arg version first; PostgreSQL would otherwise keep
-- both overloads and a one-arg call would be ambiguous.
DROP FUNCTION IF EXISTS public.get_context_ids_for_rule(text);

CREATE OR REPLACE FUNCTION public.get_context_ids_for_rule(
  p_rule_id text,
  p_start   timestamptz DEFAULT NULL,
  p_end     timestamptz DEFAULT NULL
)
RETURNS TABLE (context_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT v.context_id
  FROM public.kb_violations v
  WHERE v.rule_id = p_rule_id
    AND (p_start IS NULL OR v.detected_at >= p_start)
    AND (p_end   IS NULL OR v.detected_at <  p_end);
$$;

GRANT EXECUTE ON FUNCTION public.get_context_ids_for_rule(text, timestamptz, timestamptz)
  TO anon, authenticated, service_role;
