ALTER TABLE knowledge_base_rules
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_kb_rules_domain   ON knowledge_base_rules(domain);
CREATE INDEX IF NOT EXISTS idx_kb_rules_severity ON knowledge_base_rules(severity);
CREATE INDEX IF NOT EXISTS idx_kb_rules_active   ON knowledge_base_rules(is_active) WHERE is_active = TRUE;
