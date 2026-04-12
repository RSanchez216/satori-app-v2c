'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Inbox, MessageSquare, ChevronDown, ChevronUp, AlertTriangle,
  User, Truck, Package, Eye, Clock, RefreshCw,
} from 'lucide-react'
import type { MessageContext, Source } from '@/types/database'

type FilterTab = 'all' | 'unread' | 'alert_worthy' | 'needs_review'
type CtxWithSource = MessageContext & { source?: Source }

const DEPT_FILTERS = ['All Depts', 'Dispatch', 'Safety', 'Maintenance', 'Driver', 'Finance']

const SEVERITY_STYLES: Record<string, { bg: string; color: string }> = {
  critical: { bg: 'rgba(248,81,73,0.15)',    color: '#f85149' },
  high:     { bg: 'rgba(227,179,65,0.15)',   color: '#e3b341' },
  medium:   { bg: 'rgba(62,207,207,0.12)',   color: '#3ecfcf' },
  low:      { bg: 'rgba(86,211,100,0.1)',    color: '#56d364' },
}

const DEPT_DOT: Record<string, string> = {
  Dispatch:   '#3ecfcf',
  Safety:     '#f85149',
  Accounting: '#e3b341',
  Fleet:      '#b392f0',
  HR:         '#56d364',
  Compliance: '#e3b341',
  Maintenance:'#ff8c42',
  Other:      '#4a5a6a',
}

interface Props {
  contexts: CtxWithSource[]
}

