-- Migration: tori_settings table + extend tori_activity_log allowed types
-- Run this in your Supabase SQL editor

-- ============================================================
-- TORI SETTINGS
-- ============================================================
create table if not exists tori_settings (
  id                        uuid primary key default gen_random_uuid(),
  briefing_telegram_chat_id text,
  briefing_time             text not null default '18:00',  -- 24hr, Chicago time
  briefing_enabled          boolean not null default true,
  email_briefing_enabled    boolean not null default false,
  briefing_email            text,
  updated_at                timestamptz not null default now()
);

-- Seed a default row so the function always finds one
insert into tori_settings (id)
select gen_random_uuid()
where not exists (select 1 from tori_settings);

-- updated_at trigger
create or replace trigger update_tori_settings_updated_at
  before update on tori_settings
  for each row execute function update_updated_at_column();

-- RLS
alter table tori_settings enable row level security;
drop policy if exists "Allow all" on tori_settings;
create policy "Allow all" on tori_settings for all using (true) with check (true);

-- ============================================================
-- EXTEND tori_activity_log TO SUPPORT BRIEFING EVENTS
-- Postgres auto-names check constraints as <table>_<col>_check
-- ============================================================
alter table tori_activity_log
  drop constraint if exists tori_activity_log_activity_type_check;

alter table tori_activity_log
  add constraint tori_activity_log_activity_type_check
  check (activity_type in (
    'call_outbound',
    'call_inbound',
    'telegram_sent',
    'email_sent',
    'kb_flagged',
    'synthesis',
    'alert',
    'evening_briefing',
    'evening_briefing_error'
  ));
