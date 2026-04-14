-- Samsara integration: add Samsara source record + samsara-media storage bucket

-- Insert the Samsara Telegram source (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO sources (
  name,
  type,
  external_id,
  telegram_group_name,
  is_active,
  muted,
  auto_detected,
  created_at
)
SELECT
  'Manas Express Samsara Alerts',
  'samsara',
  'samsara_manas_express',
  'Manas Express Samsara Alerts',
  true,
  false,
  false,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM sources WHERE external_id = 'samsara_manas_express'
);

-- Ensure the samsara-media storage bucket exists
-- (Run this manually in the Supabase dashboard → Storage if the SQL runner doesn't support it)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('samsara-media', 'samsara-media', false)
-- ON CONFLICT (id) DO NOTHING;
