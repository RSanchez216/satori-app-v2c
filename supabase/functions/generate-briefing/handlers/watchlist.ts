// @ts-nocheck
//
// `watchlist` template handler. Pulls Samsara watchlists + critical
// events + behavior breakdown via the existing RPCs, computes the
// "What's New" diff vs the prior run's payload, and assembles a
// WatchlistPayload.
//
// Pure data — no LLM in this path. The same payload shape feeds the
// detail-page renderer (Phase 3) and (Phase 4) the push channels.

import {
  type WatchlistPayload, type WatchlistRow, type TopIssue,
  type CriticalEventRow, type CoachingRecommendation,
  type WatchlistEntry, type WatchlistWhatsNew, type Severity,
  WATCHLIST_TOP_N, CRITICAL_EVENTS_MAX, COACHING_MAX,
  maxSeverity,
} from '../types.ts'

interface HandlerInput {
  briefing:        Record<string, unknown>
  range:           { from: string; to: string }
  previousPayload: WatchlistPayload | null
  supabase:        any
}

// ─── Driver behavior → severity (mirrors lib/samsara/behavior-severity.ts) ──
//
// Kept minimal in-Deno because the handler only needs the severity ordering;
// the renderer (Next.js) uses the canonical map for any UI work.

const BEHAVIOR_LABEL: Record<string, string> = {
  distraction: 'Distraction',
  speeding:    'Speeding',
  harshBrake:  'Harsh Brake',
  def:         'DEF',
  idle:        'Idle',
  fuelLow:     'Fuel Low',
}

const BEHAVIOR_SEVERITY: Record<string, Severity> = {
  // Risk-score weights:
  //   distraction (×5) → critical
  //   speeding / harshBrake / DEF (×3) → high (we map "warning" to 'high')
  //   idle / fuelLow (×1) → medium ("degraded")
  distraction: 'critical',
  speeding:    'high',
  harshBrake:  'high',
  def:         'high',
  idle:        'medium',
  fuelLow:     'medium',
}

// Drivers' RPC emits per-category counts as flat columns. Pivot into
// a TopIssue[] sorted severity ASC then count DESC, drop zeros.
function driverTopIssues(d: Record<string, unknown>): TopIssue[] {
  const counts: Array<{ key: string; count: number }> = [
    { key: 'distraction', count: Number(d.distraction_count ?? 0) },
    { key: 'speeding',    count: Number(d.speeding_count    ?? 0) },
    { key: 'harshBrake',  count: Number(d.harsh_brake_count ?? 0) },
    { key: 'def',         count: Number(d.def_count         ?? 0) },
    { key: 'idle',        count: Number(d.idle_count        ?? 0) },
    { key: 'fuelLow',     count: Number(d.fuel_low_count    ?? 0) },
  ].filter(it => it.count > 0)

  const issues: TopIssue[] = counts.map(({ key, count }) => ({
    label:    BEHAVIOR_LABEL[key]    ?? key,
    severity: BEHAVIOR_SEVERITY[key] ?? 'low',
    count,
  }))

  const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  issues.sort((a, b) => {
    const s = SEV_RANK[a.severity] - SEV_RANK[b.severity]
    return s !== 0 ? s : b.count - a.count
  })
  return issues
}

// Units' RPC emits `top_issues` as jsonb of {spn, fmi, count}. We don't
// duplicate the 68-row J1939 lookup table here — Phase 3 ships
// "SPN n/FMI m" labels and the renderer (which has the full client-side
// j1939-codes lookup) can choose to further decode for display. Severity
// is set to 'high' as a safe default for a fault code in a vehicle alert
// stream — Phase 6 can refine via the lookup table once moved to shared.
function unitTopIssues(rawIssues: unknown): TopIssue[] {
  if (!Array.isArray(rawIssues)) return []
  return rawIssues
    .map((it: any) => {
      const spn = Number(it?.spn ?? 0)
      const fmi = Number(it?.fmi ?? 0)
      const count = Number(it?.count ?? 0)
      if (!spn || !fmi || count <= 0) return null
      return {
        label:    `SPN ${spn} / FMI ${fmi}`,
        severity: 'high' as Severity,
        count,
      }
    })
    .filter((x): x is TopIssue => x !== null)
}

