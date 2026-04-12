-- Migration: multi-briefing architecture
-- Run in Supabase SQL editor

-- ============================================================
-- BRIEFINGS
-- ============================================================
create table if not exists briefings (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  is_enabled  boolean not null default true,
  frequency   text not null default 'daily' check (frequency in ('daily','weekly','monthly')),
  weekly_day  int,            -- 0=Sun … 6=Sat, only for weekly
  send_time   text not null default '18:00',
  timezone    text not null default 'America/Chicago',
  topics      text[] not null default '{all}',
  departments text[] not null default '{}',
  min_severity text not null default 'low' check (min_severity in ('low','medium','high','critical')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger update_briefings_updated_at
  before update on briefings
  for each row execute function update_updated_at_column();

alter table briefings enable row level security;
drop policy if exists "Allow all" on briefings;
create policy "Allow all" on briefings for all using (true) with check (true);

-- ============================================================
-- BRIEFING RECIPIENTS
-- ============================================================
create table if not exists briefing_recipients (
  id          uuid primary key default uuid_generate_v4(),
  briefing_id uuid not null references briefings(id) on delete cascade,
  channel     text not null check (channel in ('telegram','email')),
  target      text not null,   -- chat ID or email address
  label       text,            -- "Owner", "Fleet Manager", etc.
  is_active   boolean not null default true
);

create index if not exists idx_briefing_recipients_briefing_id
  on briefing_recipients(briefing_id);

alter table briefing_recipients enable row level security;
drop policy if exists "Allow all" on briefing_recipients;
create policy "Allow all" on briefing_recipients for all using (true) with check (true);

-- ============================================================
-- BRIEFING HISTORY
-- ============================================================
create table if not exists briefing_history (
  id                    uuid primary key default uuid_generate_v4(),
  briefing_id           uuid references briefings(id) on delete set null,
  sent_at               timestamptz not null default now(),
  status                text not null check (status in ('success','partial','error')),
  recipients_attempted  int not null default 0,
  recipients_succeeded  int not null default 0,
  message_preview       text,
  error_message         text
);

create index if not exists idx_briefing_history_briefing_id
  on briefing_history(briefing_id);
create index if not exists idx_briefing_history_sent_at
  on briefing_history(sent_at desc);

alter table briefing_history enable row level security;
drop policy if exists "Allow all" on briefing_history;
create policy "Allow all" on briefing_history for all using (true) with check (true);

-- ============================================================
-- SEED: migrate the existing single briefing from tori_settings
-- ============================================================
do $$
declare
  v_briefing_id uuid;
  v_chat_id     text;
begin
  -- Grab existing telegram chat ID if set
  begin
    select briefing_telegram_chat_id into v_chat_id
    from tori_settings limit 1;
  exception when undefined_table then
    v_chat_id := null;
  end;

  -- Only seed if no briefings exist yet
  if not exists (select 1 from briefings) then
    insert into briefings (name, is_enabled, frequency, send_time, topics, departments, min_severity)
    values ('Evening Operations', true, 'daily', '18:00', '{all}', '{}', 'low')
    returning id into v_briefing_id;

    if v_chat_id is not null and v_chat_id <> '' then
      insert into briefing_recipients (briefing_id, channel, target, label, is_active)
      values (v_briefing_id, 'telegram', v_chat_id, 'Operations Team', true);
    end if;
  end if;
end $$;
