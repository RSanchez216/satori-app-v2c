'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Printer, AlertTriangle, ArrowUp, ArrowDown, Minus,
  Truck, User, Calendar, Wrench, Gauge, Phone, Flame, Droplet, ZapOff,
  ChevronRight, Info,
} from 'lucide-react'
import { buildDateRange } from '@/components/ui/date-filter'
import { UnmappedEventsPanel } from '@/components/reports/UnmappedEventsPanel'
import {
  lookupFault, severityCssVar, SEVERITY_ORDER, parseFaultPair,
  type FaultSeverity,
} from '@/lib/samsara/j1939-codes'

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom'

export type OverviewData = {
  totalAlerts:         number
  uniqueDrivers:       number
  uniqueUnits:         number
  criticalCount:       number
  highCount:           number
  operationalCount:    number
  totalAlertsPrevious: number
  unmappedDrivers:     number
}

export type DriverRow = {
  driverId:      string
  driverName:    string | null
  isResolved:    boolean
  totalAlerts:   number
  speeding:      number
  harshBrake:    number
  idle:          number
  fuelLow:       number
  distraction:   number
  def:           number
  alertTypesHit: number
  lastAlertAt:   string
  riskScore:     number
  unitsDriven:   string[]
}

export type FaultIssue = {
  spn:   number
  fmi:   number
  count: number
}

export type UnitRow = {
  unitId:             string
  faultCount:         number
  faultCodesDistinct: number
  idleCount:          number
  totalAlerts:        number
  lastAlertAt:        string
  drivers:            string[]
  topIssues:          FaultIssue[]
}

export type CriticalRow = {
  alertType:   'crash' | 'distraction' | 'severe_speeding'
  driverId:    string | null
  driverName:  string | null
  unitId:      string | null
  messageFull: string
  occurredAt:  string
}

interface Props {
  from:           string
  to:             string
  preset:         RangePreset
  overview:       OverviewData | null
  drivers:        DriverRow[]
  driversTotal:   number
  units:          UnitRow[]
  unitsTotal:     number
  critical:       CriticalRow[]
}

const PAGE_SIZE = 25

const CRITICAL_META: Record<CriticalRow['alertType'], { label: string; color: string; icon: React.ElementType }> = {
  crash:           { label: 'Crash / Impact',     color: 'var(--severity-critical)', icon: AlertTriangle },
  distraction:     { label: 'Driver Distraction', color: 'var(--severity-critical)', icon: Phone },
  severe_speeding: { label: 'Severe Speeding',    color: 'var(--severity-high)',     icon: Gauge },
}

const ALERT_LABELS: Record<keyof Pick<DriverRow, 'speeding' | 'harshBrake' | 'idle' | 'fuelLow' | 'distraction' | 'def'>, { label: string; icon: React.ElementType }> = {
  speeding:    { label: 'Speeding',     icon: Gauge },
  harshBrake:  { label: 'Harsh Brake',  icon: ZapOff },
  idle:        { label: 'Idle',         icon: Flame },
  fuelLow:     { label: 'Fuel Low',     icon: Droplet },
  distraction: { label: 'Distraction',  icon: Phone },
  def:         { label: 'DEF',          icon: Wrench },
}

/**
 * Samsara message excerpts come pre-collapsed (whitespace) but with markdown
 * bold markers, emoji-prefixed fields, and a Telegram boilerplate header. This
 * helper strips:
 *   1. Everything up to and including "--- Original Message ---" (header noise)
 *   2. `**` markdown bold markers
 *   3. Emoji characters (the colored icon next to each event already conveys
 *      the alert type — emoji in text is redundant)
 *   4. Repeated whitespace and stray separators
 * Each emoji becomes a ` · ` field separator since they typically prefix
 * separate fields like `🚨 Severe Alert! 👤 Driver: X 🔺 Speed: Y`.
 */
function cleanExcerpt(raw: string): string {
  let s = raw

  const marker = '--- Original Message ---'
  const idx = s.indexOf(marker)
  if (idx >= 0) s = s.slice(idx + marker.length)

  s = s.replace(/\*\*/g, '')
  // Any non-ASCII run (covers all emoji surrogate pairs without needing the `u`
  // flag, which isn't available at this project's TS target). Samsara messages
  // are ASCII-only otherwise, so this is safe.
  s = s.replace(/[^\x00-\x7F]+/g, ' · ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^[·\s]+|[·\s]+$/g, '').trim()
  // Strip trailing 'View Incident'/'View Alert'/etc. boilerplate
  s = s.replace(/\s*·?\s*View\s+(Incident|Alert|Details?)\s*\.?\s*$/i, '').trim()
  s = s.replace(/(\s·\s){2,}/g, ' · ')
  // Cap at 200 chars; the full original message is always available in the
  // expand-on-click panel for events that need the rest.
  if (s.length > 200) s = s.slice(0, 200).trimEnd() + '…'

  return s
}

/**
 * Severity-colored dot — small inline circle prefixed to a fault description.
 * Theme-aware via `severityCssVar`.
 */
function SeverityDot({ severity, size = 6 }: { severity: FaultSeverity; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block', flexShrink: 0,
        width: size, height: size, borderRadius: '50%',
        background: severityCssVar(severity),
      }}
    />
  )
}

