'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Radio, Download, RefreshCw, Clock, AlertTriangle, ShieldCheck, CheckCircle2, Zap, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SituationCard, type SituationData } from '@/components/situations/SituationCard'
import { SituationFilters, type StatusFilter, type DeptFilter } from '@/components/situations/SituationFilters'
import { ThreadPanel } from '@/components/situations/ThreadPanel'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  situations:        SituationData[]
  departments:       string[]
  activeSourceCount: number
}

/**
 * Resolution tracking is not yet implemented (no resolved_at column on
 * message_contexts, no resolve workflow). Both Resolved Today and Avg
 * Resolution show em-dashes with a tooltip explaining the gap.
 */
const RESOLUTION_TOOLTIP = 'Resolution tracking is not yet implemented. Coming in a future release.'

export function SituationsClient({ situations, departments, activeSourceCount }: Props) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deptFilter,   setDeptFilter]   = useState<DeptFilter>('All')
  const [threadSit,    setThreadSit]    = useState<SituationData | null>(null)
  const [reanalyzing,  setReanalyzing]  = useState(false)

  /**
   * Tab filter logic (page is scoped to today CT in page.tsx, so all counts
   * are today-only):
   *   - all:        no filter — every today-CT context
   *   - open:       alert-worthy AND ai_status not 'resolved'
   *                 (status derives 'open' from alert_worthy=true; 'escalated' is legacy)
   *   - kb_flagged: kb_violation_count > 0 (sourced from new kb_violations table)
   *   - pending:    not alert-worthy AND ai_status not 'resolved'
   *                 (status derives 'pending' when alert_worthy=false; 'unresolved' is legacy)
   *   - resolved:   ai_status = 'resolved' — no resolve workflow yet, so this is
   *                 effectively always empty; kept visible to preview the future shape.
   * Tabs may overlap (e.g., a KB-flagged context can also be Open). The invariant
   * is `all` = total distinct today-CT contexts; the others are filtered subsets.
   */
  const filtered = situations.filter((s) => {
    if (deptFilter !== 'All' && s.department !== deptFilter) return false
    switch (statusFilter) {
      case 'open':       return s.status === 'open' || s.status === 'escalated'
      case 'kb_flagged': return (s.kb_violation_count ?? 0) > 0
      case 'pending':    return s.status === 'pending' || s.status === 'unresolved'
      case 'resolved':   return s.status === 'resolved'
      default:           return true
    }
  })

  /* ── Counts ── */
  const counts: Partial<Record<StatusFilter, number>> = {
    all:        situations.length,
    open:       situations.filter((s) => s.status === 'open' || s.status === 'escalated').length,
    kb_flagged: situations.filter((s) => (s.kb_violation_count ?? 0) > 0).length,
    pending:    situations.filter((s) => s.status === 'pending' || s.status === 'unresolved').length,
    resolved:   situations.filter((s) => s.status === 'resolved').length,
  }

  /* ── Summary bar stats ── */
  const openCount = counts.open ?? 0
  const kbCount   = counts.kb_flagged ?? 0

  /* ── Section groups ── */
  const urgent    = filtered.filter((s) => !s.kb_flagged && (s.severity_peak === 'critical' || s.severity_peak === 'high') && s.status !== 'resolved')
  const kbFlagged = filtered.filter((s) => s.kb_flagged && s.status !== 'resolved')
  const monitoring = filtered.filter((s) => !s.kb_flagged && s.severity_peak !== 'critical' && s.severity_peak !== 'high' && s.status !== 'resolved' && s.status !== 'pending')
  const pending   = filtered.filter((s) => s.status === 'pending' || s.status === 'unresolved')
  const resolved  = filtered.filter((s) => s.status === 'resolved')

  /* ── Re-analyze ── */
  async function handleReanalyze() {
    setReanalyzing(true)
    try {
      await fetch('/api/ai/build-context', { method: 'POST' })
      toast.success('Re-analysis triggered — refresh in a moment')
      setTimeout(() => router.refresh(), 3000)
    } catch {
      toast.error('Failed to trigger re-analysis')
    } finally {
      setReanalyzing(false)
    }
  }

  /* ── CSV export ── */
  function handleExport() {
    const headers = ['ID', 'Title', 'Department', 'Severity', 'Status', 'Started At', 'Messages', 'Source', 'KB Flagged', 'Summary']
    const rows = filtered.map((s) => [
      s.id,
      s.title,
      s.department ?? '',
      s.severity_peak ?? '',
      s.status,
      s.started_at ?? '',
      String(s.message_count),
      s.source_name ?? '',
      s.kb_flagged ? 'Yes' : 'No',
      (s.synthesis_text ?? s.summary ?? '').replace(/"/g, '""'),
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${v}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `situations-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${filtered.length} situations`)
  }

  const showEmpty = filtered.length === 0

  return (
    <div className="space-y-5 fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Situations
          </h1>
          <p className="text-[12px] mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
            Full lifecycle tracking · AI-synthesized threads · KB compliance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="btn-ghost text-[12px] py-1.5 px-3" onClick={handleExport} disabled={filtered.length === 0}>
            <Download size={13} /> Export
          </button>
          <button className="btn-accent text-[12px] py-1.5 px-3" onClick={handleReanalyze} disabled={reanalyzing}>
            {reanalyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Re-Analyze Now
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div
        className="flex items-center gap-5 px-5 py-3 rounded-xl flex-wrap"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <SummaryStat
          icon={<AlertTriangle size={13} style={{ color: 'var(--severity-critical)' }} />}
          label="Open" value={openCount} color="var(--severity-critical)"
        />
        <Divider />
        <SummaryStat
          icon={<Zap size={13} style={{ color: 'var(--kb-purple)' }} />}
          label="KB Flagged" value={kbCount} color="var(--kb-purple)"
        />
        <Divider />
        <SummaryStat
          icon={<CheckCircle2 size={13} style={{ color: 'var(--severity-low)' }} />}
          label="Resolved Today" value="—" color="var(--text-muted)"
          tooltip={RESOLUTION_TOOLTIP}
        />
        <Divider />
        <SummaryStat
          icon={<Clock size={13} style={{ color: 'var(--accent)' }} />}
          label="Avg Resolution" value="—" color="var(--text-muted)"
          tooltip={RESOLUTION_TOOLTIP}
        />
      </div>

      {/* Filters */}
      <SituationFilters
        status={statusFilter}
        dept={deptFilter}
        depts={departments}
        totalCounts={counts}
        onStatus={setStatusFilter}
        onDept={setDeptFilter}
      />

      {/* Content */}
      {showEmpty ? (
        statusFilter === 'resolved'
          ? <ResolvedNotImplemented />
          : <EmptyState activeSourceCount={activeSourceCount} />
      ) : (
        <div className="space-y-8 stagger">
          {urgent.length > 0 && (
            <section>
              <SectionLabel icon="🔴" label="Open & Urgent" count={urgent.length} />
              <div className="space-y-3">
                {urgent.map((s) => (
                  <SituationCard key={s.id} situation={s} onViewThread={setThreadSit} />
                ))}
              </div>
            </section>
          )}

          {kbFlagged.length > 0 && (
            <section>
              <SectionLabel icon="🟣" label="KB Violations" count={kbFlagged.length} />
              <div className="space-y-3">
                {kbFlagged.map((s) => (
                  <SituationCard key={s.id} situation={s} onViewThread={setThreadSit} />
                ))}
              </div>
            </section>
          )}

          {monitoring.length > 0 && (
            <section>
              <SectionLabel icon="⏳" label="Monitoring" count={monitoring.length} />
              <div className="space-y-3">
                {monitoring.map((s) => (
                  <SituationCard key={s.id} situation={s} onViewThread={setThreadSit} />
                ))}
              </div>
            </section>
          )}

          {pending.length > 0 && (
            <section>
              <SectionLabel icon="🔵" label="Pending Analysis" count={pending.length} />
              <div className="space-y-3">
                {pending.map((s) => (
                  <SituationCard key={s.id} situation={s} onViewThread={setThreadSit} />
                ))}
              </div>
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <SectionLabel icon="✅" label="Resolved" count={resolved.length} />
              <div className="space-y-3">
                {resolved.map((s) => (
                  <SituationCard key={s.id} situation={s} onViewThread={setThreadSit} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Thread side panel */}
      {threadSit && (
        <ThreadPanel
          situation={threadSit}
          onClose={() => setThreadSit(null)}
        />
      )}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function Divider() {
  return <div className="w-px h-5 self-center" style={{ background: 'var(--border-subtle)' }} />
}

function SummaryStat({ icon, label, value, color, tooltip }: { icon: React.ReactNode; label: string; value: number | string; color: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[14px] font-bold" style={{ color }}>{value}</span>
      {tooltip && (
        <span
          title={tooltip}
          style={{
            width: 14, height: 14, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800,
            background: 'var(--border-subtle)', color: 'var(--text-muted)',
            cursor: 'help', flexShrink: 0,
          }}
        >?</span>
      )}
    </div>
  )
}

function ResolvedNotImplemented() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 rounded-2xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <CheckCircle2 size={20} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="text-center max-w-sm px-6">
        <h3 className="text-[15px] font-bold mb-1.5" style={{ color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>
          Resolution tracking is not yet implemented
        </h3>
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Once a resolve workflow ships, situations marked resolved will appear here with their resolution time.
        </p>
      </div>
    </div>
  )
}

function EmptyState({ activeSourceCount }: { activeSourceCount: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 py-20 rounded-2xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="relative">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="38" stroke="var(--border-default)" strokeWidth="1.5" />
          <circle cx="40" cy="40" r="28" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 3" />
          <ellipse cx="40" cy="40" rx="14" ry="9" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />
          <circle cx="40" cy="40" r="4" fill="var(--accent)" opacity="0.35" />
          <circle cx="40" cy="40" r="1.5" fill="var(--accent)" opacity="0.8" />
          <line x1="14" y1="40" x2="22" y2="40" stroke="var(--accent)" strokeWidth="1" opacity="0.3" />
          <line x1="58" y1="40" x2="66" y2="40" stroke="var(--accent)" strokeWidth="1" opacity="0.3" />
        </svg>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
          <ShieldCheck size={10} style={{ color: 'var(--accent)' }} />
        </div>
      </div>

      <div className="text-center max-w-sm">
        <h3 className="text-[17px] font-bold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          No situations detected yet
        </h3>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {activeSourceCount > 0
            ? `Tori is monitoring ${activeSourceCount} active source${activeSourceCount !== 1 ? 's' : ''}. Situations will appear here as messages are analyzed.`
            : 'Connect a source and Tori will start analyzing messages and detecting situations automatically.'}
        </p>
      </div>

      {activeSourceCount === 0 && (
        <Link href="/sources">
          <button className="btn-accent">
            <Radio size={14} /> Connect a Source
          </button>
        </Link>
      )}
    </div>
  )
}
