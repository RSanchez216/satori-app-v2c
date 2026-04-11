'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Bell, ShieldAlert, CheckCircle2, X, Clock, ExternalLink,
  Bot, Filter,
} from 'lucide-react'
import { SeverityBadge } from '@/components/ui/severity-badge'
import { createClient } from '@/lib/supabase/client'
import type { Alert, Source, KnowledgeBaseEntry, AlertSeverity, AlertStatus } from '@/types/database'

type FilterSeverity = AlertSeverity | 'all'
type FilterStatus = AlertStatus | 'active' | 'all'

const SEVERITY_ORDER: AlertSeverity[] = ['critical', 'high', 'medium', 'low']
const DEPT_FILTERS = ['All Depts', 'Dispatch', 'Safety', 'Maintenance', 'Driver', 'Finance']

interface Props {
  initialAlerts: (Alert & { source?: Source; knowledge_base_entry?: KnowledgeBaseEntry })[]
}

export function AlertsClient({ initialAlerts }: Props) {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('active')
  const [filterDept, setFilterDept] = useState('All Depts')

  const filtered = alerts
    .filter((a) => {
      if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false
      if (filterStatus === 'active' && !['open', 'acknowledged'].includes(a.status)) return false
      if (filterStatus !== 'active' && filterStatus !== 'all' && a.status !== filterStatus) return false
      if (filterDept !== 'All Depts' && a.department !== filterDept) return false
      return true
    })
    .sort((a, b) => {
      const si = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      if (si !== 0) return si
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const counts = {
    all: alerts.length,
    active: alerts.filter((a) => ['open', 'acknowledged'].includes(a.status)).length,
    critical: alerts.filter((a) => a.severity === 'critical' && ['open', 'acknowledged'].includes(a.status)).length,
    kbViolations: alerts.filter((a) => a.is_kb_violation && ['open', 'acknowledged'].includes(a.status)).length,
  }

  async function updateAlertStatus(id: string, status: AlertStatus) {
    const supabase = createClient()
    const updates: Partial<Alert> = { status }
    if (status === 'acknowledged') updates.acknowledged_at = new Date().toISOString()
    if (status === 'resolved') updates.resolved_at = new Date().toISOString()

    await supabase.from('alerts').update(updates).eq('id', id)

    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, ...updates }
          : a
      )
    )
  }

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Severity-ranked operational alerts from all sources
          </p>
        </div>
        {/* Summary pills */}
        <div className="flex items-center gap-2">
          {counts.critical > 0 && (
            <span
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: 'rgba(255,68,68,0.12)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff4444' }} />
              {counts.critical} Critical
            </span>
          )}
          {counts.kbViolations > 0 && (
            <span
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <ShieldAlert size={11} />
              {counts.kbViolations} KB Violation{counts.kbViolations !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-3 p-3 rounded-xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Status filter */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'active', label: `Active (${counts.active})` },
              { id: 'all',    label: `All (${counts.all})` },
              { id: 'resolved', label: 'Resolved' },
              { id: 'dismissed', label: 'Dismissed' },
            ] as { id: FilterStatus; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: filterStatus === tab.id ? 'rgba(62,207,207,0.12)' : 'transparent',
                color: filterStatus === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: filterStatus === tab.id ? '1px solid rgba(62,207,207,0.2)' : '1px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* Severity filter */}
        <div className="flex items-center gap-1">
          <Filter size={12} style={{ color: 'var(--text-muted)' }} />
          {(['all', 'critical', 'high', 'medium', 'low'] as FilterSeverity[]).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className="px-2.5 py-1 rounded text-xs transition-all capitalize"
              style={{
                background: filterSeverity === sev ? 'rgba(62,207,207,0.08)' : 'transparent',
                color: filterSeverity === sev ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {sev}
            </button>
          ))}
        </div>

        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* Dept filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {DEPT_FILTERS.map((dept) => (
            <button
              key={dept}
              onClick={() => setFilterDept(dept)}
              className="px-2 py-1 rounded text-xs transition-all"
              style={{
                background: filterDept === dept ? 'rgba(62,207,207,0.08)' : 'transparent',
                color: filterDept === dept ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {dept}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Alert list */}
      {filtered.length === 0 ? (
        <EmptyAlerts hasSome={alerts.length > 0} />
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAction={updateAlertStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AlertCard({
  alert,
  onAction,
}: {
  alert: Alert & { source?: Source; knowledge_base_entry?: KnowledgeBaseEntry }
  onAction: (id: string, status: AlertStatus) => void
}) {
  const isKb = alert.is_kb_violation
  const isDismissed = alert.status === 'dismissed'
  const isResolved = alert.status === 'resolved'
  const isAcknowledged = alert.status === 'acknowledged'

  return (
    <div
      className="rounded-xl border transition-all"
      style={{
        background: 'var(--bg-card)',
        borderColor: isKb
          ? 'rgba(168,85,247,0.3)'
          : isDismissed || isResolved
          ? 'var(--border)'
          : severityBorderColor(alert.severity),
        opacity: isDismissed ? 0.5 : 1,
        borderLeft: `3px solid ${isKb ? '#a855f7' : severityColor(alert.severity)}`,
      }}
    >
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Severity indicator */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            background: isKb ? 'rgba(168,85,247,0.12)' : `${severityColor(alert.severity)}18`,
            color: isKb ? '#a855f7' : severityColor(alert.severity),
          }}
        >
          {isKb ? <ShieldAlert size={15} /> : <Bell size={15} />}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <SeverityBadge severity={alert.severity} />
            {isKb && (
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}
              >
                <ShieldAlert size={10} /> KB Violation
              </span>
            )}
            {isAcknowledged && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(62,207,207,0.08)', color: 'var(--accent)' }}
              >
                Acknowledged
              </span>
            )}
            {isResolved && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(107,203,119,0.1)', color: '#6bcb77' }}
              >
                Resolved
              </span>
            )}
          </div>

          <p className="text-sm font-medium mt-1.5" style={{ color: 'var(--text-primary)' }}>
            {alert.title}
          </p>

          {alert.description && (
            <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {alert.description}
            </p>
          )}

          {/* KB entry link */}
          {alert.knowledge_base_entry && (
            <p className="text-xs mt-1.5" style={{ color: '#a855f7' }}>
              KB Rule: {alert.knowledge_base_entry.title}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {alert.source && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {alert.source.name}
              </span>
            )}
            {alert.department && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                {alert.department}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Clock size={10} />
              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Actions */}
        {!isDismissed && !isResolved && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Ask Tori */}
            <a href="/briefing">
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: 'rgba(62,207,207,0.08)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(62,207,207,0.15)',
                }}
                title="Ask Tori about this alert"
              >
                <Bot size={12} />
                Ask Tori
              </button>
            </a>

            {/* Linked situation */}
            {alert.thread_id && (
              <a href={`/situations/${alert.thread_id}`}>
                <button
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                  title="View linked situation"
                >
                  <ExternalLink size={12} />
                  Situation
                </button>
              </a>
            )}

            {/* Acknowledge (only if open) */}
            {alert.status === 'open' && (
              <button
                onClick={() => onAction(alert.id, 'acknowledged')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: 'rgba(255,209,102,0.08)',
                  color: '#ffd166',
                  border: '1px solid rgba(255,209,102,0.2)',
                }}
                title="Acknowledge"
              >
                <Clock size={12} />
                Ack
              </button>
            )}

            {/* Resolve */}
            <button
              onClick={() => onAction(alert.id, 'resolved')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: 'rgba(107,203,119,0.08)',
                color: '#6bcb77',
                border: '1px solid rgba(107,203,119,0.2)',
              }}
              title="Mark resolved"
            >
              <CheckCircle2 size={12} />
              Resolve
            </button>

            {/* Dismiss */}
            <button
              onClick={() => onAction(alert.id, 'dismissed')}
              className="w-7 h-7 rounded-md flex items-center justify-center transition-all"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function severityColor(severity: AlertSeverity): string {
  const map: Record<AlertSeverity, string> = {
    critical: '#ff4444',
    high: '#ff8c42',
    medium: '#ffd166',
    low: '#6bcb77',
  }
  return map[severity] ?? 'var(--accent)'
}

function severityBorderColor(severity: AlertSeverity): string {
  const map: Record<AlertSeverity, string> = {
    critical: 'rgba(255,68,68,0.3)',
    high: 'rgba(255,140,66,0.3)',
    medium: 'rgba(255,209,102,0.3)',
    low: 'rgba(107,203,119,0.3)',
  }
  return map[severity] ?? 'var(--border)'
}

function EmptyAlerts({ hasSome }: { hasSome: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-4 py-16 rounded-xl border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(62,207,207,0.08)' }}
      >
        <Bell size={24} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {hasSome ? 'No alerts match this filter' : 'No alerts yet'}
        </p>
        <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>
          {hasSome
            ? 'Try adjusting your severity or department filters.'
            : 'Tori will automatically generate alerts when she detects situations requiring your attention.'}
        </p>
      </div>
    </div>
  )
}