/**
 * Decoded fault list for a unit row's "Top Issues" cell. Sort order:
 *   severity ASC (critical first, unknown last) → count DESC.
 * Show top 3 inline; if more, "+N more" with a HoverTip listing the rest.
 */
function TopIssues({ issues }: { issues: FaultIssue[] }) {
  if (issues.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const decoded = issues.map(it => ({ ...it, code: lookupFault(it.spn, it.fmi) }))
  decoded.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.code.severity] - SEVERITY_ORDER[b.code.severity]
    return sev !== 0 ? sev : b.count - a.count
  })
  const top = decoded.slice(0, 3)
  const rest = decoded.slice(3)
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap" style={{ fontSize: 11, lineHeight: 1.6 }}>
      {top.map((it, i) => (
        <span
          key={`${it.spn}-${it.fmi}`}
          className="inline-flex items-center gap-1"
          style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}
        >
          {i > 0 && <span style={{ marginRight: 2 }}>·</span>}
          <SeverityDot severity={it.code.severity} />
          <span>
            {it.code.description}{' '}
            <span className="tabular-nums" style={{ opacity: 0.8 }}>× {it.count}</span>
          </span>
        </span>
      ))}
      {rest.length > 0 && (
        <HoverTip
          label={rest.map(it => `${it.code.description} × ${it.count}`).join('\n')}
        >
          <span style={{ color: 'var(--text-muted)', cursor: 'help', whiteSpace: 'nowrap' }}>
            +{rest.length} more
          </span>
        </HoverTip>
      )}
    </span>
  )
}

/**
 * Display helper for an array of identifiers (units or driver names): show the
 * first 3 inline, then a muted "+N more". A HoverTip wraps the whole element
 * with the full list joined by ' · '.
 */
function ListPreview({ items, hover }: { items: string[]; hover?: string }) {
  if (items.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const visible = items.slice(0, 3)
  const remaining = items.length - visible.length
  const inline = visible.join(', ') + (remaining > 0 ? ` +${remaining} more` : '')
  return (
    <HoverTip label={hover ?? items.join(' · ')}>
      <span style={{ cursor: 'help' }}>{inline}</span>
    </HoverTip>
  )
}

/**
 * Compact relative time: "5m ago" / "3h ago" / "2d ago". Used in the
 * watchlist tables where horizontal space is tight. The verbose
 * "about 14 hours ago" form is kept for Critical Events.
 */
function shortRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60)  return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/**
 * Inline Top Issues string for a driver row — replaces six per-category
 * columns with a single readable cell. Sorted by count desc; only
 * non-zero categories rendered.
 */
