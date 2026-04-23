'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Phone, Eye, FileText, AlertTriangle, CheckCircle2,
  Activity, ShieldCheck, Brain, Bot, ChevronRight, Zap, RefreshCw,
  ShieldAlert, CheckCircle, ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { SeverityBadge } from '@/components/ui/severity-badge'
import { DateFilter, buildDateRange } from '@/components/ui/date-filter'
import type { DateRange } from '@/components/ui/date-filter'
import type { MessageContext, Alert, Source, ToriActivityLog, DashboardStats, AlertSeverity } from '@/types/database'
import type { ViolationsSummary, TopRule } from './page'

interface Props {
  stats: DashboardStats
  toriBannerMessage: string
  openContexts: (MessageContext & { source?: Source })[]
  recentAlerts: (Alert & { source?: Source })[]
  toriActivity: ToriActivityLog[]
  activeSources: (Source & { messagesCount: number })[]
  brainStatus: {
    kbRulesActive:  number
    messagesToday:  number
    contextsToday:  number
    lastActivityAt: string | null
  }
  violationsToday:    ViolationsSummary | null
  topViolatedRules:   TopRule[]
}

/* ─── Stat Card ─────────────────────────────────────────────────────────── */
function StatCard({
  label,
  value,
  icon: Icon,
  glowColor,
  subtext,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  glowColor: string
  subtext?: string
}) {
  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-3 overflow-hidden"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Radial corner glow */}
      <div
        className="pointer-events-none absolute -top-6 -right-6 w-28 h-28 rounded-full"
        style={{
          background: `radial-gradient(circle, ${glowColor}22 0%, transparent 70%)`,
        }}
      />

      <div className="flex items-center justify-between relative">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}
        >
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${glowColor}18`, color: glowColor }}
        >
          <Icon size={13} />
        </div>
      </div>

      <div className="relative">
        <p
          className="text-3xl font-black leading-none"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
        >
          {value}
        </p>
        {subtext && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{subtext}</p>
        )}
      </div>
    </div>
  )
}

/* ─── Health Ring ───────────────────────────────────────────────────────── */
function HealthRing({
  score,
  criticalAlerts,
  highAlerts,
  mediumAlerts,
}: {
  score: number
  criticalAlerts: number
  highAlerts: number
  mediumAlerts: number
}) {
  const size = 200
  const cx   = 100
  const cy   = 100
  const r    = 82
  const sw   = 13                           // stroke width
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ

  const color = score >= 90 ? '#16a34a' : score >= 70 ? '#e3b341' : '#f85149'
  const label = score >= 90 ? 'NOMINAL'  : score >= 70 ? 'CAUTION' : 'CRITICAL'
  const statusText = score >= 90
    ? 'Operations nominal'
    : score >= 70
    ? 'Attention needed'
    : 'Critical — review required'

  // Deduction lines
  const deductions: string[] = []
  if (criticalAlerts > 0) deductions.push(`−${criticalAlerts * 25} pts · ${criticalAlerts} critical alert${criticalAlerts !== 1 ? 's' : ''}`)
  if (highAlerts     > 0) deductions.push(`−${highAlerts * 10} pts · ${highAlerts} high alert${highAlerts !== 1 ? 's' : ''}`)
  if (mediumAlerts   > 0) deductions.push(`−${mediumAlerts * 3} pts · ${mediumAlerts} medium alert${mediumAlerts !== 1 ? 's' : ''}`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>

      {/* SVG gauge */}
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={sw} />
          {/* Progress arc */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 1.2s ease-out', filter: `drop-shadow(0 0 10px ${color}88)` }}
          />
          {/* Score number */}
          <text
            x={cx} y={cy - 12}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="48"
            fontWeight="900"
            fill={color}
            fontFamily="inherit"
            style={{ letterSpacing: '-0.03em' }}
          >
            {score}
          </text>
          {/* NOMINAL / CAUTION / CRITICAL label */}
          <text
            x={cx} y={cy + 24}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            fontWeight="700"
            fill="var(--text-muted)"
            fontFamily="inherit"
            style={{ letterSpacing: '0.1em' }}
          >
            {label}
          </text>
        </svg>
      </div>

      {/* Status text */}
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        {statusText}
      </p>

      {/* Score band legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { color: '#16a34a', label: '90–100 Nominal' },
          { color: '#e3b341', label: '70–89 Caution'  },
          { color: '#f85149', label: '0–69 Critical'   },
        ].map((b) => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{b.label}</span>
          </div>
        ))}
      </div>

      {/* Deductions or all-clear */}
      {deductions.length === 0 ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', margin: 0 }}>✓ No open alerts</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          {deductions.map((d) => (
            <p key={d} style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Misc configs ───────────────────────────────────────────────────────── */
const activityTypeConfig: Record<string, { label: string; color: string }> = {
  call_outbound:  { label: 'Call Out',  color: 'var(--accent)' },
  call_inbound:   { label: 'Call In',   color: 'var(--severity-low)' },
  telegram_sent:  { label: 'Telegram',  color: 'var(--accent)' },
  email_sent:     { label: 'Email',     color: 'var(--kb-purple)' },
  kb_flagged:     { label: 'KB Flag',   color: 'var(--severity-critical)' },
  synthesis:      { label: 'Synthesis', color: 'var(--severity-high)' },
  alert:          { label: 'Alert',     color: 'var(--severity-high)' },
}

const severityIconConfig: Record<string, { icon: React.ElementType; color: string }> = {
  critical: { icon: AlertTriangle, color: 'var(--severity-critical)' },
  high:     { icon: AlertTriangle, color: 'var(--severity-high)' },
  medium:   { icon: Activity,      color: 'var(--severity-medium)' },
  low:      { icon: Activity,      color: 'var(--severity-low)' },
}

const sourceTypeColor: Record<string, string> = {
  telegram: 'var(--accent)',
  email:    'var(--kb-purple)',
  api:      'var(--severity-high)',
  webhook:  'var(--severity-low)',
}

/* ─── Severity colors map (shared) ─────────────────────────────────────── */
const SEV_COLOR: Record<string, string> = {
  critical: 'var(--severity-critical)',
  high:     'var(--severity-high)',
  medium:   'var(--severity-medium)',
  low:      'var(--severity-low)',
}

/* ─── Range-label helper ────────────────────────────────────────────────── */
type RangeLabels = { sub: string; delta: string; tileSuffix: string }

function rangeLabels(range: DateRange): RangeLabels {
  switch (range.preset) {
    case 'today':     return { sub: 'Since midnight CT',  delta: 'vs yesterday',         tileSuffix: 'Today' }
    case 'yesterday': return { sub: 'Yesterday (CT)',     delta: 'vs day before',        tileSuffix: 'Yesterday' }
    case '7d':        return { sub: 'Last 7 days',        delta: 'vs previous 7 days',   tileSuffix: 'Last 7 days' }
    case '30d':       return { sub: 'Last 30 days',       delta: 'vs previous 30 days',  tileSuffix: 'Last 30 days' }
    case 'custom': {
      const fromD = new Date(range.from)
      const toD   = new Date(range.to)
      const days  = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86_400_000))
      // The exclusive upper bound is midnight of (last day + 1), so format the inclusive end
      const inclusiveEnd = new Date(toD.getTime() - 1)
      const sub = days === 1
        ? format(fromD, 'MMM d')
        : `${format(fromD, 'MMM d')} – ${format(inclusiveEnd, 'MMM d')}`
      return {
        sub,
        delta: `vs previous ${days} ${days === 1 ? 'day' : 'days'}`,
        tileSuffix: sub,
      }
    }
  }
}

/* ─── Violations KPI card ──────────────────────────────────────────────── */
function ViolationsCard({ data, range }: { data: ViolationsSummary | null; range: DateRange }) {
  const router = useRouter()
  const labels = rangeLabels(range)
  const delta = data ? data.total - data.previous : 0
  const glowColor = data && data.total > 0
    ? (data.critical > 0 ? '#f85149' : data.high > 0 ? '#e3b341' : '#3ecfcf')
    : '#56d364'

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-3 overflow-hidden"
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        cursor: 'pointer',
      }}
      onClick={() => router.push('/knowledge-base')}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(248,81,73,0.3)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)' }}
    >
      {/* Corner glow */}
      <div className="pointer-events-none absolute -top-6 -right-6 w-28 h-28 rounded-full"
        style={{ background: `radial-gradient(circle, ${glowColor}22 0%, transparent 70%)` }} />

      <div className="flex items-center justify-between relative">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          Violations
        </span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${glowColor}18`, color: glowColor }}>
          <ShieldAlert size={13} />
        </div>
      </div>

      <div className="relative">
        {data === null ? (
          <>
            <p className="text-3xl font-black leading-none" style={{ color: 'var(--text-muted)', letterSpacing: '-0.02em' }}>—</p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>Could not load</p>
          </>
        ) : (
          <>
            <p className="text-3xl font-black leading-none" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {data.total}
            </p>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>{labels.sub}</p>
            <div className="flex items-center gap-1 mt-1" style={{ fontSize: 11, fontWeight: 600 }}>
              {delta === 0 ? (
                <><Minus size={10} style={{ color: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)' }}>no change {labels.delta}</span></>
              ) : delta > 0 ? (
                <><ArrowUp size={10} style={{ color: 'var(--severity-critical)' }} /><span style={{ color: 'var(--severity-critical)' }}>{delta} {labels.delta}</span></>
              ) : (
                <><ArrowDown size={10} style={{ color: 'var(--severity-low)' }} /><span style={{ color: 'var(--severity-low)' }}>{Math.abs(delta)} {labels.delta}</span></>
              )}
            </div>
            {/* Severity chips */}
            {data.total > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {(['critical', 'high', 'medium', 'low'] as const).filter(s => data[s] > 0).map(s => (
                  <span key={s} style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    background: `${SEV_COLOR[s]}18`, color: SEV_COLOR[s],
                  }}>
                    {data[s]} {s.slice(0, 4)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Top Violated Rules panel ──────────────────────────────────────────── */
function TopViolatedRulesTile({ rules, range }: { rules: TopRule[] | null; range: DateRange }) {
  const router = useRouter()
  const maxCount = rules && rules.length > 0 ? rules[0].count : 1
  const labels = rangeLabels(range)
  const emptyMsg = range.preset === 'today'
    ? 'No rule violations today — operations are quiet.'
    : `No rule violations in ${labels.sub.toLowerCase()}.`

  function gotoInbox(ruleId: string) {
    const params = new URLSearchParams({
      rule_id: ruleId,
      preset:  range.preset,
      from:    range.from,
      to:      range.to,
    })
    router.push(`/inbox?${params.toString()}`)
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex items-start justify-between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <div className="flex items-center gap-2">
            <ShieldAlert size={13} style={{ color: 'var(--severity-critical)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Top Violated Rules · {labels.tileSuffix}
            </span>
            <span
              title={`Rules ranked by how often Tori matched them against incoming situations during ${labels.sub.toLowerCase()}.`}
              style={{
                width: 14, height: 14, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, background: 'var(--border-subtle)', color: 'var(--text-muted)', cursor: 'default', flexShrink: 0,
              }}
            >?</span>
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, paddingLeft: 21 }}>
            A situation can match multiple rules
          </span>
        </div>
        <Link href="/knowledge-base" className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
          View all <ChevronRight size={11} />
        </Link>
      </div>

      {/* Body */}
      {rules === null ? (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Could not load top rules</p>
        </div>
      ) : rules.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <CheckCircle size={14} style={{ color: 'var(--severity-low)', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emptyMsg}</p>
        </div>
      ) : (
        <div>
          {rules.map((rule) => {
            const pct = Math.round((rule.count / maxCount) * 100)
            const sevDotColor: Record<string, string> = {
              critical: 'var(--severity-critical)',
              high:     'var(--severity-high)',
              medium:   'var(--severity-medium)',
              low:      '#10b981',
            }
            const color = sevDotColor[rule.severity] ?? 'var(--bg-muted)'
            return (
              <div
                key={rule.ruleId}
                className="flex items-center gap-3"
                style={{ padding: '9px 20px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                onClick={() => gotoInbox(rule.ruleId)}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.018)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                {/* Severity dot */}
                <span className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: color, boxShadow: `0 0 5px ${color}99` }} />

                {/* Title + domain */}
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 340 }}>
                    {rule.title}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                    {rule.domain.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </p>
                </div>

                {/* Mini bar + count */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div style={{ width: 60, height: 3, borderRadius: 2, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', minWidth: 20, textAlign: 'right' }}>
                    {rule.count}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function DashboardClient(initialData: Props) {
  const [data, setData] = useState<Props>(initialData)
  const [dateRange, setDateRange] = useState<DateRange>(() => buildDateRange('today'))
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [secondsAgo, setSecondsAgo] = useState(0)

  // Live windows extend to "now" — they should auto-refresh.
  // Yesterday and Custom are fixed periods that don't change.
  const isLive = dateRange.preset === 'today' || dateRange.preset === '7d' || dateRange.preset === '30d'

  const fetchStats = useCallback(async (range: DateRange) => {
    setRefreshing(true)
    try {
      const url = `/api/dashboard/stats?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastUpdated(new Date())
        setSecondsAgo(0)
      }
    } catch {
      // silent fail — keep showing stale data
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Set initial lastUpdated client-side only (avoids hydration mismatch)
  useEffect(() => { setLastUpdated(new Date()) }, [])

  // Auto-refresh every 60 seconds — only for live windows (today/7d/30d)
  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => fetchStats(dateRange), 60_000)
    return () => clearInterval(interval)
  }, [isLive, dateRange, fetchStats])

  // Re-fetch when date range changes
  useEffect(() => { fetchStats(dateRange) }, [dateRange, fetchStats])

  // Tick the "X seconds ago" counter
  useEffect(() => {
    const tick = setInterval(() => {
      if (lastUpdated) setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(tick)
  }, [lastUpdated])

  function handleDateChange(range: DateRange) {
    setDateRange(range)
  }

  const { stats, toriBannerMessage, openContexts, recentAlerts, toriActivity, activeSources, brainStatus, violationsToday, topViolatedRules } = data
  const today = format(new Date(), 'EEEE, MMMM d')
  const labels = rangeLabels(dateRange)
  const resolvedLabel = dateRange.preset === 'today' ? 'Resolved Today' : 'Resolved'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              Dashboard
            </h1>
            <span
              className="animate-pulse rounded-full"
              style={{ width: 6, height: 6, background: 'var(--accent)', display: 'inline-block', marginTop: 2, flexShrink: 0 }}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>
            {today} · {stats.openSituations > 0 ? `${stats.openSituations} open situations` : 'All clear'} · Tori active
          </p>
        </div>

        {/* Date filter + refresh controls */}
        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
          <DateFilter value={dateRange} onChange={handleDateChange} />
          <div className="flex items-center gap-2">
          {lastUpdated && isLive && (
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              Updated {secondsAgo < 60 ? `${secondsAgo}s ago` : formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
          <button
            onClick={() => fetchStats(dateRange)}
            disabled={refreshing}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: 28,
              height: 28,
              color: 'var(--text-muted)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!refreshing) (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
          </div>
        </div>
      </div>

      {/* ── Tori briefing card ── */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0a1628 0%, #0d1f38 50%, #091525 100%)',
          border: '1px solid rgba(var(--accent-rgb), 0.2)',
          padding: '20px 24px',
        }}
      >
        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(var(--accent-rgb),0.07) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            maskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 70%, transparent 100%)',
          }}
        />

        {/* Top-right glow orb */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: -30,
            right: -30,
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.12) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex items-start gap-4">
          {/* Tori avatar with glow ring */}
          <div className="relative flex-shrink-0">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #0f2040, #162d4a)',
                border: '1.5px solid rgba(var(--accent-rgb), 0.5)',
                boxShadow: '0 0 16px rgba(var(--accent-rgb), 0.2), inset 0 0 10px rgba(var(--accent-rgb), 0.05)',
                color: 'var(--accent)',
              }}
            >
              <Bot size={20} />
            </div>
            {/* Pulse indicator */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
              style={{
                background: 'var(--accent)',
                border: '2px solid #091525',
                boxShadow: '0 0 6px rgba(var(--accent-rgb), 0.8)',
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Tori</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  border: '1px solid rgba(var(--accent-rgb), 0.2)',
                  borderRadius: 20,
                  padding: '2px 8px',
                  letterSpacing: '0.04em',
                }}
              >
                AI BRIEFING
              </span>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              {toriBannerMessage}
            </p>

            <div className="flex flex-wrap gap-2 mt-4">
              <Link href="/briefing">
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'var(--accent)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 12px rgba(var(--accent-rgb),0.3)',
                  }}
                >
                  <Phone size={12} /> Call Tori
                </button>
              </Link>
              <Link href="/inbox">
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'var(--accent-dim)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(var(--accent-rgb),0.25)',
                    cursor: 'pointer',
                  }}
                >
                  <Eye size={12} /> View Situations
                </button>
              </Link>
              <Link href="/reports">
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <FileText size={12} /> Full Report
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Open Situations"
          value={stats.openSituations}
          icon={AlertTriangle}
          glowColor="#3ecfcf"
          subtext="Across all sources"
        />
        <StatCard
          label={resolvedLabel}
          value={stats.resolvedToday}
          icon={CheckCircle2}
          glowColor="#56d364"
          subtext={labels.sub}
        />
        <StatCard
          label="Health Score"
          value={`${stats.healthScore}%`}
          icon={Activity}
          glowColor={stats.healthScore >= 80 ? '#56d364' : stats.healthScore >= 60 ? '#e3b341' : '#f85149'}
          subtext="Fleet operations"
        />
        <StatCard
          label="KB Violations"
          value={stats.kbViolations}
          icon={ShieldCheck}
          glowColor={stats.kbViolations > 0 ? '#f85149' : '#56d364'}
          subtext="Open compliance flags"
        />
        <ViolationsCard data={violationsToday ?? null} range={dateRange} />
      </div>

      {/* ── Top Violated Rules ── */}
      <TopViolatedRulesTile rules={topViolatedRules ?? null} range={dateRange} />

      {/* ── Main 2-col grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Open situations */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div
            className="flex items-center justify-between"
            style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Open Situations
            </span>
            <Link
              href="/inbox"
              className="flex items-center gap-1"
              style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}
            >
              View all <ChevronRight size={11} />
            </Link>
          </div>

          <div>
            {openContexts.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="No open situations"
                desc="Connect a source to start monitoring."
                href="/sources"
                cta="Add source"
              />
            ) : (
              openContexts.map((ctx) => {
                const cfg = severityIconConfig[ctx.severity as string] ?? { icon: Activity, color: 'var(--text-muted)' }
                const StatusIcon = cfg.icon
                const title = ctx.summary ?? ctx.context_preview ?? `Context ${ctx.id.slice(-6)}`
                return (
                  <Link
                    key={ctx.id}
                    href="/inbox"
                    className="flex items-start gap-3 transition-colors"
                    style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.018)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
                  >
                    <StatusIcon
                      size={14}
                      style={{ color: cfg.color, marginTop: 1, flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {ctx.source?.name && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ctx.source.name}</span>
                        )}
                        {ctx.department && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ctx.department}</span>
                        )}
                        {ctx.severity && (
                          <SeverityBadge severity={ctx.severity as AlertSeverity} />
                        )}
                        {ctx.alert_worthy && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'var(--kb-purple-dim)',
                              color: 'var(--kb-purple)',
                              fontWeight: 600,
                            }}
                          >
                            Alert
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {formatDistanceToNow(new Date(ctx.started_at ?? ctx.created_at), { addSuffix: true })}
                    </span>
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Recent alerts */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div
              className="flex items-center justify-between"
              style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Recent Alerts
              </span>
              <Link
                href="/alerts"
                className="flex items-center gap-1"
                style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}
              >
                View all <ChevronRight size={11} />
              </Link>
            </div>

            {recentAlerts.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No active alerts</p>
              </div>
            ) : (
              recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3"
                  style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <SeverityDot severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {alert.title}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {alert.is_kb_violation && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'var(--kb-purple-dim)',
                        color: 'var(--kb-purple)',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      KB
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Tori activity */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div
              className="flex items-center justify-between"
              style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Tori Activity
              </span>
              <Link
                href="/briefing"
                className="flex items-center gap-1"
                style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}
              >
                Full log <ChevronRight size={11} />
              </Link>
            </div>

            {toriActivity.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recent activity</p>
              </div>
            ) : (
              toriActivity.map((act) => {
                const cfg = activityTypeConfig[act.activity_type] ?? { label: act.activity_type, color: 'var(--accent)' }
                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-3"
                    style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: `${cfg.color}15`,
                        marginTop: 1,
                      }}
                    >
                      <Zap size={10} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {act.title}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 7px',
                        borderRadius: 20,
                        background: `${cfg.color}15`,
                        color: cfg.color,
                        fontWeight: 600,
                        flexShrink: 0,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom 3-col grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Health ring */}
        <div
          className="rounded-xl flex flex-col items-center justify-center"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            padding: '24px 20px',
            gap: 0,
          }}
        >
          <HealthRing
            score={stats.healthScore}
            criticalAlerts={stats.criticalAlerts}
            highAlerts={stats.highAlerts}
            mediumAlerts={stats.mediumAlerts}
          />
        </div>

        {/* Active sources */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div
            style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Active Sources
            </span>
          </div>

          <div style={{ padding: '12px 20px' }}>
            {activeSources.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>No sources connected</p>
                <Link href="/sources">
                  <button
                    style={{
                      fontSize: 12,
                      padding: '6px 14px',
                      borderRadius: 8,
                      background: 'var(--accent-dim)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(var(--accent-rgb),0.2)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Connect first source
                  </button>
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeSources.map((src) => {
                  const dot = sourceTypeColor[src.type] ?? 'var(--text-muted)'
                  return (
                    <div key={src.id} className="flex items-center gap-2.5">
                      {/* 6px type dot */}
                      <span
                        className="flex-shrink-0 rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          background: dot,
                          boxShadow: `0 0 5px ${dot}99`,
                        }}
                      />
                      <span
                        className="flex-1 truncate"
                        style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}
                      >
                        {src.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                          fontWeight: 500,
                        }}
                      >
                        {src.messagesCount > 0 ? `${src.messagesCount} msg` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Brain status */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div
            className="flex items-center gap-2"
            style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <Brain size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Brain Status
            </span>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <BrainRow label="KB Rules Active" value={brainStatus.kbRulesActive} color="var(--accent)" accent />
            <BrainRow label="Messages Today"  value={brainStatus.messagesToday} color="var(--severity-low)" accent />
            <BrainRow label="Contexts Today"  value={brainStatus.contextsToday} color="var(--accent)" accent />
            <BrainRow
              label="Topics Tracked"
              value="—"
              color="var(--text-muted)"
              tooltip="Topic generation not yet active"
            />

            {/* Last-activity footer */}
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>
              Last activity: <LastActivity at={brainStatus.lastActivityAt} />
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Last-activity ticker ──────────────────────────────────────────────── */
function LastActivity({ at }: { at: string | null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  if (!at) return <>—</>
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60_000)
  if (mins < 1)  return <>just now</>
  if (mins < 60) return <>{mins} min ago</>
  const hours = Math.round(mins / 60)
  if (hours < 24) return <>{hours} {hours === 1 ? 'hour' : 'hours'} ago</>
  const days = Math.round(hours / 24)
  return <>{days} {days === 1 ? 'day' : 'days'} ago</>
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function BrainRow({
  label,
  value,
  color,
  accent,
  tooltip,
}: {
  label: string
  value: number | string
  color: string
  accent?: boolean
  tooltip?: string
}) {
  const isNumeric = typeof value === 'number'
  const live = accent && isNumeric && value > 0
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span
        title={tooltip}
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: live ? color : 'var(--text-muted)',
          letterSpacing: '-0.02em',
          cursor: tooltip ? 'help' : 'default',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'var(--severity-critical)',
    high:     'var(--severity-high)',
    medium:   'var(--severity-medium)',
    low:      'var(--severity-low)',
  }
  const c = colors[severity] ?? 'var(--text-muted)'
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{
        width: 6,
        height: 6,
        background: c,
        boxShadow: `0 0 4px ${c}99`,
        marginTop: 5,
      }}
    />
  )
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: React.ElementType
  title: string
  desc: string
  href: string
  cta: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 20px', textAlign: 'center' }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{desc}</p>
      </div>
      <Link href={href}>
        <button
          style={{
            fontSize: 11,
            padding: '5px 12px',
            borderRadius: 7,
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid rgba(var(--accent-rgb),0.2)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {cta}
        </button>
      </Link>
    </div>
  )
}
