# Briefings v2 — Discovery Report

**Generated:** 2026-04-29 (CT)
**Phase:** 1 of 8 (READ-ONLY)
**Status:** Discovery complete · 4 prompt-level assumptions need
revision before Phase 2 design lands

---

## Summary

| Component | Status | Notes |
|---|---|---|
| Current Tori Briefing | **Found** — and already a multi-briefing system | `/briefing` (singular). [briefing-client.tsx](app/(main)/briefing/briefing-client.tsx) is 1,654 lines, full CRUD + history UI. Reads `briefings` + `briefing_recipients` + `briefing_history`. **No `generated_summaries` table.** |
| Samsara watchlist libs | **Ready** | All 6 modules + `pluralize` confirmed; no wrapper needed. |
| Watchlist RPCs | **Ready** | All accept server-side `p_limit` + `p_offset`. No blocker. |
| Reports config pattern | **Doesn't exist** | `app/(main)/reports/page.tsx` is a static link list — only entry is `/reports/samsara-offenders`. **No `reports`/`report_rules`/`report_recipients` tables, no `Run_Report_Now_Function.ts` / `Run_Schedule_Reports_Function.ts` / `Reports_Generate_Function.ts` edge functions.** The pattern to mirror is the **existing Briefings system itself**. |
| Telegram send | **Reusable** | `sendTelegram(chatId, text)` + `sendVoice(chatId, audio)` + `textToSpeech(text)` already in `tori-evening-briefing/index.ts`. |
| Email send | **Reusable** | `sendEmail(to, subject, html)` via Resend + `buildEmailHtml()` template in `tori-evening-briefing/index.ts`. |
| Telegram chat picker source | **Not built — needs UI** | Recipient input is a free-text `chat_id` field. The data exists in `sources` (type='telegram', `telegram_group_id` bigint). Phase 2 can wire a dropdown if desired. |
| `generate-summary` deprecation | **N/A** | Doesn't exist in v2-c. The current AI summary engine is `tori-evening-briefing` calling Anthropic Haiku directly. **Lovable AI gateway is not in use.** |
| pg_cron | **Enabled + 2 jobs running** | `run-scheduled-reports` (every minute) and `auto-heal-stuck-contexts` (every 5 min). Auth pattern documented. |
| Dashboard tile slot | **Identified** | Mid-row 3-col grid (Operations Health · Samsara Alerts · Brain Status) — natural slot for a 4th tile, or a 6th StatCard at the top. Already on `useLiveData` + `LiveDot`. |
| Schema conflicts | **`briefings` + `briefing_recipients` + `briefing_history` already exist** | `briefing_history` has been extended (`message_full_text`, `recipient_results`, `voice_sent`). `briefing_runs` doesn't exist; closest analogue is `briefing_history`. Phase 2 needs an **alter, not create** strategy. |
| Realtime publication pattern | **Documented** | Idempotent DO block in `20260508_enable_realtime_subscriptions.sql`. |
| Routes `/briefings`, `/briefings/[id]` | **Plural is clear, singular `/briefing` is taken** | The existing route is at `/briefing`. Phase 2 decision: rename or coexist. |
| Forward-looking (Task 11) | **Several gaps surfaced** | `messages.topic_id` exists but 0% filled; no `tsvector` index; no entity-extraction columns on messages; no alias tables. Detail in §11. |

---

## Task 1 — Current Tori Briefing surface

**Route:** `/briefing` (singular).

**Files:**
- Server page: [`app/(main)/briefing/page.tsx`](app/(main)/briefing/page.tsx) (29 lines).
  Reads `briefings` + nested `briefing_recipients`, plus `briefing_history` (last 50 rows). Both tables go straight to client as initial props.