export function InboxClient({ contexts: initial }: Props) {
  const [contexts, setContexts] = useState<CtxWithSource[]>(initial)
  const [activeTab, setActiveTab]   = useState<FilterTab>('all')
  const [activeDept, setActiveDept] = useState('All Depts')
  const [expanded, setExpanded]     = useState<string | null>(null)

  const filtered = contexts.filter((ctx) => {
    if (activeTab === 'unread'       && !isUnread(ctx)) return false
    if (activeTab === 'alert_worthy' && !ctx.alert_worthy) return false
    if (activeTab === 'needs_review' && !ctx.needs_review) return false
    if (activeDept !== 'All Depts'   && ctx.department !== activeDept) return false
    return true
  })

  async function handleReanalyze(id: string) {
    try {
      const res  = await fetch('/api/ai/analyze-context', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ context_id: id }),
      })
      const data = await res.json()
      if (data.context) {
        setContexts((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data.context } : c))
        )
      }
    } catch (err) {
      console.error('[inbox] re-analyze error:', err)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#e6edf3', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Context Inbox
          </h1>
        </div>
        <p style={{ fontSize: 11, color: '#3a4555', fontWeight: 500 }}>
          AI-analyzed message conversations grouped by context
        </p>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          background: '#0d1117',
          border: '1px solid #1a2332',
          borderRadius: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {([ { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'alert_worthy', label: 'Alert-Worthy' }, { id: 'needs_review', label: 'Needs Review' } ] as { id: FilterTab; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                background: activeTab === tab.id ? 'rgba(62,207,207,0.12)' : 'transparent',
                color: activeTab === tab.id ? '#3ecfcf' : '#4a5a6a',
                border: activeTab === tab.id ? '1px solid rgba(62,207,207,0.2)' : '1px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: '#1a2332' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {DEPT_FILTERS.map((dept) => (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              style={{
                padding: '4px 10px',
                borderRadius: 5,
                fontSize: 11,
                cursor: 'pointer',
                background: activeDept === dept ? 'rgba(62,207,207,0.08)' : 'transparent',
                color: activeDept === dept ? '#3ecfcf' : '#3a4555',
                border: 'none',
              }}
            >
              {dept}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#3a4555' }}>
          {filtered.length} context{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyInbox hasData={contexts.length > 0} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((ctx) => (
            <ContextCard
              key={ctx.id}
              ctx={ctx}
              isExpanded={expanded === ctx.id}
              onToggle={() => setExpanded(expanded === ctx.id ? null : ctx.id)}
              onReanalyze={handleReanalyze}
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

function isStale(ctx: MessageContext): boolean {
  if (ctx.ai_status !== 'pending' && ctx.ai_status !== 'processing') return false
  if (!ctx.analyzed_at && !ctx.created_at) return true
  const ref  = ctx.analyzed_at ?? ctx.created_at
  const age  = Date.now() - new Date(ref).getTime()
  return age > 5 * 60 * 1000  // > 5 minutes
}

/* ─── Context Card ───────────────────────────────────────────────────────── */
function ContextCard({
  ctx,
  isExpanded,
  onToggle,
  onReanalyze,
}: {
  ctx: CtxWithSource
  isExpanded: boolean
  onToggle: () => void
  onReanalyze: (id: string) => Promise<void>
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const unread    = isUnread(ctx)
  const stale     = isStale(ctx)
  const entities  = ctx.entities_json as Record<string, string> | null
  const sevStyle  = ctx.severity ? (SEVERITY_STYLES[ctx.severity] ?? null) : null
  const deptDot   = ctx.department ? (DEPT_DOT[ctx.department] ?? '#4a5a6a') : null

  async function triggerAnalyze(e: React.MouseEvent) {
    e.stopPropagation()
    setAnalyzing(true)
    await onReanalyze(ctx.id)
    setAnalyzing(false)
  }

  return (
    <div
      style={{
        background: '#0d1117',
        border: `1px solid ${unread ? 'rgba(62,207,207,0.3)' : '#1a2332'}`,
        borderLeft: `3px solid ${unread ? '#3ecfcf' : 'transparent'}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Header — always visible */}
      <button
        className="w-full text-left"
        style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}
        onClick={onToggle}
      >
        {/* Unread dot */}
        {unread && (
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3ecfcf', marginTop: 5, flexShrink: 0 }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Badge row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>

            {/* Source pill with dept dot */}
            {ctx.source && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(62,207,207,0.07)',
                  color: '#3ecfcf',
                }}
              >
                {deptDot && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: deptDot, display: 'inline-block', flexShrink: 0 }} />
                )}
                {ctx.source.name}
              </span>
            )}

            {/* Topic */}
            {ctx.topic_name && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#6a7e92' }}>
                {ctx.topic_name}
              </span>
            )}

            {/* Severity */}
            {sevStyle && ctx.severity && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: sevStyle.bg,
                  color: sevStyle.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {ctx.severity}
              </span>
            )}

            {/* Alert-worthy */}
            {ctx.alert_worthy && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(255,140,66,0.1)', color: '#ff8c42',
                }}
              >
                <AlertTriangle size={9} /> Alert
              </span>
            )}

            {/* Needs review */}
            {ctx.needs_review && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(255,209,102,0.1)', color: '#ffd166',
                }}
              >
                <Eye size={9} /> Review
              </span>
            )}

            {/* Stale AI — Analyze Now button */}
            {stale && (
              <button
                onClick={triggerAnalyze}
                disabled={analyzing}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#3ecfcf',
                  background: 'rgba(62,207,207,0.08)',
                  border: '1px solid rgba(62,207,207,0.2)',
                  borderRadius: 6,
                  padding: '3px 10px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: analyzing ? 0.7 : 1,
                }}
              >
                <RefreshCw size={9} style={{ animation: analyzing ? 'spin 1s linear infinite' : undefined }} />
                {analyzing ? 'Analyzing…' : 'Analyze Now'}
              </button>
            )}
          </div>

          {/* Preview */}
          <p
            style={{
              fontSize: 13,
              marginTop: 6,
              color: '#6a7e92',
              lineHeight: 1.5,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {ctx.context_preview ?? ctx.summary ?? 'No summary available'}
          </p>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#3a4555' }}>
              <MessageSquare size={10} />
              {ctx.message_count} msg{ctx.message_count !== 1 ? 's' : ''}
            </span>
            {ctx.primary_sender && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#3a4555' }}>
                <User size={10} /> {ctx.primary_sender}
              </span>
            )}
            {ctx.department && (
              <span
                style={{
                  fontSize: 10, fontWeight: 500,
                  padding: '1px 7px', borderRadius: 4,
                  background: '#111820', color: '#4a5a6a',
                }}
              >
                {ctx.department}
              </span>
            )}
            {entities?.driver && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#3a4555' }}>
                <Truck size={10} /> {entities.driver}
              </span>
            )}
            {entities?.load && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#3a4555' }}>
                <Package size={10} /> {entities.load}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#3a4555', marginLeft: 'auto' }}>
              <Clock size={10} />
              {ctx.created_at ? formatDistanceToNow(new Date(ctx.created_at), { addSuffix: true }) : '—'}
            </span>
          </div>
        </div>

        {/* Expand toggle */}
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          {isExpanded
            ? <ChevronUp size={15} style={{ color: '#3a4555' }} />
            : <ChevronDown size={15} style={{ color: '#3a4555' }} />}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #111820' }}>

          {/* AI Summary */}
          {ctx.summary && (
            <div style={{ paddingTop: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#3a4555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                AI Summary
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#8a9aaa' }}>
                {ctx.summary}
              </p>
            </div>
          )}

          {/* Recommended action */}
          {ctx.recommended_action && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: 'rgba(62,207,207,0.05)',
                border: '1px solid rgba(62,207,207,0.12)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#3ecfcf', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                Recommended Action
              </div>
              <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.5 }}>
                {ctx.recommended_action}
              </div>
            </div>
          )}

          {/* Rationale */}
          {ctx.rationale && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#3a4555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                AI Rationale
              </p>
              <p style={{ fontSize: 12, color: '#4a5a6a', lineHeight: 1.5 }}>
                {ctx.rationale}
              </p>
            </div>
          )}

          {/* Raw context */}
          {ctx.context_text && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#3a4555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                Raw Context
              </p>
              <pre
                style={{
                  fontSize: 11,
                  padding: 12,
                  borderRadius: 8,
                  background: '#080d14',
                  color: '#4a5a6a',
                  border: '1px solid #1a2332',
                  fontFamily: 'monospace',
                  maxHeight: 200,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {ctx.context_text}
              </pre>
            </div>
          )}

          {/* Footer: AI status + confidence */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11, color: '#3a4555' }}>
            <span>
              AI:{' '}
              <span style={{ color: aiStatusColor(ctx.ai_status), fontWeight: 600 }}>
                {ctx.ai_status}
              </span>
            </span>
            {ctx.confidence != null && (
              <span>Confidence: <span style={{ color: '#8a9aaa' }}>{ctx.confidence}%</span></span>
            )}
            {ctx.analyzed_at && (
              <span>Analyzed {formatDistanceToNow(new Date(ctx.analyzed_at), { addSuffix: true })}</span>
            )}
            {/* Re-analyze always available from expanded view */}
            {(ctx.ai_status === 'done' || ctx.ai_status === 'failed') && (
              <button
                onClick={async (e) => { e.stopPropagation(); setAnalyzing(true); await onReanalyze(ctx.id); setAnalyzing(false) }}
                style={{
                  fontSize: 11, fontWeight: 600, color: '#3ecfcf',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <RefreshCw size={10} /> Re-analyze
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function aiStatusColor(status: string) {
  if (status === 'done')       return '#56d364'
  if (status === 'processing') return '#ffd166'
  if (status === 'failed')     return '#ff4444'
  return '#3a4555'
}

function EmptyInbox({ hasData }: { hasData: boolean }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 16, padding: '64px 20px',
        background: '#0d1117', border: '1px solid #1a2332', borderRadius: 12,
      }}
    >
      <div
        style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(62,207,207,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Inbox size={22} style={{ color: '#2a3545' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#6a7e92' }}>
          {hasData ? 'No contexts match this filter' : 'Context Inbox is empty'}
        </p>
        <p style={{ fontSize: 11, color: '#3a4555', marginTop: 4, maxWidth: 280, lineHeight: 1.5 }}>
          {hasData
            ? 'Try selecting a different filter or department.'
            : 'Once you connect a Telegram source, Tori will analyze incoming messages and group them here automatically.'}
        </p>
      </div>
      {!hasData && (
        <a href="/sources">
          <button
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 8,
              background: 'rgba(62,207,207,0.1)', color: '#3ecfcf',
              border: '1px solid rgba(62,207,207,0.2)', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Connect a source
          </button>
        </a>
      )}
    </div>
  )
}
