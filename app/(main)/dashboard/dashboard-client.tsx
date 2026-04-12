'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Phone, Eye, FileText, AlertTriangle, CheckCircle2,
  Activity, ShieldCheck, Brain, Bot, ChevronRight, Zap, RefreshCw,
} from 'lucide-react'
import { SeverityBadge } from '@/components/ui/severity-badge'
import type { MessageContext, Alert, Source, ToriActivityLog, DashboardStats, AlertSeverity } from '@/types/database'

interface Props {
  stats: DashboardStats
  toriBannerMessage: string
  openContexts: (MessageContext & { source?: Source })[]
  recentAlerts: (Alert & { source?: Source })[]
  toriActivity: ToriActivityLog[]
  activeSources: (Source & { messagesCount: number })[]
  brainStatus: { kbRulesActive: number; messagesCount: number; contextsBuilt: number; topicsTracked: number }
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
function HealthRing({ score }: { score: number }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? 'var(--severity-low)' : score >= 60 ? 'var(--severity-high)' : score >= 40 ? 'var(--severity-high)' : 'var(--severity-critical)'
  const glowHex = score >= 80 ? '#56d364' : score >= 60 ? '#e3b341' : score >= 40 ? '#e3b341' : '#f85149'
  const label = score >= 80 ? 'Nominal' : score >= 60 ? 'Watch' : score >= 40 ? 'Alert' : 'Critical'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 108, height: 108 }}>
        <svg width="108" height="108" viewBox="0 0 108 108">
          {/* Track */}
          <circle cx="54" cy="54" r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="7" />
          {/* Tick marks */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * 360 - 90
            const rad = (angle * Math.PI) / 180
            const x1 = 54 + (r - 10) * Math.cos(rad)
            const y1 = 54 + (r - 10) * Math.sin(rad)
            const x2 = 54 + (r - 7) * Math.cos(rad)
            const y2 = 54 + (r - 7) * Math.sin(rad)
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="var(--border-subtle)"
                strokeWidth="1"
              />
            )
          })}
          {/* Progress arc */}
          <circle
            cx="54" cy="54" r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform="rotate(-90 54 54)"
            style={{ transition: 'stroke-dashoffset 1.2s ease-out', filter: `drop-shadow(0 0 6px ${glowHex}88)` }}
          />
          {/* Center score */}
          <text
            x="54" y="49"
            textAnchor="middle"
            fontSize="22"
            fontWeight="900"
            fill={color}
            fontFamily="inherit"
            style={{ letterSpacing: '-0.03em' }}
          >
            {score}
          </text>
          <text
            x="54" y="63"
            textAnchor="middle"
            fontSize="8"
            fontWeight="600"
            fill="var(--text-muted)"
            fontFamily="inherit"
            style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {label}
          </text>
        </svg>

        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${glowHex}08 0%, transparent 65%)`,
          }}
        />
      </div>

      <p className="text-xs font-medium text-center" style={{ color: 'var(--text-muted)' }}>
        {score >= 80
          ? 'Operations nominal'
          : score >= 60
          ? 'Attention needed'
          : 'Critical — review required'}
      </p>
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

/* ─── Main component ─────────────────────────────────────────────────────── */
export function DashboardClient(initialData: Props) {
  const [data, setData] = useState<Props>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [secondsAgo, setSecondsAgo] = useState(0)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/dashboard/stats')
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

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 60_000)
    return () => clearInterval(interval)
  }, [refresh])

  // Tick the "X seconds ago" counter
  useEffect(() => {
    const tick = setInterval(() => {
      if (lastUpdated) setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(tick)
  }, [lastUpdated])

  const { stats, toriBannerMessage, openContexts, recentAlerts, toriActivity, activeSources, brainStatus } = data
  const today = format(new Date(), 'EEEE, MMMM d')

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

        {/* Refresh controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {lastUpdated && (
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              Updated {secondsAgo < 60 ? `${secondsAgo}s ago` : formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
          <button
            onClick={refresh}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Situations"
          value={stats.openSituations}
          icon={AlertTriangle}
          glowColor="#3ecfcf"
          subtext="Across all sources"
        />
        <StatCard
          label="Resolved Today"
          value={stats.resolvedToday}
          icon={CheckCircle2}
          glowColor="#56d364"
          subtext="Since midnight CT"
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
      </div>

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
          <HealthRing score={stats.healthScore} />
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
            <BrainRow label="KB Rules Active"  value={brainStatus.kbRulesActive}  color="var(--accent)" />
            <BrainRow label="Messages Today"   value={brainStatus.messagesCount}  color="var(--severity-low)" />
            <BrainRow label="Contexts Built"   value={brainStatus.contextsBuilt}  color="var(--accent)" />
            <BrainRow
              label="Topics Tracked"
              value={brainStatus.topicsTracked}
              color="var(--severity-high)"
              accent={brainStatus.topicsTracked > 0}
            />

            {/* Mini activity bar */}
            <div style={{ marginTop: 4 }}>
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: 'var(--border-subtle)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (brainStatus.messagesCount / 100) * 100)}%`,
                    background: 'linear-gradient(90deg, var(--accent), rgba(var(--accent-rgb),0.5))',
                    borderRadius: 2,
                    transition: 'width 1s ease-out',
                  }}
                />
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, fontWeight: 500 }}>
                {brainStatus.messagesCount} messages processed today
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function BrainRow({
  label,
  value,
  color,
  accent,
}: {
  label: string
  value: number
  color: string
  accent?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: accent && value > 0 ? color : 'var(--text-muted)',
          letterSpacing: '-0.02em',
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
