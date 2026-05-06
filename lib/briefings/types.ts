/**
 * Canonical briefing-payload contract — shared between the engine
 * (Deno edge function) and the renderer (Next.js client).
 *
 * The Deno copy at `supabase/functions/generate-briefing/types.ts`
 * MUST stay in sync with this file. Deno can't follow the Next.js
 * `@/` alias, and copy-vs-relative-import is the smaller evil.
 *
 * Bump `schema_version` on payload-shape changes; renderer should
 * gracefully reject unknown versions.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type WatchlistEntry = {
  driver_id:   string | null
  driver_name: string | null      // null when unresolved
  unit_id?:    string | null
  unit_name?:  string | null
}

export type TopIssue = {
  label:    string
  severity: Severity
  count:    number
}

export type WatchlistRow = {
  id:               string         // driver_id or unit_id
  name:             string | null  // driver_name or unit_name; null = unresolved
  is_resolved:      boolean
  issue_count:      number
  top_issues:       TopIssue[]
  severity:         Severity        // overall row severity (max of issues)
  delta_vs_prior:   number | null  // null on first run / no prior match
}

export type CriticalEventRow = {
  message_id:   string
  message_ts:   string             // ISO
  driver_id:    string | null
  driver_name:  string | null
  unit_id:      string | null
  unit_name:    string | null
  fault_label:  string             // J1939-decoded if available, else raw
  spn:          number | null
  fmi:          number | null
  severity:     Severity
}

export type CoachingRecommendation = {
  behavior_label:      string         // "Distracted driving"
  affected_count:      number
  delta_pct_vs_prior:  number | null
  severity:            Severity
  suggested_action:    string         // pre-written, not LLM
}

export type WatchlistWhatsNew = {
  is_first_run:           boolean
  new_critical_events:    number
  new_watchlist_drivers:  WatchlistEntry[]
  resolved_drivers:       WatchlistEntry[]
  new_watchlist_units:    WatchlistEntry[]
  resolved_units:         WatchlistEntry[]
}

export type WatchlistPayload = {
  schema_version:   1
  briefing_id:      string
  briefing_name:    string
  template:         'watchlist'
  generated_at:     string             // ISO
  range:            { from: string; to: string }
  previous_run_at:  string | null

  whats_new:         WatchlistWhatsNew
  driver_watchlist:  { rows: WatchlistRow[]; total_on_watchlist: number }
  unit_watchlist:    { rows: WatchlistRow[]; total_on_watchlist: number }
  critical_events:   CriticalEventRow[]
  coaching:          CoachingRecommendation[]
}

// ─── v1 limits ─────────────────────────────────────────────────────────────

export const WATCHLIST_TOP_N      = 5    // top drivers/units shown
export const CRITICAL_EVENTS_MAX  = 10   // last 24h cap
export const COACHING_MAX         = 5
