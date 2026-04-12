'use client'

import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Phone, Eye, FileText, AlertTriangle, CheckCircle2,
  Activity, ShieldCheck, Brain, Bot, ChevronRight, Zap,
} from 'lucide-react'
import { SeverityBadge } from '@/components/ui/severity-badge'
import type { TopicThread, Alert, Source, ToriActivityLog, DashboardStats, AlertSeverity } from '@/types/database'

interface Props {
  stats: DashboardStats
  openThreads: (TopicThread & { source?: Source })[]
  recentAlerts: Alert[]
  sources: Source[]
  toriActivity: ToriActivityLog[]
  brainStatus: { kbRulesActive: number; threadsToday: number; aiSuggestionsPending: number }
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
      style={{ background: '#0d1117', border: '1px solid #1a2332' }}
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
          style={{ color: '#3a4a5a', letterSpacing: '0.1em' }}
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
          style={{ color: '#e8edf2', letterSpacing: '-0.02em' }}
        >
          {value}
        </p>
        {subtext && (
          <p className="text-xs mt-1.5" style={{ color: '#3a4a5a' }}>{subtext}</p>
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
  const color = score >= 80 ? '#3ecfcf' : score >= 60 ? '#ffd166' : score >= 40 ? '#ff8c42' : '#ff4444'
  const label = score >= 80 ? 'Nominal' : score >= 60 ? 'Watch' : score >= 40 ? 'Alert' : 'Critical'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 108, height: 108 }}>
        <svg width="108" height="108" viewBox="0 0 108 108">
          {/* Track */}
          <circle cx="54" cy="54" r={r} fill="none" stroke="#1a2332" strokeWidth="7" />
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
                stroke="#1a2332"
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
            style={{ transition: 'stroke-dashoffset 1.2s ease-out', filter: `drop-shadow(0 0 6px ${color}88)` }}
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
            fill="#3a4a5a"
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
            background: `radial-gradient(circle at center, ${color}08 0%, transparent 65%)`,
          }}
        />
      </div>

      <p className="text-xs font-medium text-center" style={{ color: '#3a4a5a' }}>
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
const threadStatusConfig = {
  open:       { label: 'Open',       color: '#3ecfcf', icon: Activity },
  escalated:  { label: 'Escalated',  color: '#ff4444', icon: AlertTriangle },
  unresolved: { label: 'Unresolved', color: '#ff8c42', icon: AlertTriangle },
  resolved:   { label: 'Resolved',   color: '#6bcb77', icon: CheckCircle2 },
}

const activityTypeConfig: Record<string, { label: string; color: string }> = {
  call_outbound:  { label: 'Call Out',  color: '#3ecfcf' },
  call_inbound:   { label: 'Call In',   color: '#6bcb77' },
  telegram_sent:  { label: 'Telegram',  color: '#3ecfcf' },
  email_sent:     { label: 'Email',     color: '#a855f7' },
  kb_flagged:     { label: 'KB Flag',   color: '#ff4444' },
  synthesis:      { label: 'Synthesis', color: '#ffd166' },
  alert:          { label: 'Alert',     color: '#ff8c42' },
}