- Client: [`app/(main)/briefing/briefing-client.tsx`](app/(main)/briefing/briefing-client.tsx) (**1,654 lines**) — already a full CRUD UI for a multi-briefing world. Major sub-components:
  - `StatsBar` (line 580) — totals across briefings / sends today / etc.
  - `MorningBriefingSetupCard` (line 616) — one-click seed if a "Morning Briefing" doesn't exist.
  - `BriefingCard` (line 666) — per-row card with toggle, send-now, edit, delete, copy.
  - `BriefingModal` (line 963) — new/edit form. Fields: name, description, frequency (daily/weekly/monthly), weekly_day, send_time (Chicago CT), topics (multi-select chip set), min_severity, recipients (telegram chat_id or email + label).
  - `HistorySection` (line 1207) — paginated send log.
  - `FullPreviewModal` (line 400), `SendConfirmPopover` (line 484), `StatusTooltip` (line 296), `RecipientIcons` (line 360).
- API routes — full REST surface already exists:
  - `GET/POST /api/tori/briefings` ([route.ts](app/api/tori/briefings/route.ts))
  - `GET/PUT/DELETE /api/tori/briefings/[id]` ([route.ts](app/api/tori/briefings/[id]/route.ts))
  - `GET/POST /api/tori/briefings/[id]/recipients` ([route.ts](app/api/tori/briefings/[id]/recipients/route.ts))
  - `DELETE /api/tori/briefings/[id]/recipients/[recipientId]` ([route.ts](app/api/tori/briefings/[id]/recipients/[recipientId]/route.ts))
  - `POST /api/tori/briefings/[id]/send` ([route.ts](app/api/tori/briefings/[id]/send/route.ts))
  - Legacy: `app/api/tori/send-briefing/route.ts` and `app/api/tori/send-morning-briefing/route.ts`.

**Data source:** `briefings` + `briefing_recipients` + `briefing_history` only. **No `generated_summaries` table exists** — that table was never built in v2-c.

**Live data:** **NOT** wired — the page uses local `useState` with manual `reloadHistory()` on send. No `useLiveData`, no Realtime subscription. (Phase 2 candidate.)

---

## Task 2 — Samsara Watchlist building blocks

| Module | Path | Key exports | Status |
|---|---|---|---|
| J1939 codes | [`lib/samsara/j1939-codes.ts`](lib/samsara/j1939-codes.ts) | `lookupFault`, `FaultSeverity`, `SEVERITY_DOT_CLASS`, `SEVERITY_ORDER`, `severityCssVar`, `parseFaultPair` | Ready |
| Behavior severity | [`lib/samsara/behavior-severity.ts`](lib/samsara/behavior-severity.ts) | `BEHAVIOR_SEVERITY`, `BEHAVIOR_LABEL`, `lookupBehavior` | Ready |
| Live-data hook | [`lib/hooks/use-live-data.ts`](lib/hooks/use-live-data.ts) | `useLiveData<T>`, `RealtimeStatus` | Ready |
| Relative time | [`components/ui/relative-time.tsx`](components/ui/relative-time.tsx) | `RelativeTime` | Ready |
| Live dot | [`components/ui/live-dot.tsx`](components/ui/live-dot.tsx) | `LiveDot` | Ready |
| Pluralize | [`lib/utils.ts`](lib/utils.ts) | `pluralize` | Ready |

**Watchlist RPCs** (callers in [`app/(main)/reports/samsara-offenders/page.tsx`](app/(main)/reports/samsara-offenders/page.tsx)):

