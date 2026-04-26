'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Printer, AlertTriangle, ArrowUp, ArrowDown, Minus,
  Truck, User, Calendar, Wrench, Gauge, Phone, Flame, Droplet, ZapOff,
} from 'lucide-react'

export type RangePreset = '7d' | '30d' | 'custom'

export type OverviewData = {
  totalAlerts:         number
  uniqueDrivers:       number
  uniqueUnits:         number
  criticalCount:       number
  highCount:           number
  operationalCount:    number
  totalAlertsPrevious: number
}

export type DriverRow = {
  driverId:      string
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
}

export type UnitRow = {
  unitId:             string
  faultCount:         number
  faultCodesDistinct: number
  idleCount:          number
  totalAlerts:        number
  lastAlertAt:        string
}

export type CriticalRow = {
  alertType:      'crash' | 'distraction' | 'severe_speeding'
  driverId:       string | null
  unitId:         string | null
  messageExcerpt: string
  occurredAt:     string
}

interface Props {
  from:     string
  to:       string
  preset:   RangePreset
  overview: OverviewData | null
  drivers:  DriverRow[]
  units:    UnitRow[]
  critical: CriticalRow[]
}

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

function coachingForDriver(d: DriverRow): string {
  const top = dominantDriverIssue(d)
  switch (top) {
    case 'distraction':
      return `Driver ${d.driverId} flagged ${d.totalAlerts} times — top issue: distracted driving (${d.distraction} events). Recommend a 1:1 coaching session focused on phone use and inattention.`
    case 'speeding':
      return `Driver ${d.driverId} flagged ${d.totalAlerts} times — top issue: speeding (${d.speeding} events). Recommend posted-limit refresher and a week of close monitoring.`
    case 'harshBrake':
      return `Driver ${d.driverId} flagged ${d.totalAlerts} times — top issue: harsh braking (${d.harshBrake} events). Recommend defensive-driving and following-distance coaching.`
    case 'def':
      return `Driver ${d.driverId} flagged ${d.totalAlerts} times — top issue: DEF system (${d.def} events). Verify driver has been trained on DEF refill procedure.`
    case 'idle':
      return `Driver ${d.driverId} flagged ${d.totalAlerts} times — top issue: excessive idling (${d.idle} events). Review idle-reduction policy and route-planning habits.`
    case 'fuelLow':
      return `Driver ${d.driverId} flagged ${d.totalAlerts} times — top issue: fuel-low warnings (${d.fuelLow} events). Coach on pre-trip inspections and fuel-stop planning.`
  }
}

function coachingForUnit(u: UnitRow): string {
  if (u.faultCount >= 20 && u.faultCodesDistinct >= 5) {
    return `Unit ${u.unitId} had ${u.faultCount} faults across ${u.faultCodesDistinct} different SPN/FMI codes — recommend pulling out of rotation for shop diagnostic.`
  }
  if (u.faultCount >= 10) {
    return `Unit ${u.unitId} had ${u.faultCount} faults across ${u.faultCodesDistinct} different SPN/FMI codes — recommend shop diagnostic visit.`
  }
  return `Unit ${u.unitId} had ${u.faultCount} faults — schedule routine maintenance check.`
}