const sourceTypeColor: Record<string, string> = {
  telegram: '#3ecfcf',
  email:    '#a855f7',
  api:      '#ffd166',
  webhook:  '#6bcb77',
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function DashboardClient({ stats, openThreads, recentAlerts, sources, toriActivity, brainStatus }: Props) {
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
                color: '#e6edf3',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              Dashboard
            </h1>
            <span
              className="animate-pulse rounded-full"
              style={{ width: 6, height: 6, background: '#3ecfcf', display: 'inline-block', marginTop: 2, flexShrink: 0 }}
            />
          </div>
          <p style={{ fontSize: 11, color: '#3a4555', fontWeight: 500, letterSpacing: '0.02em' }}>
            {today} · {stats.openSituations > 0 ? `${stats.openSituations} open situations` : 'All clear'} · Tori active
          </p>
        </div>
      </div>

      {/* ── Tori briefing card ── */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0a1628 0%, #0d1f38 50%, #091525 100%)',
          border: '1px solid rgba(62,207,207,0.2)',
          padding: '20px 24px',
        }}
      >
        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(62,207,207,0.07) 1px, transparent 1px)',
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
            background: 'radial-gradient(circle, rgba(62,207,207,0.12) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex items-start gap-4">
          {/* Tori avatar with glow ring */}
          <div className="relative flex-shrink-0">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #0f2040, #162d4a)',
                border: '1.5px solid rgba(62,207,207,0.5)',
                boxShadow: '0 0 16px rgba(62,207,207,0.2), inset 0 0 10px rgba(62,207,207,0.05)',
                color: '#3ecfcf',
              }}
            >
              <Bot size={20} />
            </div>
            {/* Pulse indicator */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
              style={{
                background: '#3ecfcf',
                border: '2px solid #091525',
                boxShadow: '0 0 6px rgba(62,207,207,0.8)',
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3ecfcf' }}>Tori</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'rgba(62,207,207,0.7)',
                  background: 'rgba(62,207,207,0.1)',
                  border: '1px solid rgba(62,207,207,0.2)',
                  borderRadius: 20,
                  padding: '2px 8px',
                  letterSpacing: '0.04em',
                }}
              >
                AI BRIEFING
              </span>
            </div>

            {stats.openSituations === 0 && stats.kbViolations === 0 ? (
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#6a7e92' }}>
                Good morning. All systems nominal — no open situations or compliance flags. Connect your first source below to start monitoring your fleet communications.
              </p>
            ) : (
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#6a7e92' }}>
                You have{' '}
                <span style={{ color: '#c8d8e8', fontWeight: 600 }}>
                  {stats.openSituations} open situation{stats.openSituations !== 1 ? 's' : ''}
                </span>
                {stats.kbViolations > 0 && (
                  <>
                    {' '}and{' '}
                    <span style={{ color: '#ff4444', fontWeight: 600 }}>
                      {stats.kbViolations} KB violation{stats.kbViolations !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
                {' '}requiring attention. I've analyzed all incoming communications and flagged the items that need your review.
              </p>
            )}

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
                    background: '#3ecfcf',
                    color: '#060d18',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 12px rgba(62,207,207,0.3)',
                  }}
                >
                  <Phone size={12} /> Call Tori
                </button>
              </Link>
              <Link href="/situations">
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(62,207,207,0.1)',
                    color: '#3ecfcf',
                    border: '1px solid rgba(62,207,207,0.25)',
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
                    color: '#4a5a6a',
                    border: '1px solid #1a2332',
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
          glowColor="#6bcb77"
          subtext="Since midnight"
        />
        <StatCard
          label="Health Score"
          value={`${stats.healthScore}%`}
          icon={Activity}
          glowColor={stats.healthScore >= 80 ? '#3ecfcf' : stats.healthScore >= 60 ? '#ffd166' : '#ff4444'}
          subtext="Fleet operations"
        />
        <StatCard
          label="KB Violations"
          value={stats.kbViolations}
          icon={ShieldCheck}
          glowColor={stats.kbViolations > 0 ? '#ff4444' : '#6bcb77'}
          subtext="Open compliance flags"
        />
      </div>

      {/* ── Main 2-col grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Open situations */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid #1a2332' }}>
          <div
            className="flex items-center justify-between"
            style={{ padding: '14px 20px', borderBottom: '1px solid #1a2332' }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c8d8e8', letterSpacing: '-0.01em' }}>
              Open Situations
            </span>
            <Link
              href="/situations"
              className="flex items-center gap-1"
              style={{ fontSize: 11, color: '#3ecfcf', fontWeight: 600 }}
            >
              View all <ChevronRight size={11} />
            </Link>
          </div>

          <div>
            {openThreads.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="No open situations"
                desc="Connect a source to start monitoring."
                href="/sources"
                cta="Add source"
              />
            ) : (
              openThreads.map((thread) => {
                const status = threadStatusConfig[thread.status] ?? threadStatusConfig.open
                const StatusIcon = status.icon
                return (
                  <Link
                    key={thread.id}
                    href={`/situations/${thread.id}`}
                    className="flex items-start gap-3 transition-colors"
                    style={{ padding: '12px 20px', borderBottom: '1px solid #111820', display: 'flex' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.018)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
                  >
                    <StatusIcon
                      size={14}
                      style={{ color: status.color, marginTop: 1, flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#c8d8e8' }}>
                        {thread.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {thread.department && (
                          <span style={{ fontSize: 11, color: '#3a4a5a' }}>{thread.department}</span>
                        )}
                        {thread.severity_peak && (
                          <SeverityBadge severity={thread.severity_peak as AlertSeverity} />
                        )}
                        {thread.kb_flagged && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(168,85,247,0.12)',
                              color: '#a855f7',
                              fontWeight: 600,
                            }}
                          >
                            KB
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#3a4a5a', flexShrink: 0 }}>
                      {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
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
          <div className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid #1a2332' }}>
            <div
              className="flex items-center justify-between"
              style={{ padding: '14px 20px', borderBottom: '1px solid #1a2332' }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: '#c8d8e8', letterSpacing: '-0.01em' }}>
                Recent Alerts
              </span>
              <Link
                href="/alerts"
                className="flex items-center gap-1"
                style={{ fontSize: 11, color: '#3ecfcf', fontWeight: 600 }}
              >
                View all <ChevronRight size={11} />
              </Link>
            </div>

            {recentAlerts.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#3a4a5a' }}>No active alerts</p>
              </div>
            ) : (
              recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3"
                  style={{ padding: '10px 20px', borderBottom: '1px solid #111820' }}
                >
                  <SeverityDot severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: '#c8d8e8' }}>
                      {alert.title}
                    </p>
                    <p style={{ fontSize: 11, color: '#3a4a5a', marginTop: 2 }}>
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {alert.is_kb_violation && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'rgba(168,85,247,0.12)',
                        color: '#a855f7',
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
          <div className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid #1a2332' }}>
            <div
              className="flex items-center justify-between"
              style={{ padding: '14px 20px', borderBottom: '1px solid #1a2332' }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: '#c8d8e8', letterSpacing: '-0.01em' }}>
                Tori Activity
              </span>
              <Link
                href="/briefing"
                className="flex items-center gap-1"
                style={{ fontSize: 11, color: '#3ecfcf', fontWeight: 600 }}
              >
                Full log <ChevronRight size={11} />
              </Link>
            </div>

            {toriActivity.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#3a4a5a' }}>No recent activity</p>
              </div>
            ) : (
              toriActivity.map((act) => {
                const cfg = activityTypeConfig[act.activity_type] ?? { label: act.activity_type, color: '#3ecfcf' }
                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-3"
                    style={{ padding: '10px 20px', borderBottom: '1px solid #111820' }}
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
                      <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: '#c8d8e8' }}>
                        {act.title}
                      </p>
                      <p style={{ fontSize: 11, color: '#3a4a5a', marginTop: 2 }}>
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
            background: '#0d1117',
            border: '1px solid #1a2332',
            padding: '24px 20px',
            gap: 0,
          }}
        >
          <HealthRing score={stats.healthScore} />
        </div>

        {/* Active sources */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid #1a2332' }}>
          <div
            style={{ padding: '14px 20px', borderBottom: '1px solid #1a2332' }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c8d8e8', letterSpacing: '-0.01em' }}>
              Active Sources
            </span>
          </div>

          <div style={{ padding: '12px 20px' }}>
            {sources.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <p style={{ fontSize: 12, color: '#3a4a5a', marginBottom: 12 }}>No sources connected</p>
                <Link href="/sources">
                  <button
                    style={{
                      fontSize: 12,
                      padding: '6px 14px',
                      borderRadius: 8,
                      background: 'rgba(62,207,207,0.1)',
                      color: '#3ecfcf',
                      border: '1px solid rgba(62,207,207,0.2)',
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
                {sources.map((src) => {
                  const dot = sourceTypeColor[src.type] ?? '#4a5a6a'
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
                        style={{ fontSize: 12.5, fontWeight: 500, color: '#8a9aaa' }}
                      >
                        {src.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: `${dot}15`,
                          color: dot,
                          fontWeight: 600,
                          flexShrink: 0,
                          textTransform: 'capitalize',
                        }}
                      >
                        {src.type}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Brain status */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid #1a2332' }}>
          <div
            className="flex items-center gap-2"
            style={{ padding: '14px 20px', borderBottom: '1px solid #1a2332' }}
          >
            <Brain size={13} style={{ color: '#3ecfcf' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c8d8e8', letterSpacing: '-0.01em' }}>
              Brain Status
            </span>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <BrainRow label="KB Rules Active" value={brainStatus.kbRulesActive} color="#3ecfcf" />
            <BrainRow label="Threads Today" value={brainStatus.threadsToday} color="#6bcb77" />
            <BrainRow
              label="AI Suggestions Pending"
              value={brainStatus.aiSuggestionsPending}
              color={brainStatus.aiSuggestionsPending > 0 ? '#ffd166' : '#4a5a6a'}
              accent={brainStatus.aiSuggestionsPending > 0}
            />

            {/* Mini activity bar */}
            <div style={{ marginTop: 4 }}>
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: '#1a2332',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (brainStatus.threadsToday / 20) * 100)}%`,
                    background: 'linear-gradient(90deg, #3ecfcf, #3ecfcf88)',
                    borderRadius: 2,
                    transition: 'width 1s ease-out',
                  }}
                />
              </div>
              <p style={{ fontSize: 10, color: '#2a3a4a', marginTop: 5, fontWeight: 500 }}>
                Tori processed {brainStatus.threadsToday} threads today
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
      <span style={{ fontSize: 12, color: '#4a5a6a' }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: accent && value > 0 ? color : '#8a9aaa',
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
    critical: '#ff4444',
    high: '#ff8c42',
    medium: '#ffd166',
    low: '#6bcb77',
  }
  const c = colors[severity] ?? '#4a5a6a'
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
          background: 'rgba(62,207,207,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} style={{ color: '#3a4a5a' }} />
      </div>
      <div>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#6a7e92' }}>{title}</p>
        <p style={{ fontSize: 11, color: '#3a4a5a', marginTop: 4 }}>{desc}</p>
      </div>
      <Link href={href}>
        <button
          style={{
            fontSize: 11,
            padding: '5px 12px',
            borderRadius: 7,
            background: 'rgba(62,207,207,0.08)',
            color: '#3ecfcf',
            border: '1px solid rgba(62,207,207,0.2)',
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
