-- Add missing columns that tori-evening-briefing tries to insert
ALTER TABLE briefing_history
  ADD COLUMN IF NOT EXISTS message_full_text text,
  ADD COLUMN IF NOT EXISTS recipient_results  jsonb DEFAULT '[]';