export function SamsaraOffendersClient({ from, to, preset, overview, drivers, units, critical }: Props) {
  const router = useRouter()
  const [showCustom, setShowCustom] = useState(false)

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  const dateLabel = `${format(fromDate, 'MMM d')} – ${format(toDate, 'MMM d, yyyy')}`

  function applyPreset(p: RangePreset) {
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
      {/* Print-only styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
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
              {(['7d', '30d', 'custom'] as RangePreset[]).map(p => {
                const active = preset === p
                const label = p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : 'Custom Range'
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

        {/* ── 1. Driver Watchlist ── */}
        <section className="report-card rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <SectionHeader number="1" title="Driver Watchlist" subtitle="Top 10 drivers by risk score (distraction × 5 + speeding/harsh-brake/DEF × 3 + idle/fuel-low × 1)" icon={User} />
          {drivers.length === 0 ? (
            <EmptySection text="No driver-attributed Samsara alerts in this window." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                    <Th>#</Th>
                    <Th>Driver</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Speeding</Th>
                    <Th align="right">Harsh Brake</Th>
                    <Th align="right">Idle</Th>
                    <Th align="right">Fuel Low</Th>
                    <Th align="right">Distract.</Th>
                    <Th align="right">DEF</Th>
                    <Th>Cross-cat</Th>
                    <Th>Last Alert</Th>
                    <Th align="right">Risk</Th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d, i) => {
                    const isWorst = d.riskScore >= 100
                    return (
                      <tr key={d.driverId} style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isWorst ? 'rgba(248,81,73,0.05)' : 'transparent',
                      }}>
                        <Td>{i + 1}</Td>
                        <Td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{d.driverId}</span></Td>
                        <Td align="right" bold>{d.totalAlerts}</Td>
                        <Td align="right">{d.speeding || '—'}</Td>
                        <Td align="right">{d.harshBrake || '—'}</Td>
                        <Td align="right">{d.idle || '—'}</Td>
                        <Td align="right">{d.fuelLow || '—'}</Td>
                        <Td align="right">{d.distraction || '—'}</Td>
                        <Td align="right">{d.def || '—'}</Td>
                        <Td>
                          {d.alertTypesHit >= 3 ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(248,81,73,0.12)', color: 'var(--severity-critical)' }}>
                              {d.alertTypesHit} types
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>{d.alertTypesHit}</span>
                          )}
                        </Td>
                        <Td><span style={{ color: 'var(--text-muted)' }}>{formatDistanceToNow(new Date(d.lastAlertAt), { addSuffix: true })}</span></Td>
                        <Td align="right">
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
            </div>
          )}
        </section>

        {/* ── 2. Unit Watchlist ── */}
        <section className="report-card rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <SectionHeader number="2" title="Unit Watchlist" subtitle="Top 10 units by vehicle-fault count and distinct SPN/FMI codes" icon={Truck} />
          {units.length === 0 ? (
            <EmptySection text="No unit-attributed Samsara alerts in this window." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                    <Th>#</Th>
                    <Th>Unit</Th>
                    <Th align="right">Faults</Th>
                    <Th align="right">Distinct codes</Th>
                    <Th align="right">Idle</Th>
                    <Th align="right">Total</Th>
                    <Th>Last alert</Th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u, i) => {
                    const isLemon = u.faultCount >= 20 && u.faultCodesDistinct >= 5
                    return (
                      <tr key={u.unitId} style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isLemon ? 'rgba(248,81,73,0.05)' : 'transparent',
                      }}>
                        <Td>{i + 1}</Td>
                        <Td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{u.unitId}</span></Td>
                        <Td align="right" bold>{u.faultCount}</Td>
                        <Td align="right">
                          {u.faultCodesDistinct >= 5 ? (
                            <span style={{ fontWeight: 700, color: 'var(--severity-critical)' }}>{u.faultCodesDistinct}</span>
                          ) : (
                            u.faultCodesDistinct || '—'
                          )}
                        </Td>
                        <Td align="right">{u.idleCount || '—'}</Td>
                        <Td align="right">{u.totalAlerts}</Td>
                        <Td><span style={{ color: 'var(--text-muted)' }}>{formatDistanceToNow(new Date(u.lastAlertAt), { addSuffix: true })}</span></Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 3. Critical Events ── */}
        <section className="report-card rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <SectionHeader number="3" title="Critical Events" subtitle="Crashes, distraction, and severe speeding — every event in the window" icon={AlertTriangle} />
          {critical.length === 0 ? (
            <EmptySection text="No critical events in this period — clean window. ✅" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {critical.map((c, i) => {
                const meta = CRITICAL_META[c.alertType]
                const Icon = meta.icon
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3"
                    style={{
                      padding: '12px 20px',
                      borderBottom: i < critical.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <div className="flex-shrink-0 flex items-center justify-center" style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${meta.color}15`, color: meta.color,
                    }}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {meta.label}
                        </span>
                        {c.driverId && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Driver <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-secondary)' }}>{c.driverId}</span>
                          </span>
                        )}
                        {c.unitId && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Unit <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-secondary)' }}>{c.unitId}</span>
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {format(new Date(c.occurredAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                        {c.messageExcerpt}
                      </p>
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

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      padding: '10px 14px',
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
      color: 'var(--text-muted)', textAlign: align,
    }}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left', bold = false }: { children: React.ReactNode; align?: 'left' | 'right'; bold?: boolean }) {
  return (
    <td style={{
      padding: '10px 14px',
      fontSize: 12,
      color: 'var(--text-secondary)',
      textAlign: align,
      fontWeight: bold ? 700 : 400,
    }}>
      {children}
    </td>
  )
}

/* ─── Custom range modal ─────────────────────────────────────────────────── */

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