| RPC | Signature | Defined in |
|---|---|---|
| `get_samsara_overview` | `(p_start tz, p_end tz)` returns single row | [20260427](supabase/migrations/20260427_samsara_alert_breakdown.sql) |
| `get_samsara_driver_offenders` | `(p_start, p_end, p_limit int default 25, p_offset int default 0)` | [20260505](supabase/migrations/20260505_samsara_polish.sql) |
| `get_samsara_unit_offenders` | `(p_start, p_end, p_limit, p_offset)` returns **with `top_issues jsonb`** | [20260507](supabase/migrations/20260507_samsara_filter_zero_fault_units.sql) (latest authoritative) |
| `get_samsara_critical_events` | `(p_start, p_end, p_limit int default 50)` | [20260505](supabase/migrations/20260505_samsara_polish.sql) |
| `get_samsara_alert_breakdown` | `(p_start, p_end)` | [20260427](supabase/migrations/20260427_samsara_alert_breakdown.sql) |
| `get_samsara_unmapped_events` | `(p_start, p_end, p_limit)` | (Samsara migration set) |
| `count_samsara_driver_offenders` / `count_samsara_unit_offenders` | `(p_start, p_end)` | [20260505](supabase/migrations/20260505_samsara_polish.sql) / [20260507](supabase/migrations/20260507_samsara_filter_zero_fault_units.sql) |

**Server-side `p_limit` is on every offender RPC.** No client-side-only paging — Phase 3 can call these directly with a `limit` constant for the briefing render. **No blocker.**

**Resolved/unresolved logic** lives **server-side** in `resolve_driver_for_message(message_text, created_at)` (lateral join) and propagates as `is_resolved` boolean + `driver_name` (null when unresolved). Defined in [20260501_samsara_rpcs_with_resolution.sql](supabase/migrations/20260501_samsara_rpcs_with_resolution.sql) and consumed by every `get_samsara_*_offenders` RPC. Client trusts the boolean; no client-side resolution.

---

## Task 3 — Reports config pattern

**Critical finding:** the "Reports config pattern" the prompt assumes does not exist in this v2-c repo.

- [`app/(main)/reports/page.tsx`](app/(main)/reports/page.tsx) is a 96-line static link list. Only entry: `/reports/samsara-offenders`. There is no create/edit modal, no "schedule a report" flow, no recipient picker, no `Run_Report_Now_Function.ts` / `Run_Schedule_Reports_Function.ts` / `Reports_Generate_Function.ts` edge functions, and no `reports` / `report_rules` / `report_recipients` tables.
- Edge functions present: `auto-heal-stuck-contexts`, `run-scheduled-reports` (despite the name, this is the **briefings** dispatcher — see Task 6), `tori-evening-briefing`. Nothing else.

