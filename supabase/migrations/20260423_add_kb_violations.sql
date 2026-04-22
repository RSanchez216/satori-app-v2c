CREATE TABLE IF NOT EXISTS kb_violations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  context_id      UUID NOT NULL REFERENCES message_contexts(id) ON DELETE CASCADE,
  rule_id         TEXT NOT NULL REFERENCES knowledge_base_rules(rule_id) ON DELETE CASCADE,
  matched_signals TEXT[] DEFAULT '{}',
  rationale       TEXT,
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (context_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_violations_context_id   ON kb_violations(context_id);
CREATE INDEX IF NOT EXISTS idx_kb_violations_rule_id      ON kb_violations(rule_id);
CREATE INDEX IF NOT EXISTS idx_kb_violations_detected_at  ON kb_violations(detected_at);
