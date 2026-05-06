// Deno copy of lib/briefings/types.ts. Keep in sync — Deno can't
// follow the Next.js @/ alias, and shipping the same shape on both
// sides of the wire is what JSON.parse(payload) on the client relies
// on. ~80 lines, types only, low drift risk.

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type WatchlistEntry = {
  driver_id:   string | null
  driver_name: string | null
  unit_id?:    string | null
  unit_name?:  string | null
}

export type TopIssue = {
  label:    string
  severity: Severity
  count:    number
}

export type WatchlistRow = {
  id:               string
  name:             string | null
  is_resolved:      boolean
  issue_count:      number
  top_issues:       TopIssue[]
  severity:         Severity
  delta_vs_prior:   number | null
}

export type CriticalEventRow = {
  message_id:   string
  message_ts:   string
  driver_id:    string | null
  driver_name:  string | null
  unit_id:      string | null
  unit_name:    string | null
  fault_label:  string
  spn:          number | null
  fmi:          number | null
  severity:     Severity
}

export type CoachingRecommendation = {
  behavior_label:      string
  affected_count:      number
  delta_pct_vs_prior:  number | null
  severity:            Severity
  suggested_action:    string
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
  generated_at:     string
  range:            { from: string; to: string }
  previous_run_at:  string | null

  whats_new:         WatchlistWhatsNew
  driver_watchlist:  { rows: WatchlistRow[]; total_on_watchlist: number }
  unit_watchlist:    { rows: WatchlistRow[]; total_on_watchlist: number }
  critical_events:   CriticalEventRow[]
  coaching:          CoachingRecommendation[]
}

export const WATCHLIST_TOP_N      = 5
export const CRITICAL_EVENTS_MAX  = 10
export const COACHING_MAX         = 5

// Severity ordering used by the handler's row-severity calculation.
// Lower index = more severe — matches the project-wide convention.
export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
}

export function maxSeverity(severities: Severity[]): Severity {
  if (severities.length === 0) return 'low'
  return severities.reduce<Severity>((acc, s) =>
    SEVERITY_ORDER[s] < SEVERITY_ORDER[acc] ? s : acc, 'low')
}
