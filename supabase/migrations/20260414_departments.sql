-- ─────────────────────────────────────────────────────────────
-- Departments table + source assignment
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  color         text        NOT NULL DEFAULT '#3ecfcf',
  icon          text        NOT NULL DEFAULT '📁',
  display_order int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments_all" ON departments FOR ALL USING (true) WITH CHECK (true);

-- Seed departments
INSERT INTO departments (name, color, icon, display_order) VALUES
  ('Dispatch',   '#3b82f6', '🚚', 1),
  ('Fleet',      '#10b981', '🚛', 2),
  ('Safety',     '#f59e0b', '⚠️',  3),
  ('Accounting', '#8b5cf6', '💰', 4),
  ('Claims',     '#ef4444', '📋', 5),
  ('HR',         '#ec4899', '👥', 6),
  ('General',    '#64748b', '💬', 7)
ON CONFLICT DO NOTHING;

-- Add department_id FK to sources
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS department_id uuid
    REFERENCES departments(id) ON DELETE SET NULL;

-- Seed source assignments based on name patterns
UPDATE sources SET department_id = (SELECT id FROM departments WHERE name = 'Dispatch')
  WHERE name ILIKE '%dispatch%' AND department_id IS NULL;

UPDATE sources SET department_id = (SELECT id FROM departments WHERE name = 'Fleet')
  WHERE name ILIKE '%fleet%' AND department_id IS NULL;

UPDATE sources SET department_id = (SELECT id FROM departments WHERE name = 'Safety')
  WHERE name ILIKE '%safety%' AND department_id IS NULL;

UPDATE sources SET department_id = (SELECT id FROM departments WHERE name = 'Accounting')
  WHERE (name ILIKE '%accounting%' OR name ILIKE '%tms%') AND department_id IS NULL;

UPDATE sources SET department_id = (SELECT id FROM departments WHERE name = 'Claims')
  WHERE name ILIKE '%claims%' AND department_id IS NULL;

UPDATE sources SET department_id = (SELECT id FROM departments WHERE name = 'HR')
  WHERE (name ILIKE '%hired%' OR name ILIKE '%fired%' OR name ILIKE '%leave%' OR name ILIKE '%notices%')
    AND department_id IS NULL;

UPDATE sources SET department_id = (SELECT id FROM departments WHERE name = 'General')
  WHERE name ILIKE '%manas%' AND department_id IS NULL;