function topIssues(d: DriverRow): string {
  const items: Array<[string, number]> = [
    ['Speeding',     d.speeding],
    ['Idle',         d.idle],
    ['Fuel Low',     d.fuelLow],
    ['Harsh Brake',  d.harshBrake],
    ['Distraction',  d.distraction],
    ['DEF',          d.def],
  ]
  return items
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ${n}`)
    .join(' · ')
}

function categoriesHit(d: DriverRow): string[] {
  // Priority order: highest-weighted categories first so the tooltip reads
  // "what risk this driver represents" not "every box ticked alphabetically".
  const labels: Array<[number, string]> = [
    [d.distraction, 'Distraction'],
    [d.speeding,    'Speeding'],
    [d.harshBrake,  'Harsh Braking'],
    [d.def,         'DEF System'],
    [d.idle,        'Engine Idle'],
    [d.fuelLow,     'Fuel Low'],
  ]
  return labels.filter(([n]) => n > 0).map(([, label]) => label)
}

function dominantDriverIssue(d: DriverRow): keyof typeof ALERT_LABELS {
  const counts: { key: keyof typeof ALERT_LABELS; n: number }[] = [
    { key: 'distraction', n: d.distraction },
    { key: 'speeding',    n: d.speeding },
    { key: 'harshBrake',  n: d.harshBrake },
    { key: 'def',         n: d.def },
    { key: 'idle',        n: d.idle },
    { key: 'fuelLow',     n: d.fuelLow },
  ]
  counts.sort((a, b) => b.n - a.n)
  return counts[0].key
}

function driverDisplayForCoaching(d: DriverRow): string {
  // Resolved:   "Dzhovid Ochildiev (1830) on Unit M83"
  // Unresolved: "Driver M83 on Unit M83" — "Driver" prefix keeps the sentence
  //             grammatical when no human name is available; unit clause is
  //             appended in both branches so the recommendation reads the
  //             same shape either way.
  const unitClause =
    d.unitsDriven.length === 1 ? ` on Unit ${d.unitsDriven[0]}`
    : d.unitsDriven.length > 1  ? ` on Units ${d.unitsDriven.slice(0, 2).join(', ')}${d.unitsDriven.length > 2 ? '+more' : ''}`
    : ''
  if (d.isResolved && d.driverName) {
    return `${d.driverName} (${d.driverId})${unitClause}`
  }
  return `Driver ${d.driverId}${unitClause}`
}

function coachingForDriver(d: DriverRow): string {
  const top  = dominantDriverIssue(d)
  const who  = driverDisplayForCoaching(d)
  switch (top) {
    case 'distraction':
      return `${who} flagged ${d.totalAlerts} times — top issue: distracted driving (${d.distraction} events). Recommend a 1:1 coaching session focused on phone use and inattention.`
    case 'speeding':
      return `${who} flagged ${d.totalAlerts} times — top issue: speeding (${d.speeding} events). Recommend posted-limit refresher and a week of close monitoring.`
    case 'harshBrake':
      return `${who} flagged ${d.totalAlerts} times — top issue: harsh braking (${d.harshBrake} events). Recommend defensive-driving and following-distance coaching.`
    case 'def':
      return `${who} flagged ${d.totalAlerts} times — top issue: DEF system (${d.def} events). Verify driver has been trained on DEF refill procedure.`
    case 'idle':
      return `${who} flagged ${d.totalAlerts} times — top issue: excessive idling (${d.idle} events). Review idle-reduction policy and route-planning habits.`
    case 'fuelLow':
      return `${who} flagged ${d.totalAlerts} times — top issue: fuel-low warnings (${d.fuelLow} events). Coach on pre-trip inspections and fuel-stop planning.`
  }
}

function coachingForUnit(u: UnitRow): string {
  if (u.faultCount >= 20 && u.faultCodesDistinct >= 5) {
    return `Unit ${u.unitId} had ${u.faultCount} faults across ${u.faultCodesDistinct} different issue types — recommend pulling out of rotation for shop diagnostic.`
  }
  if (u.faultCount >= 10) {
    return `Unit ${u.unitId} had ${u.faultCount} faults across ${u.faultCodesDistinct} different issue types — recommend shop diagnostic visit.`
  }
  return `Unit ${u.unitId} had ${u.faultCount} faults — schedule routine maintenance check.`
}

export function SamsaraOffendersClient({ from, to, preset, overview, drivers, driversTotal, units, unitsTotal, critical }: Props) {
  const router = useRouter()
  const [showCustom, setShowCustom] = useState(false)
  const [showUnmapped, setShowUnmapped] = useState(false)
  // Records (not Sets) for accordion expand state — avoids Set iteration which
  // hits this project's downlevelIteration TS limit.
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({})
  const [eventOpen, setEventOpen] = useState<Record<number, boolean>>({})

  // Watchlist pagination — defaults to top-25 (server-provided). "Show all"
  // toggles to a paginated view that re-fetches client-side on page change.
  const driverPag = useWatchlistPagination<DriverRow>({
    rpcName: 'get_samsara_driver_offenders',
    initialRows: drivers,
    total: driversTotal,
    fromISO: from, toISO: to,
    mapRow: mapDriverRow,
  })
  const unitPag = useWatchlistPagination<UnitRow>({
    rpcName: 'get_samsara_unit_offenders',
    initialRows: units,
    total: unitsTotal,
    fromISO: from, toISO: to,
    mapRow: mapUnitRow,
  })

  const criticalGroups = useMemo(() => {
    const order: CriticalRow['alertType'][] = ['crash', 'severe_speeding', 'distraction']
    return order
      .map(type => ({ type, rows: critical.filter(c => c.alertType === type) }))
      .filter(g => g.rows.length > 0)
  }, [critical])

  function toggleGroup(key: string) {
    setGroupOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }
  function toggleEvent(idx: number) {
    setEventOpen(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  const dateLabel = `${format(fromDate, 'MMM d')} – ${format(toDate, 'MMM d, yyyy')}`

  function applyPreset(p: RangePreset) {
    if (p === 'today' || p === 'yesterday') {
      // Use the same CT-midnight math the Dashboard's preset tabs use,
      // so this report's Today/Yesterday windows match exactly.
      const r = buildDateRange(p)
      const params = new URLSearchParams({ preset: p, from: r.from, to: r.to })
      router.push(`/reports/samsara-offenders?${params.toString()}`)
      return
    }
    if (p === '7d')  router.push('/reports/samsara-offenders?preset=7d')
    if (p === '30d') router.push('/reports/samsara-offenders?preset=30d')
    if (p === 'custom') setShowCustom(true)
  }

  function applyCustom(rangeFrom: string, rangeTo: string) {
    const f = new Date(rangeFrom)
    const t = new Date(rangeTo)
    if (isNaN(f.getTime()) || isNaN(t.getTime()) || f >= t) return
    setShowCustom(false)
    const params = new URLSearchParams({ preset: 'custom', from: f.toISOString(), to: t.toISOString() })
    router.push(`/reports/samsara-offenders?${params.toString()}`)
  }

  const totalDelta = overview ? overview.totalAlerts - overview.totalAlertsPrevious : 0

  return (
    <>
      {/* Print-only + hover-tooltip styles */}
      <style>{`
        .print-only { display: none; }
        .htip { position: relative; display: inline-flex; align-items: center; }
        .htip-content {
          position: absolute; bottom: calc(100% + 6px); left: 50%;
          transform: translateX(-50%) translateY(2px);
          background: var(--bg-elevated); border: 1px solid var(--border-default);
          color: var(--text-primary); font-size: 11px; font-weight: 500;
          padding: 6px 10px; border-radius: 6px;
          white-space: pre-line; max-width: 280px; width: max-content;
          text-align: left; pointer-events: none;
          opacity: 0; transition: opacity 0.12s ease, transform 0.12s ease;
          z-index: 50;
          box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        }
        .htip:hover .htip-content { opacity: 1; transform: translateX(-50%) translateY(0); }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .htip-content { display: none !important; }
          /* Force accordion content visible in PDF regardless of expand state */
          .report-accordion-body { display: block !important; }
          body { background: #fff !important; }
          .report-page { padding: 0 !important; max-width: 100% !important; }
          .report-card { break-inside: avoid; box-shadow: none !important; border-color: #ddd !important; }
          .report-table th, .report-table td { padding: 6px 8px !important; }
          h2 { page-break-after: avoid; }
        }
      `}</style>

      <div className="report-page" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Samsara Repeat Offender Report
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>
              Drivers and units with recurring alerts · {dateLabel}
            </p>
          </div>

          <div className="no-print flex items-center gap-2 flex-wrap">
            {/* Date pills */}
            <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              {(['today', 'yesterday', '7d', '30d', 'custom'] as RangePreset[]).map(p => {
                const active = preset === p
                const label =
                  p === 'today'     ? 'Today'
                  : p === 'yesterday' ? 'Yesterday'
                  : p === '7d'      ? '7 Days'
                  : p === '30d'     ? '30 Days'
                  :                   'Custom Range'
                return (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: 'none',
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2"
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <Printer size={13} /> Print
            </button>
          </div>
        </div>

        {/* Custom range modal */}
        {showCustom && (
          <CustomRangeModal
            initialFrom={from}
            initialTo={to}
            onApply={applyCustom}
            onClose={() => setShowCustom(false)}
          />
        )}

        {/* ── Summary banner ── */}
        <div
          className="report-card grid grid-cols-2 md:grid-cols-4 gap-0 rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <KPI label="Total Alerts" value={overview?.totalAlerts ?? 0} sub={
            overview ? <DeltaPill delta={totalDelta} /> : null
          } />
          <KPI label="Unique Drivers" value={overview?.uniqueDrivers ?? 0} sub={<>with ≥1 alert</>} />
          <KPI label="Unique Units"   value={overview?.uniqueUnits ?? 0}   sub={<>with ≥1 alert</>} />
          <KPI label="Critical Tier"  value={overview?.criticalCount ?? 0} sub={<>crash + distraction</>} valueColor="var(--severity-critical)" />
        </div>

        {/* Unmapped-drivers data-quality pill — clickable to open drilldown */}
        {overview && overview.unmappedDrivers > 0 && (
          <button
            onClick={() => setShowUnmapped(true)}
            className="no-print flex items-center gap-2 rounded-lg flex-wrap text-left"
            style={{
              padding: '8px 14px',
              background: 'rgba(227,179,65,0.08)',
              border: '1px solid rgba(227,179,65,0.25)',
              alignSelf: 'flex-start',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(227,179,65,0.14)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(227,179,65,0.08)' }}
          >
            <AlertTriangle size={13} style={{ color: 'var(--severity-high)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {overview.unmappedDrivers} unmapped driver{overview.unmappedDrivers === 1 ? '' : 's'} in this window
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              · alerts may predate the assignment file or reference units not in the TMS export
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginLeft: 4 }}>
              Drilldown →
            </span>
          </button>
        )}

        {/* Unmapped events side panel */}
        <UnmappedEventsPanel
          open={showUnmapped}
          onClose={() => setShowUnmapped(false)}
          fromISO={from}
          toISO={to}
          onChanged={() => router.refresh()}
        />

        {/* ── 1. Driver Watchlist ── */}
        <section className="report-card rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <SectionHeader number="1" title="Driver Watchlist" subtitle="Drivers by risk score (distraction × 5 + speeding/harsh-brake/DEF × 3 + idle/fuel-low × 1)" icon={User} />
          {driverPag.rows.length === 0 ? (
            <EmptySection text="No driver-attributed Samsara alerts in this window." />
          ) : (
            <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'auto' }}>
              <colgroup>
                <col style={{ width: 48 }}  />{/* # */}
                <col />                      {/* Driver — flex */}
                <col />                      {/* Unit(s) — flex */}
                <col style={{ width: 64 }}  />{/* Total */}
                <col />                      {/* Top Issues — flex */}
                <col style={{ width: 92 }}  />{/* Cross-cat */}
                <col style={{ width: 96 }}  />{/* Last Alert */}
                <col style={{ width: 72 }}  />{/* Risk */}
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <Th sticky stickyLeft={0}>#</Th>
                  <Th sticky stickyLeft={48}>Driver</Th>
                  <Th>Unit(s)</Th>
                  <Th align="right">Total</Th>
                  <Th>Top Issues</Th>
                  <Th>Cross-cat</Th>
                  <Th align="right">Last Alert</Th>
                  <Th align="right">
                    <span className="inline-flex items-center gap-1" style={{ justifyContent: 'flex-end', width: '100%' }}>
                      Risk
                      <HoverTip label={'Weighted score per driver:\n• Distraction events × 5\n• Speeding, Harsh Braking, DEF × 3\n• Engine Idle, Fuel Low × 1\n\nHigher score = higher risk profile.'}>
                        <span
                          style={{
                            width: 12, height: 12, borderRadius: '50%',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 800,
                            background: 'var(--border-subtle)', color: 'var(--text-muted)',
                            cursor: 'help', flexShrink: 0,
                          }}
                        >?</span>
                      </HoverTip>
                    </span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {driverPag.rows.map((d, i) => {
                  const isWorst = d.riskScore >= 100
                  const rank    = driverPag.page * PAGE_SIZE + i + 1
                  const rowBg   = isWorst ? 'rgba(248,81,73,0.05)' : 'var(--bg-surface)'
                  return (
                    <tr key={d.driverId} style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isWorst ? 'rgba(248,81,73,0.05)' : 'transparent',
                    }}>
                      <Td sticky stickyLeft={0} bgRow={rowBg}>{rank}</Td>
                      <Td sticky stickyLeft={48} bgRow={rowBg}>
                        <div className="flex flex-col">
                          <span style={{
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                          }}>
                            {d.isResolved && d.driverName ? d.driverName : d.driverId}
                          </span>
                          <span style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            fontFamily: d.isResolved && d.driverName ? 'monospace' : 'inherit',
                          }}>
                            {d.isResolved && d.driverName ? d.driverId : 'unmapped'}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <ListPreview items={d.unitsDriven} />
                      </Td>
                      <Td align="right" bold tabularNums>{d.totalAlerts}</Td>
                      <Td>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {topIssues(d) || '—'}
                        </span>
                      </Td>
                      <Td>
                        {d.alertTypesHit >= 3 ? (
                          <HoverTip label={categoriesHit(d).join(' · ')}>
                            <span
                              style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(248,81,73,0.12)', color: 'var(--severity-critical)', cursor: 'help' }}
                            >
                              {d.alertTypesHit} types
                            </span>
                          </HoverTip>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{d.alertTypesHit}</span>
                        )}
                      </Td>
                      <Td align="right" tabularNums>
                        <span style={{ color: 'var(--text-muted)' }}>{shortRelativeTime(d.lastAlertAt)}</span>
                      </Td>
                      <Td align="right" tabularNums>
                        <span style={{
                          fontWeight: 700,
                          color: isWorst ? 'var(--severity-critical)' : 'var(--text-primary)',
                        }}>
                          {d.riskScore}
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <WatchlistFooter pag={driverPag} label="drivers" />
        </section>

        {/* ── 2. Unit Watchlist ── */}
        <section className="report-card rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <SectionHeader number="2" title="Unit Watchlist" subtitle="Units by vehicle-fault count and recurring issue types" icon={Truck} />
          {unitPag.rows.length === 0 ? (
            <EmptySection text="No unit-attributed Samsara alerts in this window." />
          ) : (
            <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'auto' }}>
              <colgroup>
                <col style={{ width: 48 }}  />{/* # */}
                <col style={{ width: 110 }} />{/* Unit */}
                <col />                       {/* Driver(s) — flex */}
                <col style={{ width: 80 }}  />{/* Faults */}
                <col />                       {/* Top Issues — flex */}
                <col style={{ width: 120 }} />{/* Issue Types */}
                <col style={{ width: 64 }}  />{/* Idle */}
                <col style={{ width: 64 }}  />{/* Total */}
                <col style={{ width: 96 }}  />{/* Last alert */}
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <Th sticky stickyLeft={0}>#</Th>
                  <Th sticky stickyLeft={48}>Unit</Th>
                  <Th>Driver(s)</Th>
                  <Th align="right">Faults</Th>
                  <Th>Top Issues</Th>
                  <Th align="right">
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ justifyContent: 'flex-end', width: '100%', whiteSpace: 'nowrap' }}
                    >
                      Issue Types
                      <HoverTip label={'Number of distinct fault types this unit produced — chronic single issue vs. scattered problems.\n\nBolded red when ≥ 5 different types in the window.'}>
                        <Info size={11} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
                      </HoverTip>
                    </span>
                  </Th>
                  <Th align="right">Idle</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Last alert</Th>
                </tr>
              </thead>
              <tbody>
                {unitPag.rows.map((u, i) => {
                  const isLemon = u.faultCount >= 20 && u.faultCodesDistinct >= 5
                  const rank    = unitPag.page * PAGE_SIZE + i + 1
                  const rowBg   = isLemon ? 'rgba(248,81,73,0.05)' : 'var(--bg-surface)'
                  return (
                    <tr key={u.unitId} style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isLemon ? 'rgba(248,81,73,0.05)' : 'transparent',
                    }}>
                      <Td sticky stickyLeft={0} bgRow={rowBg}>{rank}</Td>
                      <Td sticky stickyLeft={48} bgRow={rowBg}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{u.unitId}</span>
                      </Td>
                      <Td><ListPreview items={u.drivers} /></Td>
                      <Td align="right" bold tabularNums>{u.faultCount}</Td>
                      <Td><TopIssues issues={u.topIssues} /></Td>
                      <Td align="right" tabularNums>
                        {u.faultCodesDistinct >= 5 ? (
                          <span style={{ fontWeight: 700, color: 'var(--severity-critical)' }}>{u.faultCodesDistinct}</span>
                        ) : (
                          u.faultCodesDistinct || '—'
                        )}
                      </Td>
                      <Td align="right" tabularNums>{u.idleCount || '—'}</Td>
                      <Td align="right" tabularNums>{u.totalAlerts}</Td>
                      <Td align="right" tabularNums>
                        <span style={{ color: 'var(--text-muted)' }}>{shortRelativeTime(u.lastAlertAt)}</span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <WatchlistFooter pag={unitPag} label="units" />
        </section>

        {/* ── 3. Critical Events (two-level accordion) ── */}
        <section className="report-card rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <SectionHeader number="3" title="Critical Events" subtitle="Crashes, distraction, and severe speeding — grouped by category, expand to view events" icon={AlertTriangle} />
          {criticalGroups.length === 0 ? (
            <EmptySection text="No critical events in this period — clean window. ✅" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {criticalGroups.map((group, gi) => {
                const meta   = CRITICAL_META[group.type]
                const Icon   = meta.icon
                const isOpen = !!groupOpen[group.type]
                return (
                  <div key={group.type} style={{ borderBottom: gi < criticalGroups.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    {/* Level 1: group row */}
                    <button
                      onClick={() => toggleGroup(group.type)}
                      className="no-print w-full flex items-center gap-3"
                      style={{
                        padding: '12px 20px', textAlign: 'left',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                      }}
                    >
                      <ChevronRight
                        size={14}
                        style={{
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                          transform: isOpen ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                      <div className="flex-shrink-0 flex items-center justify-center" style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: `${meta.color}15`, color: meta.color,
                      }}>
                        <Icon size={14} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {meta.label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                        {group.rows.length} event{group.rows.length !== 1 ? 's' : ''}
                      </span>
                    </button>

                    {/* Print-only static header so groups render labelled in PDF */}
                    <div className="print-only flex items-center gap-2" style={{ padding: '10px 20px 4px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ({group.rows.length} event{group.rows.length !== 1 ? 's' : ''})
                      </span>
                    </div>

                    {/* Level 2: event rows */}
                    <div
                      className="report-accordion-body"
                      style={{ display: isOpen ? 'block' : 'none' }}
                    >
                      {group.rows.map((c) => {
                        // Use a stable key derived from occurredAt+driverId so the
                        // expanded-row state survives re-renders.
                        const key = `${group.type}|${c.occurredAt}|${c.driverId ?? ''}|${c.unitId ?? ''}`
                        const eIdx = critical.indexOf(c)
                        const eOpen = !!eventOpen[eIdx]
                        // Crashes / distraction / severe-speeding don't normally carry an
                        // SPN/FMI pair, but if one is present in the raw payload (e.g. a
                        // joint-flagged event) we surface its severity inline.
                        const fault = parseFaultPair(c.messageFull)
                        const faultCode = fault ? lookupFault(fault.spn, fault.fmi) : null
                        return (
                          <div key={key} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                            <button
                              onClick={() => toggleEvent(eIdx)}
                              className="w-full flex items-start gap-3"
                              style={{
                                padding: '10px 20px 10px 50px', textAlign: 'left',
                                background: 'transparent', border: 'none', cursor: 'pointer',
                              }}
                            >
                              <ChevronRight
                                size={12}
                                className="no-print"
                                style={{
                                  color: 'var(--text-muted)',
                                  flexShrink: 0, marginTop: 3,
                                  transform: eOpen ? 'rotate(90deg)' : 'none',
                                  transition: 'transform 0.15s ease',
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {faultCode && (
                                    <HoverTip label={`${faultCode.description} (SPN ${faultCode.spn}/FMI ${faultCode.fmi})`}>
                                      <span style={{ display: 'inline-flex', cursor: 'help' }}>
                                        <SeverityDot severity={faultCode.severity} />
                                      </span>
                                    </HoverTip>
                                  )}
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Driver:{' '}
                                    {c.driverName ? (
                                      <>
                                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{c.driverName}</span>
                                        {c.driverId && (
                                          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', marginLeft: 4 }}>({c.driverId})</span>
                                        )}
                                      </>
                                    ) : (
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: c.driverId ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                        {c.driverId ?? '—'}
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }} aria-hidden="true">·</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Unit:{' '}
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: c.unitId ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                      {c.unitId ?? '—'}
                                    </span>
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    {format(new Date(c.occurredAt), 'MMM d, h:mm a')}
                                  </span>
                                </div>
                                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                                  {cleanExcerpt(c.messageFull)}
                                </p>
                              </div>
                            </button>

                            {/* Full original message panel */}
                            <div
                              className="report-accordion-body"
                              style={{ display: eOpen ? 'block' : 'none', padding: '0 20px 12px 50px' }}
                            >
                              <pre style={{
                                fontSize: 11, fontFamily: 'monospace',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 6, padding: 10,
                                color: 'var(--text-secondary)',
                                whiteSpace: 'pre-wrap',
                                overflowX: 'auto',
                                maxHeight: 400,
                                margin: 0,
                              }}>
                                {c.messageFull}
                              </pre>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 4. Coaching Recommendations ── */}
        <section className="report-card rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <SectionHeader number="4" title="Coaching Recommendations" subtitle="Suggested actions based on top-3 driver and unit patterns" icon={Calendar} />
          {drivers.length === 0 && units.length === 0 ? (
            <EmptySection text="No data to generate recommendations." />
          ) : (
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drivers.slice(0, 3).map((d) => (
                <div key={`coach-d-${d.driverId}`} className="flex items-start gap-2.5">
                  <User size={13} style={{ color: 'var(--severity-high)', marginTop: 2, flexShrink: 0 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {coachingForDriver(d)}
                  </p>
                </div>
              ))}
              {units.slice(0, 3).map((u) => (
                <div key={`coach-u-${u.unitId}`} className="flex items-start gap-2.5">
                  <Truck size={13} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {coachingForUnit(u)}
                  </p>
                </div>
              ))}
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                Generated from pattern templates. Driver and unit IDs are Samsara identifiers; resolve to names externally.
              </p>
            </div>
          )}
        </section>

        {/* Tier breakdown footer (small) */}
        {overview && (
          <p className="no-print" style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            Tier breakdown: {overview.criticalCount} critical · {overview.highCount} high · {overview.operationalCount} operational
          </p>
        )}
      </div>
    </>
  )
}

/* ─── Small components ───────────────────────────────────────────────────── */

/**
 * Pure-CSS hover tooltip — instant on hover, consistent styling, no JS state
 * or portal. Used wherever we'd otherwise reach for `title=""` (which has a
 * ~1s OS delay and uses default OS styling that doesn't match the app).
 */
function HoverTip({ children, label }: { children: React.ReactNode; label: React.ReactNode }) {
  return (
    <span className="htip">
      {children}
      <span className="htip-content">{label}</span>
    </span>
  )
}

function KPI({ label, value, sub, valueColor }: { label: string; value: number | string; sub?: React.ReactNode; valueColor?: string }) {
  return (
    <div style={{ padding: '14px 18px', borderRight: '1px solid var(--border-subtle)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 900, color: valueColor ?? 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 4 }}>
        {value}
      </p>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) return <span className="inline-flex items-center gap-1"><Minus size={10} /> no change vs previous</span>
  if (delta > 0)   return <span className="inline-flex items-center gap-1" style={{ color: 'var(--severity-critical)' }}><ArrowUp size={10} /> +{delta} vs previous</span>
  return            <span className="inline-flex items-center gap-1" style={{ color: 'var(--severity-low)' }}><ArrowDown size={10} /> {Math.abs(delta)} vs previous</span>
}

function SectionHeader({ number, title, subtitle, icon: Icon }: { number: string; title: string; subtitle: string; icon: React.ElementType }) {
  return (
    <div className="flex items-start gap-3" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--accent-dim)', color: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, flexShrink: 0,
      }}>
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          <Icon size={13} style={{ color: 'var(--text-muted)' }} />
          {title}
        </h2>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>
      </div>
    </div>
  )
}

function EmptySection({ text }: { text: string }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{text}</p>
    </div>
  )
}

function Th({
  children, align = 'left', sticky = false, stickyLeft = 0,
}: {
  children: React.ReactNode; align?: 'left' | 'right'
  sticky?: boolean; stickyLeft?: number
}) {
  // Sticky header cells live inside the sticky <thead> (zIndex 3). Bumping
  // their own zIndex to 5 keeps them above the sticky body cells (zIndex 2)
  // when the user scrolls both axes simultaneously.
  return (
    <th
      style={{
        padding: '10px 14px',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
        color: 'var(--text-muted)', textAlign: align,
        ...(sticky ? { position: 'sticky', left: stickyLeft, background: 'var(--bg-surface)', zIndex: 5 } : null),
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children, align = 'left', bold = false, sticky = false, stickyLeft = 0, bgRow, tabularNums = false,
}: {
  children: React.ReactNode; align?: 'left' | 'right'; bold?: boolean
  sticky?: boolean; stickyLeft?: number; bgRow?: string; tabularNums?: boolean
}) {
  return (
    <td
      style={{
        padding: '10px 14px',
        fontSize: 12,
        color: 'var(--text-secondary)',
        textAlign: align,
        fontWeight: bold ? 700 : 400,
        ...(tabularNums ? { fontVariantNumeric: 'tabular-nums' } : null),
        ...(sticky ? { position: 'sticky', left: stickyLeft, background: bgRow ?? 'var(--bg-surface)', zIndex: 2 } : null),
      }}
    >
      {children}
    </td>
  )
}

/* ─── Custom range modal ─────────────────────────────────────────────────── */

/* ─── Watchlist pagination hook ──────────────────────────────────────────── */

type WatchlistPagination<T> = {
  rows:           T[]
  expanded:       boolean
  page:           number
  totalPages:     number
  total:          number
  loading:        boolean
  showAll:        () => void
  collapse:       () => void
  next:           () => void
  prev:           () => void
}

type PaginationOpts<T> = {
  rpcName:     'get_samsara_driver_offenders' | 'get_samsara_unit_offenders'
  initialRows: T[]
  total:       number
  fromISO:     string
  toISO:       string
  mapRow:      (raw: Record<string, unknown>) => T
}

function useWatchlistPagination<T>(opts: PaginationOpts<T>): WatchlistPagination<T> {
  const { rpcName, initialRows, total, fromISO, toISO, mapRow } = opts
  const [expanded, setExpanded] = useState(false)
  const [page,     setPage]     = useState(0)
  const [rows,     setRows]     = useState<T[]>(initialRows)
  const [loading,  setLoading]  = useState(false)

  // Re-seed when SSR initialRows change (date range refetch via router.refresh)
  useEffect(() => {
    setRows(initialRows)
    setPage(0)
    setExpanded(false)
  }, [initialRows])

  // Fetch on page change when expanded (page 0 reuses initialRows)
  useEffect(() => {
    if (!expanded) return
    if (page === 0) {
      setRows(initialRows)
      return
    }
    let cancelled = false
    const supabase = createClient()
    setLoading(true)
    supabase
      .rpc(rpcName, {
        p_start:  fromISO,
        p_end:    toISO,
        p_limit:  PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error(`[watchlist:${rpcName}] fetch failed:`, error)
        } else {
          setRows((data ?? []).map((r: unknown) => mapRow(r as Record<string, unknown>)))
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [expanded, page, fromISO, toISO, rpcName, initialRows, mapRow])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return {
    rows, expanded, page, totalPages, total, loading,
    showAll:  () => setExpanded(true),
    collapse: () => { setExpanded(false); setPage(0); setRows(initialRows) },
    next:     () => setPage((p) => Math.min(totalPages - 1, p + 1)),
    prev:     () => setPage((p) => Math.max(0, p - 1)),
  }
}

function mapDriverRow(r: Record<string, unknown>): DriverRow {
  return {
    driverId:      r.driver_id as string,
    driverName:    (r.driver_name as string | null) ?? null,
    isResolved:    Boolean(r.is_resolved),
    totalAlerts:   Number(r.total_alerts ?? 0),
    speeding:      Number(r.speeding_count ?? 0),
    harshBrake:    Number(r.harsh_brake_count ?? 0),
    idle:          Number(r.idle_count ?? 0),
    fuelLow:       Number(r.fuel_low_count ?? 0),
    distraction:   Number(r.distraction_count ?? 0),
    def:           Number(r.def_count ?? 0),
    alertTypesHit: Number(r.alert_types_hit ?? 0),
    lastAlertAt:   r.last_alert_at as string,
    riskScore:     Number(r.risk_score ?? 0),
    unitsDriven:   (r.units_driven as string[] | null) ?? [],
  }
}
function mapUnitRow(r: Record<string, unknown>): UnitRow {
  const rawIssues = (r.top_issues as Array<Record<string, unknown>> | null) ?? []
  return {
    unitId:             r.unit_id as string,
    faultCount:         Number(r.fault_count ?? 0),
    faultCodesDistinct: Number(r.fault_codes_distinct ?? 0),
    idleCount:          Number(r.idle_count ?? 0),
    totalAlerts:        Number(r.total_alerts ?? 0),
    lastAlertAt:        r.last_alert_at as string,
    drivers:            (r.drivers as string[] | null) ?? [],
    topIssues:          rawIssues.map(it => ({
      spn:   Number(it.spn   ?? 0),
      fmi:   Number(it.fmi   ?? 0),
      count: Number(it.count ?? 0),
    })),
  }
}

/* Watchlist footer: "Showing X of N · Show all" or pager controls */
function WatchlistFooter<T>({ pag, label }: { pag: WatchlistPagination<T>; label: string }) {
  const { rows, expanded, page, totalPages, total, loading, showAll, collapse, next, prev } = pag
  if (total <= PAGE_SIZE && !expanded) return null
  const fromIdx = total === 0 ? 0 : page * PAGE_SIZE + 1
  const toIdx   = page * PAGE_SIZE + rows.length

  return (
    <div
      className="no-print flex items-center gap-3 flex-wrap"
      style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)' }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {expanded
          ? `Showing ${fromIdx.toLocaleString()}–${toIdx.toLocaleString()} of ${total.toLocaleString()} ${label}`
          : `Showing ${rows.length.toLocaleString()} of ${total.toLocaleString()} ${label}`}
        {loading && <Loader2Inline />}
      </span>
      <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
        {!expanded ? (
          <button
            onClick={showAll}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Show all ({total.toLocaleString()}) →
          </button>
        ) : (
          <>
            <button
              onClick={prev}
              disabled={page === 0}
              style={pagerBtnStyle(page === 0)}
            >
              ‹ Prev
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '0 4px' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={next}
              disabled={page + 1 >= totalPages}
              style={pagerBtnStyle(page + 1 >= totalPages)}
            >
              Next ›
            </button>
            <button
              onClick={collapse}
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 8 }}
            >
              Collapse to top {PAGE_SIZE}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Loader2Inline() {
  return <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>· refreshing…</span>
}

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function CustomRangeModal({
  initialFrom, initialTo, onApply, onClose,
}: {
  initialFrom: string
  initialTo:   string
  onApply: (from: string, to: string) => void
  onClose: () => void
}) {
  const [from, setFrom] = useState(initialFrom.slice(0, 10))
  const [to,   setTo]   = useState(initialTo.slice(0, 10))

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          borderRadius: 12, padding: 20, width: 320,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          Custom date range
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            From
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              style={{
                display: 'block', marginTop: 4, width: '100%',
                padding: '6px 10px', borderRadius: 6,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', fontSize: 13,
              }}
            />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            To
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              style={{
                display: 'block', marginTop: 4, width: '100%',
                padding: '6px 10px', borderRadius: 6,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', fontSize: 13,
              }}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(from, to)}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: 'var(--accent)', border: 'none',
              color: '#fff', cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