**The pattern to mirror IS the existing Briefings system itself.** It already has:
- Tables: `briefings`, `briefing_recipients`, `briefing_history`
- Modal: `BriefingModal` in [briefing-client.tsx:963](app/(main)/briefing/briefing-client.tsx#L963) — fields, validation, recipient picker
- Run-now handler: `POST /api/tori/briefings/[id]/send`
- Schedule handler: `run-scheduled-reports` edge function (every-minute cron, dispatches `tori-evening-briefing` per matching briefing)
- pg_cron setup: idempotent unschedule + reschedule pattern in [20260419_auto_heal_cron.sql:33-51](supabase/migrations/20260419_auto_heal_cron.sql#L33-L51)

**Schemas (existing):**

```sql
briefings (
  id uuid PK, name text, description text, is_enabled bool,
  frequency text CHECK IN ('daily','weekly','monthly'), weekly_day int,
  send_time text /* HH:MM */, timezone text DEFAULT 'America/Chicago',
  topics text[] DEFAULT '{all}', departments text[] DEFAULT '{}',
  min_severity text CHECK IN ('low','medium','high','critical'),
  created_at, updated_at
)

briefing_recipients (
  id uuid PK, briefing_id uuid FK, channel text CHECK IN ('telegram','email'),
  target text /* chat_id or email */, label text, is_active bool
)

briefing_history (
  id uuid PK, briefing_id uuid FK, sent_at, status text CHECK IN ('success','partial','error'),
  recipients_attempted int, recipients_succeeded int,
  message_preview text, error_message text,
  message_full_text text,        -- added in 20260415
  recipient_results jsonb,       -- added in 20260415
  voice_sent bool                -- added later (live in DB; no migration file)
)
```

**Modal field list** (current — for v1 watchlist briefing, Phase 2 will add `briefing_type` + `scope` jsonb):

| Field | Type | Validation |
|---|---|---|
| name | text | required, trim |
| description | text | optional |
| frequency | enum | one of daily / weekly / monthly |
| weekly_day | int 0-6 | only when frequency=weekly |
| send_time | HH:MM | always |
| topics | text[] | multi-select chip set, defaults to `['all']` |
| min_severity | enum | one of low / medium / high / critical |
| recipients | array | each: channel + target + label, target is free-text |

**pg_cron pattern** (every minute, reads enabled briefings, matches local-tz `send_time`, fires `tori-evening-briefing` per match): see [run-scheduled-reports/index.ts](supabase/functions/run-scheduled-reports/index.ts).

**UI patterns worth reusing verbatim:** `BriefingCard`, `StatsBar`, `HistorySection`, `BriefingModal`, `FullPreviewModal`, `SendConfirmPopover`, `RecipientIcons`. The status pill colors (`success/partial/error`) are at [briefing-client.tsx:46-50](app/(main)/briefing/briefing-client.tsx#L46-L50).

---

## Task 4 — Push delivery infra

| Capability | Function | Path | Notes |
|---|---|---|---|
| Telegram text | `sendTelegram(chatId, text)` | [tori-evening-briefing/index.ts:299-312](supabase/functions/tori-evening-briefing/index.ts#L299-L312) | Truncates to 4000 chars; returns `{ok, error?}` |
| Telegram voice | `sendVoice(chatId, audio)` | [tori-evening-briefing/index.ts:280-295](supabase/functions/tori-evening-briefing/index.ts#L280-L295) | Multipart `sendVoice` with mp3 blob |
| Voice TTS | `textToSpeech(text)` | [tori-evening-briefing/index.ts:253-278](supabase/functions/tori-evening-briefing/index.ts#L253-L278) | OpenAI tts-1 / 'nova' voice / mp3 / 4096-char cap |
| Email | `sendEmail(to, subject, html)` | [tori-evening-briefing/index.ts:314-328](supabase/functions/tori-evening-briefing/index.ts#L314-L328) | Resend; `from: Tori <REPORTS_FROM_EMAIL>` |
| Email HTML template | `buildEmailHtml(message, briefingName, dateLabel)` | [tori-evening-briefing/index.ts:139-230](supabase/functions/tori-evening-briefing/index.ts#L139-L230) | Dark header / white card / dark footer; `<!DOCTYPE html>` ready |

**All four are in the same edge function.** Phase 2 should extract them to a shared deno module (e.g. `supabase/functions/_shared/delivery.ts`) so the new briefing handlers don't duplicate. Currently no such `_shared/` exists.

**Env vars** (used by `tori-evening-briefing`):
- `ANTHROPIC_API_KEY` (required)
- `TELEGRAM_BOT_TOKEN` (required)
- `RESEND_API_KEY` (optional — sendEmail returns error if missing)
- `REPORTS_FROM_EMAIL` (optional, default `info@satoriknows.com`)
- `OPEN_AI_API_KEY` (optional — TTS skipped if missing) [note the underscore in `OPEN_AI`]
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (always)

**Telegram chat picker source — gap.** The current modal recipient input is a free-text field for `chat_id` (or email). There is no dropdown of "connected Telegram chats". Data is available in `sources`:
- Schema: `sources(id, name, type, telegram_group_name, telegram_group_id bigint, telegram_chat_id?, department_id, is_active, muted, …)`
- Sample distinct `type` values: `telegram`, `samsara`
- Sample names: `ACCOUNTING DEPARTMENT`, `DISPATCH TEAM`, `FLEET DEPARTMENT`, `Manas Express Samsara Alerts`, `MANAS EXPRESS TEAM`, etc.
- Phase 2 could expose a `<select>` filtered by `type='telegram' AND is_active`.

**Voice TTS status:** ✓ in production. Live integration at [tori-evening-briefing/index.ts:472-488](supabase/functions/tori-evening-briefing/index.ts#L472-L488) — sends voice after text to Telegram recipients with `send_voice !== false`. Records `voice_sent` boolean to `briefing_history`. (The user's memory note saying "in progress" is stale.)

---

## Task 5 — Existing `generate-summary` engine

**Not present in v2-c.**
- `grep -rE "generate-summary|generated_summaries|invoke.*generate-summary"` over `app/`, `lib/`, `supabase/`, `docs/` — **0 hits**.
- No `generated_summaries` table in any migration.
- No `Generate_Summary_Function.ts` edge function.

**Current AI summary engine in v2-c is `tori-evening-briefing`**, which calls Anthropic Haiku directly:
- API: `POST https://api.anthropic.com/v1/messages`
- Model: `claude-haiku-4-5-20251001` ([tori-evening-briefing/index.ts:431, 567](supabase/functions/tori-evening-briefing/index.ts#L431))
- Auth: `x-api-key: ANTHROPIC_API_KEY` header

**Lovable AI gateway is not in use.** No `LOVABLE_API_KEY` env var referenced anywhere in `app/`, `lib/`, `supabase/`. The prompt's assumption (and the project memory note implying Lovable) is **incorrect for v2-c** — that may have been v1 / v2-a/b.

**Deprecation:** **N/A — nothing to deprecate.**

---

## Task 6 — pg_cron status

- **Extension enabled:** `CREATE EXTENSION IF NOT EXISTS pg_cron;` and `pg_net;` in [20260419_auto_heal_cron.sql:29-30](supabase/migrations/20260419_auto_heal_cron.sql#L29-L30).
- **Active jobs** (queried `cron.job` directly):

| Job name | Schedule | Active |
|---|---|---|
| `run-scheduled-reports` | `* * * * *` (every minute) | ✓ |
| `auto-heal-stuck-contexts` | `*/5 * * * *` | ✓ |

- **Auth pattern** (cron-triggered HTTP calls):
  ```sql
  net.http_post(
    url     := '<SUPABASE_URL>/functions/v1/<fn-name>',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  )
  ```
  Idempotent unschedule via `cron.job` lookup before `cron.schedule` (template at [20260419_auto_heal_cron.sql:33-51](supabase/migrations/20260419_auto_heal_cron.sql#L33-L51)).

---

## Task 7 — Dashboard tile slot

- Files:
  - Server: [`app/(main)/dashboard/page.tsx`](app/(main)/dashboard/page.tsx) — combines ~13 queries into `DashboardClient` props.
  - Client: [`app/(main)/dashboard/dashboard-client.tsx`](app/(main)/dashboard/dashboard-client.tsx) (1,266 lines).
- Tile component pattern: `<StatCard label value icon glowColor subtext liveStatus />` ([dashboard-client.tsx:53-105](app/(main)/dashboard/dashboard-client.tsx#L53-L105)).
- Layout (top → bottom):
  1. **5-col stat-card row** ([line 845-879](app/(main)/dashboard/dashboard-client.tsx#L845-L879)) — Open Situations, Resolved Today, Health Score, KB Violations, ViolationsCard.
  2. **3-col mid grid** ([line 882-944](app/(main)/dashboard/dashboard-client.tsx#L882-L944)) — Operations Health (HealthRing), Samsara Alerts, Brain Status.
  3. Top Violated Rules.
  4. 2-col main grid: Open Situations list + (Recent Alerts, Tori Activity).
- **`useLiveData` ✓ integrated** (one hook at top of `DashboardClient`, subscribes to `messages` insert).
- **`LiveDot` ✓ integrated** in every tile header.

**Suggested slot for "Today's briefing" tile in Phase 5:** the 3-col mid grid is the natural home — visually balanced (10 ops + 5 samsara + brain → 4-tile grid feels tight; better to bump to 4-col or move Brain Status). Alternative: insert as a 6th StatCard at the top (5-col → 6-col responsive). Either works.

---

## Task 8 — Schema impact

**Conflicts detected:**

| Table | Status | Notes |
|---|---|---|
| `briefings` | ✗ collision | Created in [20260412_briefings_multi.sql:7](supabase/migrations/20260412_briefings_multi.sql#L7) |
| `briefing_recipients` | ✗ collision | Created in [20260412_briefings_multi.sql:34](supabase/migrations/20260412_briefings_multi.sql#L34) |
| `briefing_runs` | ✓ free | Closest is `briefing_history` |
| `briefing_history` | ✗ collision (informational; not in prompt) | Created in [20260412_briefings_multi.sql:53](supabase/migrations/20260412_briefings_multi.sql#L53), extended in [20260415](supabase/migrations/20260415_briefing_history_columns.sql) |

**Phase 2 implication: `ALTER TABLE`, not `CREATE TABLE`.** The existing tables are in production with live data (the live `briefings` row count > 0 — there's at least an "Evening Operations" seed plus whatever Rebeca has added). Phase 2 needs to:
- ALTER `briefings` to add `briefing_type text CHECK IN ('watchlist','alert_digest','drill_in')` (default `'alert_digest'` to map existing rows to v1 behavior)
- ALTER `briefings` to add `scope jsonb DEFAULT '{}'` for archetype-specific config
- Either rename `briefing_history` → `briefing_runs`, or keep `briefing_history` and skip the rename (recommend the latter for stability)

**Suggested migration filename for Phase 2:** `supabase/migrations/20260509_briefings_v2_schema.sql` (highest existing is `20260508`).

---

## Task 9 — Realtime publication

- File: [`supabase/migrations/20260508_enable_realtime_subscriptions.sql`](supabase/migrations/20260508_enable_realtime_subscriptions.sql)
- Reusable template for Phase 2 (add `briefings` and `briefing_history` so the briefings page can move to `useLiveData`):

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'briefings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.briefings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'briefing_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.briefing_history;
  END IF;
END $$;
```

---

## Task 10 — Routing

Current top-level routes under `app/(main)/`:

| Path | File |
|---|---|
| `/dashboard` | [dashboard/page.tsx](app/(main)/dashboard/page.tsx) |
| `/inbox` | [inbox/page.tsx](app/(main)/inbox/page.tsx) |
| `/situations` | [situations/page.tsx](app/(main)/situations/page.tsx) |
| `/alerts` | [alerts/page.tsx](app/(main)/alerts/page.tsx) |
| `/topics` | [topics/page.tsx](app/(main)/topics/page.tsx) |
| `/sources` | [sources/page.tsx](app/(main)/sources/page.tsx) |
| `/knowledge-base` | [knowledge-base/page.tsx](app/(main)/knowledge-base/page.tsx) |
| **`/briefing`** (singular) | [briefing/page.tsx](app/(main)/briefing/page.tsx) |
| `/reports` | [reports/page.tsx](app/(main)/reports/page.tsx) |
| `/reports/samsara-offenders` | [reports/samsara-offenders/page.tsx](app/(main)/reports/samsara-offenders/page.tsx) |

- **`/briefings` (plural) is clear.**
- **`/briefings/[id]` is clear.**
- **`/briefing` (singular) is taken** by the existing CRUD page.

Phase 2 has two options:
- (a) Rename existing `/briefing` → `/briefings` and add a redirect; new detail at `/briefings/[id]`. Cleaner long-term, but requires sidebar nav update + any direct links.
- (b) Build the new system at `/briefings` and `/briefings/[id]`; deprecate `/briefing` later (route may render the same component temporarily).

---

## Task 11 — Forward-looking data shape

### For `alert_digest` (Phase 6)

#### Departments
- Column `department text` exists on `ai_topics`, `alerts`, `knowledge_base_entries`, `message_contexts`, `topic_threads` (verified via `information_schema.columns`).
- Distinct values populated in alerts/contexts: `Accounting, Compliance, Dispatch, Fleet, HR, Maintenance, Safety` (7 departments — note `Customer` and `Other` from the classifier are not yet observed in real data).
- A normalized `departments` table also exists: `(id uuid, name text, color text, icon text, display_order int)` — and `sources.department_id uuid` references it. **Sources have a department FK; messages/alerts use the text column.** Phase 6 design needs to pick a side or accept the duality.
- **Design holds.** Composable scope `departments text[]` on briefings → `IN` filter on alerts/contexts works.

#### Severities
- 4 values defined in [`app/api/ai/classify/route.ts:13`](app/api/ai/classify/route.ts#L13): `low | medium | high | critical`.
- Observed in `alerts.severity`: `critical, high, medium`. Observed in `message_contexts.severity`: `critical, high, low, medium`.
- **Design holds.**

#### Topics
- `ai_topics(id, name, description, keywords text[], department, is_active, is_suggested, suggested_reason, …)` — schema exists.
- `messages.topic_id uuid` exists.
- **`messages.topic_id` is 0% filled** — topic generation is not active in current data. The existing UI even has a "Topic generation not yet active" tooltip on the Brain Status tile.
- **Gap for Phase 6:** topic-based scope filter would currently match nothing. Either Phase 6 ships topic generation (out of scope per stated boundaries) or the topic chip in the briefing UI sits dormant until that lands.

#### Sources
- `sources(id, name, type, external_id, telegram_group_name, telegram_group_id, telegram_chat_id?, department_id, is_active, muted, auto_detected, …)` — verified.
- No category column — but `type` distinguishes (`telegram` vs `samsara`). For finer-grained grouping ("dispatch group" vs "broker chat"), the existing `department_id` is already the right axis. **No new table needed.**

#### Full-text search
- **No `tsvector` index on `messages.message_text`.** Verified by `pg_indexes` filter.
- Phase 6 implication: a keyword scope filter on a 1,871-row table works fine with `ILIKE` today, but won't scale. Phase 6 migration should add:
  ```sql
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(message_text, ''))) STORED;
  CREATE INDEX IF NOT EXISTS idx_messages_search_tsv ON messages USING gin(search_tsv);
  ```

#### Recommended Actions trigger data
- **Newly-terminated drivers:** the existing `tori-evening-briefing` does **not** have terminated-driver regex. Termination keywords appear in [`20260421_seed_knowledge_base_rules.sql`](supabase/migrations/20260421_seed_knowledge_base_rules.sql) as KB rule keyword arrays — the trigger would be "new `kb_violations` row tagged with the termination rule", not a regex. Workable signal.
- **Stale critical >24h:** `alerts` has `severity` + `created_at` + `status` ✓. Easy query: `WHERE severity='critical' AND status='open' AND created_at < now() - interval '24 hours'`.
- **Unclassified messages:** `messages.topic_id IS NULL` is the right column, but **currently 100% match** because topic generation isn't running (see above). Until topic generation is active, this trigger is meaningless.

### For `drill_in` (Phase 8)

#### Entity extraction
- `messages` columns: only `id, source_id, sender_name, message_text, message_ts, telegram_chat_id, telegram_message_id, language_code, created_at, status, unread, ai_status, topic_id, topic_confidence, context_id, context_processed_at` — **no `driver_name`, `broker_name`, `dispatcher_name`, `unit_id`, `entity_names`, or `entities` columns**.
- The classify edge function ([app/api/ai/classify/route.ts](app/api/ai/classify/route.ts)) returns `department, severity, summary, topic_name, needs_review, alert_worthy, recommended_action, rationale` — **no entity extraction**.
- **Design implication:** drill_in entity matching has no structured field to query against today. Options for Phase 8: (a) ILIKE search on `message_text`, (b) extend the classifier to extract `entities text[]` per message, (c) leverage `driver_unit_assignments(driver_name, driver_id)` as a controlled vocabulary for driver drill-ins. (a) is simplest and works at small scale.

#### Aliases / synonyms
- No alias / synonym table exists. Driver names in `driver_unit_assignments` are the only canonical-name source.

---

## Open questions for Rebeca

1. **Mirror target.** The prompt says "the new briefings UI mirrors Reports", but Reports in v2-c is a static link list (Task 3). The actual reusable pattern is the existing **Briefings system itself**. Should Phase 2's design doc be re-pointed at `briefing-client.tsx` as the reference, with the new "watchlist / alert_digest / drill_in" archetypes layered on top?
2. **Schema strategy.** `briefings` already exists. Do you want Phase 2 to (a) `ALTER` the existing table with `briefing_type` + `scope jsonb`, mapping all current rows to `alert_digest`, or (b) introduce parallel tables (`briefings_v2`, etc.) and migrate? (Recommend (a) for speed; (b) only if the existing rows don't fit the new model.)
3. **Route naming.** Keep `/briefing` (singular) and grow it, or rename to `/briefings` with a redirect? Affects sidebar nav and any direct links.
4. **`generate-summary` references.** The original prompt presumes a `generate-summary` Lovable-AI Edge Function exists. It does not in v2-c. Confirm: **strike that section from the v2 design doc** so it doesn't drive false work.
5. **Telegram chat picker.** Want the recipient picker to pull from `sources` where `type='telegram' AND is_active`, or stay free-text? Current UI is text-only.
6. **`briefing_history` rename to `briefing_runs`?** The design doc proposes `briefing_runs`. Existing table is `briefing_history` and is in production. Worth the rename, or keep the existing name and update the design?
7. **Topic gating.** `messages.topic_id` is 0% filled. Phase 6's topic chip on the briefing UI would do nothing today. Hide it until topic generation lands, or keep as a "future filter" affordance?
8. **FTS index.** Add the `tsvector` index in Phase 2 migration (cheap insurance) or defer to Phase 6 when keyword scope actually arrives?
9. **Voice TTS handling.** Voice is wired and live. The Phase 2 Briefing modal doesn't currently surface a `send_voice` toggle even though the column exists. Want it exposed?
10. **Memory note vs reality on AI gateway.** Project memory says "Lovable", reality says "Anthropic Haiku direct". Want me to update the memory entry?

---

## Recommended Phase 2 scope adjustments

Based on findings, three deviations from the design doc are worth pre-aligning before Phase 2 starts:

1. **Strike "Reports config pattern as reference" — replace with "existing Briefings system as reference"** (open question #1). The pattern Phase 2 needs to clone already lives in [`briefing-client.tsx`](app/(main)/briefing/briefing-client.tsx).
2. **Strike `generate-summary` deprecation work** (open question #4). Nothing to deprecate; the AI engine is already direct Anthropic Haiku.
3. **Re-shape Phase 2 schema work as `ALTER`, not `CREATE`** (open question #2). Add `briefing_type` and `scope` jsonb to the existing `briefings` table; preserve `briefing_history` as-is. Migration filename `20260509_briefings_v2_schema.sql`.

Smaller scope adjustments worth flagging:
- The Telegram chat picker is a Phase 2 UI improvement opportunity, not a blocker (open question #5).
- The `tsvector` index can be moved up from Phase 6 to Phase 2 cheaply (open question #8).
- Voice toggle UI is a small Phase 2 add since the column + send path already exist (open question #9).

---

## Verification checklist (self-check before reporting done)

- [x] `docs/briefings-v2-discovery.md` exists and is non-empty
- [x] Every task has its own section with file paths or `not found` proof
- [x] The Summary table has a row per component (incl. Task 11)
- [x] Open questions section exists (10 questions)
- [x] No other files were created or modified — see `git status` (only `docs/briefings-v2-discovery.md` is added)