// ─── Critical events ───────────────────────────────────────────────────────

const CRITICAL_TYPE_LABEL: Record<string, string> = {
  severe_speeding: 'Severe speeding',
  distraction:     'Distraction',
  crash:           'Crash detected',
  vehicle_fault:   'Vehicle fault',
  harsh_brake:     'Harsh braking',
}

function criticalSeverity(alertType: string): Severity {
  if (alertType === 'crash' || alertType === 'severe_speeding' || alertType === 'distraction') return 'critical'
  return 'high'
}

function makeCriticalEventRow(r: Record<string, unknown>): CriticalEventRow {
  // Synthesize a stable ID from (occurred_at + driver_id + unit_id) so
  // the same event compared across runs has the same identity.
  const occurredAt = r.occurred_at as string
  const driverId   = (r.driver_id  as string | null) ?? ''
  const unitId     = (r.unit_id    as string | null) ?? ''
  const messageId  = `${occurredAt}|${driverId}|${unitId}`
  const alertType  = (r.alert_type as string) ?? 'unknown'
  return {
    message_id:  messageId,
    message_ts:  occurredAt,
    driver_id:   (r.driver_id   as string | null) ?? null,
    driver_name: (r.driver_name as string | null) ?? null,
    unit_id:     (r.unit_id     as string | null) ?? null,
    unit_name:   (r.unit_id     as string | null) ?? null,
    fault_label: CRITICAL_TYPE_LABEL[alertType] ?? alertType,
    spn:         null,
    fmi:         null,
    severity:    criticalSeverity(alertType),
  }
}

// ─── Coaching ──────────────────────────────────────────────────────────────

const COACHING_ACTIONS: Record<string, string> = {
  // alert_type from get_samsara_alert_breakdown.
  distraction:     'Review with team. Distracted-driving events are the leading risk indicator.',
  speeding:        'Audit affected drivers; review speed thresholds and route assignments.',
  harsh_brake:     'Coach affected drivers on following distance and braking technique.',
  vehicle_fault:   'Schedule diagnostic on affected units within 48 hours.',
  def_system:      'Schedule DEF system inspection within 48 hours.',
  idle:            'Review idle policy; consider driver-level coaching where excessive.',
  fuel_low:        'Review pre-trip fueling routine with affected drivers.',
  severe_speeding: 'Immediate 1:1 review with affected drivers.',
  crash:           'Open incident review for any affected drivers/units.',
}

function coachingFromBreakdown(
  rows: Array<Record<string, unknown>>,
  prior: WatchlistPayload | null,
): CoachingRecommendation[] {
  // alert_breakdown emits one row per (alert_type, tier). Roll up to
  // alert_type-only for coaching purposes.
  const byType = new Map<string, { count: number; tier: string | null }>()
  for (const r of rows) {
    const t = String(r.alert_type ?? 'unknown')
    const c = Number(r.count ?? 0)
    if (c <= 0) continue
    const existing = byType.get(t) ?? { count: 0, tier: null }
    existing.count += c
    if (r.tier === 'critical') existing.tier = 'critical'
    else if (existing.tier === null) existing.tier = (r.tier as string) ?? null
    byType.set(t, existing)
  }

  const priorByType = new Map<string, number>()
  if (prior) {
    for (const c of prior.coaching) {
      priorByType.set(c.behavior_label, c.affected_count)
    }
  }

  const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

  const recs: CoachingRecommendation[] = Array.from(byType.entries()).map(([alertType, { count, tier }]) => {
    const severity: Severity =
      tier === 'critical' ? 'critical' :
      tier === 'high'     ? 'high'     :
      tier === 'medium'   ? 'medium'   :
                            'low'
    const label = CRITICAL_TYPE_LABEL[alertType]
      ?? alertType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const action = COACHING_ACTIONS[alertType] ?? 'Review affected drivers and document findings.'

    const priorCount = priorByType.get(label) ?? null
    const delta_pct_vs_prior = (priorCount !== null && priorCount > 0)
      ? Math.round(((count - priorCount) / priorCount) * 100)
      : null

    return {
      behavior_label:     label,
      affected_count:     count,
      delta_pct_vs_prior,
      severity,
      suggested_action:   action,
    }
  })

  recs.sort((a, b) => {
    const s = SEV_RANK[a.severity] - SEV_RANK[b.severity]
    return s !== 0 ? s : b.affected_count - a.affected_count
  })
  return recs.slice(0, COACHING_MAX)
}

