-- SATORI Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- SOURCES
-- ============================================================
create table if not exists sources (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('telegram', 'email', 'phone')),
  external_id text,
  is_active boolean not null default true,
  muted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AI TOPICS
-- ============================================================
create table if not exists ai_topics (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  keywords text[],
  department text,
  is_active boolean not null default true,
  is_suggested boolean not null default false,
  suggested_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- KNOWLEDGE BASE ENTRIES
-- ============================================================
create table if not exists knowledge_base_entries (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  situation_description text,
  trigger_keywords text[],
  trigger_topic_ids uuid[],
  expected_outcome text,
  expected_outcome_window_hours int,
  severity_if_unmet text check (severity_if_unmet in ('low', 'medium', 'high', 'critical')),
  department text,
  is_active boolean not null default true,
  example_situation text,
  triggered_count int not null default 0,
  met_count int not null default 0,
  violated_count int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- MESSAGE CONTEXTS
-- ============================================================
create table if not exists message_contexts (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid references sources(id) on delete set null,
  telegram_chat_id text,
  context_key text,
  started_at timestamptz,
  ended_at timestamptz,
  message_count int not null default 0,
  primary_sender text,
  context_text text,
  context_preview text,
  build_status text not null default 'building' check (build_status in ('building', 'ready', 'failed')),
  ai_status text not null default 'pending' check (ai_status in ('pending', 'processing', 'done', 'failed')),
  summary text,
  department text,
  severity text check (severity in ('low', 'medium', 'high', 'critical')),
  topic_id uuid references ai_topics(id) on delete set null,
  topic_name text,
  confidence numeric(5,2),
  needs_review boolean not null default false,
  alert_worthy boolean not null default false,
  recommended_action text,
  rationale text,
  entities_json jsonb,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- MESSAGES
-- ============================================================
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid references sources(id) on delete set null,
  sender_name text,
  message_text text,
  message_ts timestamptz,
  telegram_chat_id text,
  telegram_message_id text,
  language_code text,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  unread boolean not null default true,
  ai_status text not null default 'pending' check (ai_status in ('pending', 'processing', 'done', 'failed')),
  topic_id uuid references ai_topics(id) on delete set null,
  topic_confidence numeric(5,2),
  context_id uuid references message_contexts(id) on delete set null,
  context_processed_at timestamptz
);

-- ============================================================
-- TOPIC THREADS (SITUATIONS)
-- ============================================================
create table if not exists topic_threads (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid references sources(id) on delete set null,
  topic_id uuid references ai_topics(id) on delete set null,
  title text not null,
  thread_date date,
  status text not null default 'open' check (status in ('open', 'resolved', 'escalated', 'unresolved')),
  started_at timestamptz,
  resolved_at timestamptz,
  resolution_summary text,
  context_ids uuid[],
  message_count int not null default 0,
  severity_peak text check (severity_peak in ('low', 'medium', 'high', 'critical')),
  department text,
  knowledge_base_entry_id uuid references knowledge_base_entries(id) on delete set null,
  kb_outcome_met boolean,
  kb_flagged boolean not null default false,
  synthesis_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ALERTS
-- ============================================================
create table if not exists alerts (
  id uuid primary key default uuid_generate_v4(),
  context_id uuid references message_contexts(id) on delete set null,
  thread_id uuid references topic_threads(id) on delete set null,
  source_id uuid references sources(id) on delete set null,
  topic_id uuid references ai_topics(id) on delete set null,
  kb_entry_id uuid references knowledge_base_entries(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  department text,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  is_kb_violation boolean not null default false,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

-- ============================================================
-- TORI ACTIVITY LOG
-- ============================================================
create table if not exists tori_activity_log (
  id uuid primary key default uuid_generate_v4(),
  activity_type text not null check (activity_type in ('call_outbound', 'call_inbound', 'telegram_sent', 'email_sent', 'kb_flagged', 'synthesis', 'alert')),
  title text not null,
  description text,
  target_user text,
  status text,
  context_id uuid references message_contexts(id) on delete set null,
  thread_id uuid references topic_threads(id) on delete set null,
  alert_id uuid references alerts(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- REPORTS
-- ============================================================
create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('daily', 'weekly', 'monthly', 'custom')),
  title text not null,
  date_from date,
  date_to date,
  content_json jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- REPORT DELIVERIES
-- ============================================================
create table if not exists report_deliveries (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid references reports(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'email', 'voice')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_messages_source_id on messages(source_id);
create index if not exists idx_messages_context_id on messages(context_id);
create index if not exists idx_messages_message_ts on messages(message_ts desc);
create index if not exists idx_message_contexts_source_id on message_contexts(source_id);
create index if not exists idx_message_contexts_ai_status on message_contexts(ai_status);
create index if not exists idx_message_contexts_created_at on message_contexts(created_at desc);
create index if not exists idx_topic_threads_status on topic_threads(status);
create index if not exists idx_topic_threads_created_at on topic_threads(created_at desc);
create index if not exists idx_alerts_severity on alerts(severity);
create index if not exists idx_alerts_status on alerts(status);
create index if not exists idx_alerts_created_at on alerts(created_at desc);
create index if not exists idx_tori_activity_log_created_at on tori_activity_log(created_at desc);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger update_ai_topics_updated_at
  before update on ai_topics
  for each row execute function update_updated_at_column();

create or replace trigger update_knowledge_base_entries_updated_at
  before update on knowledge_base_entries
  for each row execute function update_updated_at_column();

create or replace trigger update_message_contexts_updated_at
  before update on message_contexts
  for each row execute function update_updated_at_column();

create or replace trigger update_topic_threads_updated_at
  before update on topic_threads
  for each row execute function update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (enable but allow all for now)
-- ============================================================
alter table sources enable row level security;
alter table messages enable row level security;
alter table message_contexts enable row level security;
alter table topic_threads enable row level security;
alter table ai_topics enable row level security;
alter table knowledge_base_entries enable row level security;
alter table alerts enable row level security;
alter table tori_activity_log enable row level security;
alter table reports enable row level security;
alter table report_deliveries enable row level security;

-- Permissive policies for development (lock down in production)
-- Drop first so this script is safe to re-run
drop policy if exists "Allow all" on sources;
drop policy if exists "Allow all" on messages;
drop policy if exists "Allow all" on message_contexts;
drop policy if exists "Allow all" on topic_threads;
drop policy if exists "Allow all" on ai_topics;
drop policy if exists "Allow all" on knowledge_base_entries;
drop policy if exists "Allow all" on alerts;
drop policy if exists "Allow all" on tori_activity_log;
drop policy if exists "Allow all" on reports;
drop policy if exists "Allow all" on report_deliveries;

create policy "Allow all" on sources for all using (true) with check (true);
create policy "Allow all" on messages for all using (true) with check (true);
create policy "Allow all" on message_contexts for all using (true) with check (true);
create policy "Allow all" on topic_threads for all using (true) with check (true);
create policy "Allow all" on ai_topics for all using (true) with check (true);
create policy "Allow all" on knowledge_base_entries for all using (true) with check (true);
create policy "Allow all" on alerts for all using (true) with check (true);
create policy "Allow all" on tori_activity_log for all using (true) with check (true);
create policy "Allow all" on reports for all using (true) with check (true);
create policy "Allow all" on report_deliveries for all using (true) with check (true);
