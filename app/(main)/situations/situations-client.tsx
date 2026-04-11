'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Radio, Download, RefreshCw, Clock, AlertTriangle, ShieldCheck, CheckCircle2, Zap } from 'lucide-react'
import { SituationCard, type SituationData } from '@/components/situations/SituationCard'
import { SituationFilters, type StatusFilter, type DeptFilter } from '@/components/situations/SituationFilters'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  situations: SituationData[]
  isMock: boolean
}

export function SituationsClient({ situations, isMock }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deptFilter, setDeptFilter]   = useState<DeptFilter>('All')

  /* ── Counts for filter chips ── */
  const counts: Partial<Record<StatusFilter, number>> = {
    all:        situations.length,
    open:       situations.filter((s) => s.status === 'open' || s.status === 'escalated').length,
    kb_flagged: situations.filter((s) => s.kb_flagged).length,
    resolved:   situations.filter((s) => s.status === 'resolved').length,
    pending:    situations.filter((s) => s.status === 'unresolved').length,
  }

  /* ── Summary bar totals ── */
  const openCount     = counts.open ?? 0
  const kbCount       = counts.kb_flagged ?? 0
  const resolvedToday = situations.filter(
    (s) =>
      s.status === 'resolved' &&
      s.resolved_at &&
      new Date(s.resolved_at).toDateString() === new Date().toDateString()
  ).length

  /* ── Filter ── */
  const filtered = situations.filter((s) => {
    if (deptFilter !== 'All' && s.department !== deptFilter) return false
    switch (statusFilter) {
      case 'open':       return s.status === 'open' || s.status === 'escalated'
      case 'kb_flagged': return s.kb_flagged
      case 'pending':    return s.status === 'unresolved'
      case 'resolved':   return s.status === 'resolved'
      default:           return true
    }
  })

  /* ── Section groups ── */
  const urgent    = filtered.filter((s) => !s.kb_flagged && (s.severity_peak === 'critical' || s.severity_peak === 'high') && s.status !== 'resolved')
  const kbFlagged = filtered.filter((s) => s.kb_flagged && s.status !== 'resolved')
  const monitoring = filtered.filter((s) => !s.kb_flagged && s.severity_peak !== 'critical' && s.severity_peak !== 'high' && s.status !== 'resolved')
  const resolved   = filtered.filter((s) => s.status === 'resolved')

  const showEmpty = filtered.length === 0 && !isMock

  return (
    <div className="space-y-5 fade-up">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-[22px] font-extrabold tracking-tight"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            Situations
          </h1>
          <p className="text-[12px] mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
            Full lifecycle tracking · AI-synthesized threads · KB compliance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="btn-ghost text-[12px] py-1.5 px-3">
            <Download size={13} />
            Export
          </button>
          <button className="btn-accent text-[12px] py-1.5 px-3">
            <RefreshCw size={13} />
            Re-Analyze Now
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div
        className="flex items-center gap-5 px-5 py-3 rounded-xl flex-wrap"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <SummaryStat
          icon={<AlertTriangle size={13} style={{ color: 'var(--severity-critical)' }} />}
          label="Open"
          value={openCount}
          color="var(--severity-critical)"
        />
        <Divider />
        <SummaryStat
          icon={<Zap size={13} style={{ color: 'var(--kb-purple)' }} />}
          label="KB Flagged"
          value={kbCount}
          color="var(--kb-purple)"
        />
        <Divider />
        <SummaryStat
          icon={<CheckCircle2 size={13} style={{ color: '#56d364' }} />}
          label="Resolved Today"
          value={resolvedToday}
          color="#56d364"
        />
        <Divider />
        <SummaryStat
          icon={<Clock size={13} style={{ color: 'var(--accent)' }} />}
          label="Avg Resolution"
          value="—"
          color="var(--accent)"
        />

        {isMock && (
          <span
            className="ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full"
            style={{
              background: 'rgba(227,179,65,0.1)',
              color: '#e3b341',
              border: '1px solid rgba(227,179,65,0.2)',
            }}
          >
            Demo data — connect a source to see real situations
          </span>
        )}
      </div>

      {/* ── Filters ── */}
      <SituationFilters
        status={statusFilter}
        dept={deptFilter}
        totalCounts={counts}
        onStatus={setStatusFilter}
        onDept={setDeptFilter}
      />

      {/* ── Content ── */}
      {showEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-8 stagger">
          {urgent.length > 0 && (
            <section>
              <SectionLabel icon="🔴" label="Open & Urgent" count={urgent.length} />
              <div className="space-y-3">
                {urgent.map((s) => <SituationCard key={s.id} situation={s} />)}
              </div>
            </section>
          )}

          {kbFlagged.length > 0 && (
            <section>
              <SectionLabel icon="🟣" label="KB Violations" count={kbFlagged.length} />
              <div className="space-y-3">
                {kbFlagged.map((s) => <SituationCard key={s.id} situation={s} />)}
              </div>
            </section>
          )}

          {monitoring.length > 0 && (
            <section>
              <SectionLabel icon="⏳" label="Monitoring" count={monitoring.length} />
              <div className="space-y-3">
                {monitoring.map((s) => <SituationCard key={s.id} situation={s} />)}
              </div>
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <SectionLabel icon="✅" label="Resolved Today" count={resolved.length} />
              <div className="space-y-3">
                {resolved.map((s) => <SituationCard key={s.id} situation={s} />)}
              </div>
            </section>
          )}

          {filtered.length > 0 &&
            urgent.length === 0 &&
            kbFlagged.length === 0 &&
            monitoring.length === 0 &&
            resolved.length === 0 && (
              <div className="space-y-3">
                {filtered.map((s) => <SituationCard key={s.id} situation={s} />)}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ── */

function Divider() {
  return (
    <div
      className="w-px h-5 self-center"
      style={{ background: 'var(--border-subtle)' }}
    />
  )
}

function SummaryStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className="text-[14px] font-bold"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 py-20 rounded-2xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* SVG illustration */}
      <div className="relative">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="38" stroke="var(--border-default)" strokeWidth="1.5" />
          <circle cx="40" cy="40" r="28" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 3" />
          {/* Eye shape */}
          <ellipse cx="40" cy="40" rx="14" ry="9" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />
          <circle cx="40" cy="40" r="4" fill="var(--accent)" opacity="0.35" />
          <circle cx="40" cy="40" r="1.5" fill="var(--accent)" opacity="0.8" />
          {/* Scan lines */}
          <line x1="14" y1="40" x2="22" y2="40" stroke="var(--accent)" strokeWidth="1" opacity="0.3" />
          <line x1="58" y1="40" x2="66" y2="40" stroke="var(--accent)" strokeWidth="1" opacity="0.3" />
        </svg>
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}
        >
          <ShieldCheck size={10} style={{ color: 'var(--accent)' }} />
        </div>
      </div>

      <div className="text-center max-w-sm">
        <h3
          className="text-[17px] font-bold mb-2"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
        >
          No situations detected yet
        </h3>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          Once SATORI starts analyzing your Telegram channels, situations will
          appear here automatically. Connect a source to get started.
        </p>
      </div>

      <Link href="/sources">
        <button className="btn-accent">
          <Radio size={14} />
          Connect a Source
        </button>
      </Link>
    </div>
  )
}