// ─── What's New diff ───────────────────────────────────────────────────────

function entryFromDriverRow(r: WatchlistRow, units: string[] | null = null): WatchlistEntry {
  return {
    driver_id:   r.id,
    driver_name: r.name,
    unit_id:     units && units[0] ? units[0] : null,
    unit_name:   units && units[0] ? units[0] : null,
  }
}

function entryFromUnitRow(r: WatchlistRow): WatchlistEntry {
  return {
    driver_id:   null,
    driver_name: null,
    unit_id:     r.id,
    unit_name:   r.name ?? r.id,
  }
}

function computeWhatsNew(
  currentDrivers: WatchlistRow[],
  currentUnits:   WatchlistRow[],
  criticalEvents: CriticalEventRow[],
  prior:          WatchlistPayload | null,
): WatchlistWhatsNew {
  if (!prior) {
    return {
      is_first_run:          true,
      new_critical_events:   0,
      new_watchlist_drivers: [],
      resolved_drivers:      [],
      new_watchlist_units:   [],
      resolved_units:        [],
    }
  }

  const priorDriverIds = new Set(prior.driver_watchlist.rows.map(r => r.id))
  const priorUnitIds   = new Set(prior.unit_watchlist.rows.map(r => r.id))
  const currDriverIds  = new Set(currentDrivers.map(r => r.id))
  const currUnitIds    = new Set(currentUnits.map(r => r.id))

  const newDrivers = currentDrivers
    .filter(r => !priorDriverIds.has(r.id))
    .map(r => entryFromDriverRow(r))

  const resolvedDrivers = prior.driver_watchlist.rows
    .filter(r => !currDriverIds.has(r.id))
    .map(r => entryFromDriverRow(r))

  const newUnits = currentUnits
    .filter(r => !priorUnitIds.has(r.id))
    .map(entryFromUnitRow)

  const resolvedUnits = prior.unit_watchlist.rows
    .filter(r => !currUnitIds.has(r.id))
    .map(entryFromUnitRow)

  // Count critical events newer than the prior payload's generation time.
  const priorTs = new Date(prior.generated_at).getTime()
  const newCriticalEvents = criticalEvents.filter(e => new Date(e.message_ts).getTime() > priorTs).length

  return {
    is_first_run:          false,
    new_critical_events:   newCriticalEvents,
    new_watchlist_drivers: newDrivers,
    resolved_drivers:      resolvedDrivers,
    new_watchlist_units:   newUnits,
    resolved_units:        resolvedUnits,
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────

export async function generate(input: HandlerInput): Promise<WatchlistPayload> {
  const { briefing, range, previousPayload, supabase } = input

  const [
    overviewRes, driverRes, unitRes, criticalRes, alertBreakdownRes,
    driverCountRes, unitCountRes,
  ] = await Promise.all([
    supabase.rpc('get_samsara_overview',           { p_start: range.from, p_end: range.to }),
    supabase.rpc('get_samsara_driver_offenders',   { p_start: range.from, p_end: range.to, p_limit: WATCHLIST_TOP_N, p_offset: 0 }),
    supabase.rpc('get_samsara_unit_offenders',     { p_start: range.from, p_end: range.to, p_limit: WATCHLIST_TOP_N, p_offset: 0 }),
    supabase.rpc('get_samsara_critical_events',    { p_start: range.from, p_end: range.to, p_limit: CRITICAL_EVENTS_MAX }),
    supabase.rpc('get_samsara_alert_breakdown',    { p_start: range.from, p_end: range.to }),
    supabase.rpc('count_samsara_driver_offenders', { p_start: range.from, p_end: range.to }),
    supabase.rpc('count_samsara_unit_offenders',   { p_start: range.from, p_end: range.to }),
  ])

  if (driverRes.error)         throw new Error(`driver_offenders: ${driverRes.error.message}`)
  if (unitRes.error)           throw new Error(`unit_offenders: ${unitRes.error.message}`)
  if (criticalRes.error)       throw new Error(`critical_events: ${criticalRes.error.message}`)
  if (alertBreakdownRes.error) throw new Error(`alert_breakdown: ${alertBreakdownRes.error.message}`)
  // Counts and overview are nice-to-have; failures degrade gracefully.

  // Build prior-row maps for delta_vs_prior.
  const priorDriversById = new Map<string, WatchlistRow>(
    (previousPayload?.driver_watchlist.rows ?? []).map(r => [r.id, r]),
  )
  const priorUnitsById = new Map<string, WatchlistRow>(
    (previousPayload?.unit_watchlist.rows ?? []).map(r => [r.id, r]),
  )

  // Driver watchlist rows.
  const driverRows: WatchlistRow[] = ((driverRes.data ?? []) as Array<Record<string, unknown>>).map(d => {
    const issues = driverTopIssues(d)
    const issue_count = Number(d.total_alerts ?? 0)
    const severity = maxSeverity(issues.map(i => i.severity))
    const id = String(d.driver_id ?? '')
    const prior = priorDriversById.get(id)
    return {
      id,
      name:           (d.driver_name as string | null) ?? null,
      is_resolved:    Boolean(d.is_resolved),
      issue_count,
      top_issues:     issues,
      severity,
      delta_vs_prior: prior ? issue_count - prior.issue_count : null,
    }
  })

  // Unit watchlist rows.
  const unitRows: WatchlistRow[] = ((unitRes.data ?? []) as Array<Record<string, unknown>>).map(u => {
    const issues = unitTopIssues(u.top_issues)
    const issue_count = Number(u.total_alerts ?? 0)
    const severity = maxSeverity(issues.length > 0 ? issues.map(i => i.severity) : ['high'])
    const id = String(u.unit_id ?? '')
    const prior = priorUnitsById.get(id)
    return {
      id,
      name:           id,                           // unit RPC has no separate name — use id as both
      is_resolved:    true,                         // a unit_id IS the unit; nothing to resolve
      issue_count,
      top_issues:     issues,
      severity,
      delta_vs_prior: prior ? issue_count - prior.issue_count : null,
    }
  })

  // Critical events.
  const criticalEvents: CriticalEventRow[] = ((criticalRes.data ?? []) as Array<Record<string, unknown>>)
    .map(makeCriticalEventRow)
    .slice(0, CRITICAL_EVENTS_MAX)

  // Coaching.
  const coaching = coachingFromBreakdown(
    (alertBreakdownRes.data ?? []) as Array<Record<string, unknown>>,
    previousPayload,
  )

  // What's New.
  const whats_new = computeWhatsNew(driverRows, unitRows, criticalEvents, previousPayload)

  return {
    schema_version:    1,
    briefing_id:       briefing.id as string,
    briefing_name:     briefing.name as string,
    template:          'watchlist',
    generated_at:      new Date().toISOString(),
    range,
    previous_run_at:   previousPayload?.generated_at ?? null,
    whats_new,
    driver_watchlist:  {
      rows: driverRows,
      total_on_watchlist: Number((driverCountRes.data as number | null) ?? driverRows.length),
    },
    unit_watchlist:    {
      rows: unitRows,
      total_on_watchlist: Number((unitCountRes.data as number | null) ?? unitRows.length),
    },
    critical_events:   criticalEvents,
    coaching,
  }
}
