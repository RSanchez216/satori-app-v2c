'use client'

import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Phone, Eye, FileText, AlertTriangle, CheckCircle2,
  Activity, ShieldCheck, Brain, Radio, TrendingUp, TrendingDown, Minus,
  Bot, ChevronRight, Zap,
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

function StatCard({
  label,
  value,
  icon: Icon,
  accentColor,
  subtext,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  accentColor: string
  subtext?: string
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accentColor}18`, color: accentColor }}
        >
          <Icon size={15} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {subtext && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtext}</p>
        )}
      </div>
    </div>
  )
}

function HealthRing({ score }: { score: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? '#3ecfcf' : score >= 60 ? '#ffd166' : score >= 40 ? '#ff8c42' : '#ff4444'

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        <text x="50" y="54" textAnchor="middle" fontSize="20" fontWeight="bold" fill={color}>
          {score}
        </text>
      </svg>
      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Health Score</p>
    </div>
  )
}

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

export function DashboardClient({ stats, openThreads, recentAlerts, sources, toriActivity, brainStatus }: Props) {
  const today = format(new Date(), 'EEEE, MMMM d')

  return (
    <div className="space-y-6 fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{today}</p>
        </div>
      </div>

      {/* Tori briefing card */}
      <div
        className="relative rounded-xl p-6 overflow-hidden border"
        style={{
          background: 'linear-gradient(135deg, #0d2a2a 0%, #0d1117 60%, #0d1a2a 100%)',
          borderColor: 'rgba(62,207,207,0.25)',
        }}
      >
        {/* Glow orb */}
        <div
          className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #3ecfcf 0%, transparent 70%)' }}
        />

        <div className="relative flex items-start gap-4">
          {/* Tori avatar */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 accent-glow"
            style={{
              background: 'rgba(62,207,207,0.15)',
              color: 'var(--accent)',
              border: '2px solid rgba(62,207,207,0.4)',
            }}
          >
            <Bot size={22} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Tori</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(62,207,207,0.12)', color: 'var(--accent)' }}
              >
                AI Briefing
              </span>
            </div>

            {stats.openSituations === 0 && stats.kbViolations === 0 ? (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Good morning. All systems nominal — no open situations or compliance flags. Connect your first source below to start monitoring your fleet communications.
              </p>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                You have{' '}
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{stats.openSituations} open situation{stats.openSituations !== 1 ? 's' : ''}</span>
                {stats.kbViolations > 0 && (
                  <>
                    {' '}and{' '}
                    <span style={{ color: '#ff4444', fontWeight: 600 }}>{stats.kbViolations} KB violation{stats.kbViolations !== 1 ? 's' : ''}</span>
                  </>
                )}
                {' '}requiring attention. I've analyzed all incoming communications and flagged the items that need your review.
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Link href="/briefing">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: 'var(--accent)',
                    color: '#080d14',
                  }}
                >
                  <Phone size={12} />
                  Call Tori
                </button>
              </Link>
              <Link href="/situations">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: 'rgba(62,207,207,0.12)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(62,207,207,0.2)',
                  }}
                >
                  <Eye size={12} />
                  View Situations
                </button>
              </Link>
              <Link href="/reports">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <FileText size={12} />
                  Full Report
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Situations"
          value={stats.openSituations}
          icon={AlertTriangle}
          accentColor="#3ecfcf"
          subtext="Across all sources"
        />
        <StatCard
          label="Resolved Today"
          value={stats.resolvedToday}
          icon={CheckCircle2}
          accentColor="#6bcb77"
          subtext="Since midnight"
        />
        <StatCard
          label="Health Score"
          value={`${stats.healthScore}%`}
          icon={Activity}
          accentColor={stats.healthScore >= 80 ? '#3ecfcf' : stats.healthScore >= 60 ? '#ffd166' : '#ff4444'}
          subtext="Fleet operations"
        />
        <StatCard
          label="KB Violations"
          value={stats.kbViolations}
          icon={ShieldCheck}
          accentColor={stats.kbViolations > 0 ? '#ff4444' : '#6bcb77'}
          subtext="Open compliance flags"
        />
      </div>

      {/* Main 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open situations list */}
        <div
          className="rounded-xl border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Open Situations</h2>
            <Link href="/situations" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
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
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.02] block"
                  >
                    <StatusIcon size={15} style={{ color: status.color, marginTop: 2, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {thread.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {thread.department && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{thread.department}</span>
                        )}
                        {thread.severity_peak && (
                          <SeverityBadge severity={thread.severity_peak as AlertSeverity} />
                        )}
                        {thread.kb_flagged && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                            KB
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
                    </span>
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Recent alerts + Tori activity */}
        <div className="flex flex-col gap-4">
          {/* Recent alerts */}
          <div
            className="rounded-xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Alerts</h2>
              <Link href="/alerts" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                View all <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {recentAlerts.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active alerts</p>
                </div>
              ) : (
                recentAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-3 px-5 py-3">
                    <SeverityDot severity={alert.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {alert.title}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {alert.is_kb_violation && (
                      <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                        KB
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tori activity */}
          <div
            className="rounded-xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tori Activity</h2>
              <Link href="/briefing" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                Full log <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {toriActivity.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No recent activity</p>
                </div>
              ) : (
                toriActivity.map((act) => {
                  const cfg = activityTypeConfig[act.activity_type] ?? { label: act.activity_type, color: 'var(--accent)' }
                  return (
                    <div key={act.id} className="flex items-start gap-3 px-5 py-3">
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `${cfg.color}18` }}
                      >
                        <Zap size={10} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {act.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: `${cfg.color}15`, color: cfg.color }}
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
      </div>

      {/* Bottom 3-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Health ring */}
        <div
          className="rounded-xl border p-5 flex flex-col items-center gap-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <HealthRing score={stats.healthScore} />
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {stats.healthScore >= 80
                ? 'Operations nominal'
                : stats.healthScore >= 60
                ? 'Attention needed'
                : 'Critical — review required'}
            </p>
          </div>
        </div>

        {/* Active sources */}
        <div
          className="rounded-xl border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Active Sources</h2>
          </div>
          <div className="p-5">
            {sources.length === 0 ? (
              <div className="text-center py-2">
                <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No sources connected</p>
                <Link href="/sources">
                  <button
                    className="text-xs px-3 py-1.5 rounded-md"
                    style={{ background: 'rgba(62,207,207,0.12)', color: 'var(--accent)', border: '1px solid rgba(62,207,207,0.2)' }}
                  >
                    Connect first source
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((src) => (
                  <div key={src.id} className="flex items-center gap-2">
                    <Radio size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{src.name}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(62,207,207,0.1)', color: 'var(--accent)' }}
                    >
                      {src.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Brain status */}
        <div
          className="rounded-xl border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Brain size={14} style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Brain Status</h2>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <BrainRow label="KB Rules Active" value={brainStatus.kbRulesActive} />
            <BrainRow label="Threads Today" value={brainStatus.threadsToday} />
            <BrainRow label="AI Suggestions Pending" value={brainStatus.aiSuggestionsPending} accent={brainStatus.aiSuggestionsPending > 0} />
          </div>
        </div>
      </div>
    </div>
  )
}

function BrainRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className="text-sm font-semibold"
        style={{ color: accent && value > 0 ? '#ffd166' : 'var(--text-primary)' }}
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
  return (
    <div
      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
      style={{ background: colors[severity] ?? 'var(--text-muted)' }}
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
    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(62,207,207,0.08)' }}
      >
        <Icon size={18} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{desc}</p>
      </div>
      <Link href={href}>
        <button
          className="text-xs px-3 py-1.5 rounded-md"
          style={{ background: 'rgba(62,207,207,0.1)', color: 'var(--accent)', border: '1px solid rgba(62,207,207,0.2)' }}
        >
          {cta}
        </button>
      </Link>
    </div>
  )
}
