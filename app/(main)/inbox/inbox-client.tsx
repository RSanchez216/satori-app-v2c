'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Inbox, MessageSquare, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle2, User, Truck, Package, ShieldAlert, Eye, Clock,
} from 'lucide-react'
import { SeverityBadge } from '@/components/ui/severity-badge'
import type { MessageContext, Source, AlertSeverity } from '@/types/database'

type FilterTab = 'all' | 'unread' | 'alert_worthy' | 'needs_review'

const DEPT_FILTERS = ['All Depts', 'Dispatch', 'Safety', 'Maintenance', 'Driver', 'Finance']

interface Props {
  contexts: (MessageContext & { source?: Source })[]
}

export function InboxClient({ contexts }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [activeDept, setActiveDept] = useState('All Depts')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = contexts.filter((ctx) => {
    if (activeTab === 'unread' && !isUnread(ctx)) return false
    if (activeTab === 'alert_worthy' && !ctx.alert_worthy) return false
    if (activeTab === 'needs_review' && !ctx.needs_review) return false
    if (activeDept !== 'All Depts' && ctx.department !== activeDept) return false
    return true
  })

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Context Inbox</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          AI-analyzed message conversations grouped by context
        </p>
      </div>

      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-3 p-3 rounded-xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
              { id: 'alert_worthy', label: 'Alert-Worthy' },
              { id: 'needs_review', label: 'Needs Review' },
            ] as { id: FilterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: activeTab === tab.id ? 'rgba(62,207,207,0.12)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: activeTab === tab.id ? '1px solid rgba(62,207,207,0.2)' : '1px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* Dept filters */}
        <div className="flex items-center gap-1 flex-wrap">
          {DEPT_FILTERS.map((dept) => (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              className="px-2.5 py-1 rounded text-xs transition-all"
              style={{
                background: activeDept === dept ? 'rgba(62,207,207,0.08)' : 'transparent',
                color: activeDept === dept ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {dept}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} context{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Context list */}
      {filtered.length === 0 ? (
        <EmptyInbox hasData={contexts.length > 0} />
      ) : (
        <div className="space-y-2">
          {filtered.map((ctx) => (
            <ContextCard
              key={ctx.id}
              ctx={ctx}
              isExpanded={expanded === ctx.id}
              onToggle={() => setExpanded(expanded === ctx.id ? null : ctx.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function isUnread(ctx: MessageContext): boolean {
  return ctx.ai_status !== 'done' || ctx.needs_review
}

function ContextCard({
  ctx,
  isExpanded,
  onToggle,
}: {
  ctx: MessageContext & { source?: Source }
  isExpanded: boolean
  onToggle: () => void
}) {
  const unread = isUnread(ctx)
  const entities = ctx.entities_json as Record<string, string> | null

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{
        background: 'var(--bg-card)',
        borderColor: unread ? 'rgba(62,207,207,0.3)' : 'var(--border)',
        borderLeft: unread ? '3px solid var(--accent)' : '3px solid transparent',
      }}
    >
      {/* Card header — always visible */}
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-3"
        onClick={onToggle}
      >
        {/* Unread dot */}
        {unread && (
          <div
            className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
            style={{ background: 'var(--accent)' }}
          />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Source */}
            {ctx.source && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(62,207,207,0.08)', color: 'var(--accent)' }}
              >
                {ctx.source.name}
              </span>
            )}
            {/* Topic */}
            {ctx.topic_name && (
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {ctx.topic_name}
              </span>
            )}
            {/* Severity */}
            {ctx.severity && <SeverityBadge severity={ctx.severity as AlertSeverity} />}
            {/* Alert-worthy */}
            {ctx.alert_worthy && (
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,140,66,0.1)', color: '#ff8c42' }}
              >
                <AlertTriangle size={10} /> Alert
              </span>
            )}
            {/* Needs review */}
            {ctx.needs_review && (
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,209,102,0.1)', color: '#ffd166' }}
              >
                <Eye size={10} /> Review
              </span>
            )}
            {/* KB status */}
            {ctx.confidence != null && ctx.confidence < 60 && (
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}
              >
                <ShieldAlert size={10} /> KB
              </span>
            )}
          </div>

          {/* Summary */}
          <p className="text-sm mt-1.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
            {ctx.context_preview ?? ctx.summary ?? 'No summary available'}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <MessageSquare size={10} />
              {ctx.message_count} msg{ctx.message_count !== 1 ? 's' : ''}
            </span>
            {ctx.primary_sender && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <User size={10} />
                {ctx.primary_sender}
              </span>
            )}
            {ctx.department && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                {ctx.department}
              </span>
            )}
            {/* Entities */}
            {entities?.driver && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Truck size={10} /> {entities.driver}
              </span>
            )}
            {entities?.load && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Package size={10} /> {entities.load}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
              <Clock size={10} />
              {ctx.created_at ? formatDistanceToNow(new Date(ctx.created_at), { addSuffix: true }) : '—'}
            </span>
          </div>
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 mt-0.5">
          {isExpanded
            ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} />
            : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div
          className="px-5 pb-5 border-t space-y-4"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* AI Summary */}
          {ctx.summary && (
            <div className="pt-4">
              <p className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                AI Summary
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {ctx.summary}
              </p>
            </div>
          )}

          {/* Recommended action */}
          {ctx.recommended_action && (
            <div
              className="p-3 rounded-lg"
              style={{ background: 'rgba(62,207,207,0.06)', border: '1px solid rgba(62,207,207,0.12)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>
                Recommended Action
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {ctx.recommended_action}
              </p>
            </div>
          )}

          {/* Rationale */}
          {ctx.rationale && (
            <div>
              <p className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                AI Rationale
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {ctx.rationale}
              </p>
            </div>
          )}

          {/* Full context text */}
          {ctx.context_text && (
            <div>
              <p className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Raw Context
              </p>
              <pre
                className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap"
                style={{
                  background: 'var(--bg-primary)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  fontFamily: 'monospace',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {ctx.context_text}
              </pre>
            </div>
          )}

          {/* Confidence + AI status */}
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>AI: <span style={{ color: aiStatusColor(ctx.ai_status) }}>{ctx.ai_status}</span></span>
            {ctx.confidence != null && (
              <span>Confidence: <span style={{ color: 'var(--text-secondary)' }}>{ctx.confidence}%</span></span>
            )}
            {ctx.analyzed_at && (
              <span>Analyzed {formatDistanceToNow(new Date(ctx.analyzed_at), { addSuffix: true })}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function aiStatusColor(status: string) {
  if (status === 'done') return '#6bcb77'
  if (status === 'processing') return '#ffd166'
  if (status === 'failed') return '#ff4444'
  return 'var(--text-muted)'
}

function EmptyInbox({ hasData }: { hasData: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-4 py-16 rounded-xl border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(62,207,207,0.08)' }}
      >
        <Inbox size={24} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {hasData ? 'No contexts match this filter' : 'Context Inbox is empty'}
        </p>
        <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>
          {hasData
            ? 'Try selecting a different filter or department.'
            : 'Once you connect a Telegram source, Tori will analyze incoming messages and group them here automatically.'}
        </p>
      </div>
      {!hasData && (
        <a href="/sources">
          <button
            className="text-xs px-4 py-2 rounded-md"
            style={{ background: 'rgba(62,207,207,0.1)', color: 'var(--accent)', border: '1px solid rgba(62,207,207,0.2)' }}
          >
            Connect a source
          </button>
        </a>
      )}
    </div>
  )
}
