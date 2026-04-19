'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Inbox, MessageSquare, ChevronDown, ChevronUp, AlertTriangle,
  User, Truck, Package, Eye, Clock, RefreshCw, Loader2, XCircle, X,
  CheckSquare, Square, CheckCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DateFilter, buildDateRange } from '@/components/ui/date-filter'
import type { DateRange } from '@/components/ui/date-filter'
import type { MessageContext, Source } from '@/types/database'

type FilterTab = 'all' | 'unread' | 'alert_worthy' | 'needs_review'
type CtxWithSource = MessageContext & { source?: Source }

const DEPT_FILTERS = ['All Depts', 'Dispatch', 'Safety', 'Maintenance', 'Driver', 'Finance']

const SEVERITY_STYLES: Record<string, { bg: string; color: string }> = {
  critical: { bg: 'rgba(248,81,73,0.15)',    color: 'var(--severity-critical)' },
  high:     { bg: 'rgba(227,179,65,0.15)',   color: 'var(--severity-high)' },
  medium:   { bg: 'rgba(62,207,207,0.12)',   color: 'var(--severity-medium)' },
  low:      { bg: 'rgba(86,211,100,0.1)',    color: 'var(--severity-low)' },
}

const DEPT_DOT: Record<string, string> = {
  Dispatch:    'var(--accent)',
  Safety:      'var(--severity-critical)',
  Accounting:  'var(--severity-high)',
  Fleet:       'var(--kb-purple)',
  HR:          'var(--severity-low)',
  Compliance:  'var(--severity-high)',
  Maintenance: 'var(--severity-high)',
  Other:       'var(--text-muted)',
}

interface Props {
  contexts: CtxWithSource[]
}

export function InboxClient({ contexts: initial }: Props) {
  const supabase = createClient()
  const [contexts, setContexts]       = useState<CtxWithSource[]>(initial)
  const [activeTab, setActiveTab]     = useState<FilterTab>('all')
  const [activeDept, setActiveDept]   = useState('All Depts')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [dateRange, setDateRange]     = useState<DateRange>(() => buildDateRange('today'))
  const [loading, setLoading]         = useState(false)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [bulkRetrying, setBulkRetrying] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failedIds: string[] } | null>(null)
  const [bulkResult,   setBulkResult]   = useState<{ total: number; failedIds: string[] } | null>(null)

  const fetchContexts = useCallback(async (range: DateRange) => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('message_contexts')
        .select('*, source:sources(id, name, type)')
        .gte('created_at', range.from)
        .lt('created_at', range.to)
        .order('created_at', { ascending: false })
        .limit(200)
      if (data) setContexts(data as CtxWithSource[])
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const filtered = contexts.filter((ctx) => {
    if (activeTab === 'unread'       && !isUnread(ctx)) return false
    if (activeTab === 'alert_worthy' && !ctx.alert_worthy) return false
    if (activeTab === 'needs_review' && !ctx.needs_review) return false
    if (activeDept !== 'All Depts'   && ctx.department !== activeDept) return false
    return true
  })

  /** Core analyze call. Returns true on success, false on any error. */
  async function handleReanalyze(id: string, opts?: { force?: boolean; silent?: boolean }): Promise<boolean> {
    try {
      const res  = await fetch('/api/ai/analyze-context', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ context_id: id, ...(opts?.force ? { force: true } : {}) }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.error) {
        const errMsg = data.error ?? `HTTP ${res.status}`
        console.error('[inbox] analyze failed for', id, '—', errMsg, data)
        if (!opts?.silent) toast.error('Analysis failed — check logs')
        setContexts(prev => prev.map(c =>
          c.id === id ? { ...c, ai_status: 'failed', updated_at: new Date().toISOString() } : c
        ))
        return false
      }

      if (data.context) {
        setContexts(prev => prev.map(c => c.id === id ? { ...c, ...data.context } : c))
      }
      return true
    } catch (err) {
      console.error('[inbox] analyze error for', id, err)
      if (!opts?.silent) toast.error('Analysis failed — check logs')
      setContexts(prev => prev.map(c =>
        c.id === id ? { ...c, ai_status: 'failed', updated_at: new Date().toISOString() } : c
      ))
      return false
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllStuck() {
    const ids = filtered
      .filter(ctx => isStuck(ctx) || ctx.ai_status === 'failed')
      .map(ctx => ctx.id)
    setSelected(new Set(ids))
  }

  async function handleBulkRetry() {
    const ids = [...selected]
    const total = ids.length
    const failedIds: string[] = []

    setBulkRetrying(true)
    setSelected(new Set())
    setBulkProgress({ done: 0, total, failedIds: [] })

    for (let i = 0; i < ids.length; i++) {
      const ok = await handleReanalyze(ids[i], { force: true, silent: true })
      if (!ok) failedIds.push(ids[i])
      setBulkProgress({ done: i + 1, total, failedIds: [...failedIds] })
      if (i < ids.length - 1) await new Promise(r => setTimeout(r, 300))
    }

    setBulkRetrying(false)
    setBulkProgress(null)
    setBulkResult({ total, failedIds })
    setTimeout(() => setBulkResult(null), 3000)
  }

  function retryFailed(failedIds: string[]) {
    setBulkResult(null)
    setSelected(new Set(failedIds))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: selected.size > 0 ? 80 : 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              Context Inbox
            </h1>
            {loading && <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            AI-analyzed message conversations grouped by context
          </p>
        </div>
        <DateFilter
          value={dateRange}
          onChange={range => { setDateRange(range); fetchContexts(range) }}
        />
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
          padding: '10px 14px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {([ { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'alert_worthy', label: 'Alert-Worthy' }, { id: 'needs_review', label: 'Needs Review' } ] as { id: FilterTab; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--accent-dim)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                border: activeTab === tab.id ? '1px solid rgba(62,207,207,0.2)' : '1px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {DEPT_FILTERS.map((dept) => (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                background: activeDept === dept ? 'var(--accent-dim)' : 'transparent',
                color: activeDept === dept ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none',
              }}
            >
              {dept}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
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
              isSelected={selected.has(ctx.id)}
              onToggle={() => setExpanded(expanded === ctx.id ? null : ctx.id)}
              onReanalyze={handleReanalyze}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {(selected.size > 0 || bulkRetrying || bulkResult !== null) && createPortal(
        <BulkActionBar
          count={selected.size}
          retrying={bulkRetrying}
          progress={bulkProgress}
          result={bulkResult}
          onRetry={handleBulkRetry}
          onRetryFailed={retryFailed}
          onSelectAllStuck={selectAllStuck}
          onClear={() => setSelected(new Set())}
        />,
        document.body,
      )}
    </div>
  )
}

function isUnread(ctx: MessageContext): boolean {
  return ctx.ai_status !== 'done' || ctx.needs_review
}

/** processing state whose updated_at hasn't moved in >3 minutes */
function isStuck(ctx: MessageContext): boolean {
  if (ctx.ai_status !== 'processing') return false
  const age = Date.now() - new Date(ctx.updated_at).getTime()
  return age > 3 * 60 * 1000
}

/** pending for >5 minutes (never started) */
function isStale(ctx: MessageContext): boolean {
  if (ctx.ai_status !== 'pending') return false
  const ref = ctx.analyzed_at ?? ctx.created_at
  if (!ref) return true
  return Date.now() - new Date(ref).getTime() > 5 * 60 * 1000
}

/* ─── Context Card ───────────────────────────────────────────────────────── */
function ContextCard({
  ctx,
  isExpanded,
  isSelected,
  onToggle,
  onReanalyze,
  onToggleSelect,
}: {
  ctx: CtxWithSource
  isExpanded: boolean
  isSelected: boolean
  onToggle: () => void
  onReanalyze: (id: string, opts?: { force?: boolean }) => Promise<boolean>
  onToggleSelect: (id: string) => void
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const [retrying,  setRetrying]  = useState(false)
  const unread    = isUnread(ctx)
  const stuck     = !retrying && isStuck(ctx)
  const stale     = isStale(ctx)
  const isError   = ctx.ai_status === 'failed'
  const entities  = ctx.entities_json as Record<string, string> | null
  const sevStyle  = ctx.severity ? (SEVERITY_STYLES[ctx.severity] ?? null) : null
  const deptDot   = ctx.department ? (DEPT_DOT[ctx.department] ?? 'var(--text-muted)') : null
  const hasExistingAnalysis = !!(ctx.summary || ctx.rationale)

  async function triggerAnalyze(e: React.MouseEvent) {
    e.stopPropagation()
    setAnalyzing(true)
    await onReanalyze(ctx.id)
    setAnalyzing(false)
  }

  async function triggerRetry(e: React.MouseEvent) {
    e.stopPropagation()
    setRetrying(true)
    await onReanalyze(ctx.id, { force: true })
    setRetrying(false)
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isSelected ? 'rgba(62,207,207,0.4)' : unread ? 'rgba(62,207,207,0.3)' : 'var(--border-subtle)'}`,
        borderLeft: `3px solid ${isSelected ? 'var(--accent)' : unread ? 'var(--accent)' : 'transparent'}`,
        borderRadius: 10,
        overflow: 'hidden',
        outline: isSelected ? '1px solid rgba(62,207,207,0.15)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Checkbox */}
        <div
          style={{ padding: '16px 0 16px 14px', flexShrink: 0, cursor: 'pointer', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          onClick={e => { e.stopPropagation(); onToggleSelect(ctx.id) }}
        >
          {isSelected
            ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
            : <Square size={14} />}
        </div>

        {/* Header — always visible */}
        <button
          className="w-full text-left"
          style={{ flex: 1, padding: '14px 18px 14px 10px', display: 'flex', alignItems: 'flex-start', gap: 12 }}
          onClick={onToggle}
        >
          {/* Unread dot */}
          {unread && !isSelected && (
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Badge row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>

              {/* Source pill */}
              {ctx.source && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {deptDot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: deptDot, display: 'inline-block', flexShrink: 0 }} />}
                  {ctx.source.name}
                </span>
              )}

              {/* Topic */}
              {ctx.topic_name && (
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {ctx.topic_name}
                </span>
              )}

              {/* Severity */}
              {sevStyle && ctx.severity && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: sevStyle.bg, color: sevStyle.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {ctx.severity}
                </span>
              )}

              {/* Alert-worthy */}
              {ctx.alert_worthy && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(227,179,65,0.1)', color: 'var(--severity-high)' }}>
                  <AlertTriangle size={9} /> Alert
                </span>
              )}

              {/* Needs review */}
              {ctx.needs_review && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(227,179,65,0.1)', color: 'var(--severity-high)' }}>
                  <Eye size={9} /> Review
                </span>
              )}

              {/* Error badge (failed) — with retry */}
              {isError && !retrying && (
                <button
                  onClick={triggerRetry}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--severity-critical)', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <XCircle size={9} /> Error — Retry
                </button>
              )}

              {/* Stuck processing — Retry badge */}
              {stuck && !isError && (
                <button
                  onClick={triggerRetry}
                  style={{ fontSize: 11, fontWeight: 600, color: '#d97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <RefreshCw size={9} /> Stuck — Retry
                </button>
              )}

              {/* Retrying spinner */}
              {retrying && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} /> Retrying…
                </span>
              )}

              {/* Pending stale — Analyze Now / Re-Analyze */}
              {stale && (
                <button
                  onClick={triggerAnalyze}
                  disabled={analyzing}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(62,207,207,0.2)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: analyzing ? 0.7 : 1 }}
                >
                  <RefreshCw size={9} style={{ animation: analyzing ? 'spin 1s linear infinite' : undefined }} />
                  {analyzing ? 'Analyzing…' : hasExistingAnalysis ? 'Re-Analyze' : 'Analyze Now'}
                </button>
              )}
            </div>

            {/* Preview */}
            <p style={{ fontSize: 13, marginTop: 6, color: 'var(--text-secondary)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {ctx.context_preview ?? ctx.summary ?? 'No summary available'}
            </p>

            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <MessageSquare size={10} />
                {ctx.message_count} msg{ctx.message_count !== 1 ? 's' : ''}
              </span>
              {ctx.primary_sender && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  <User size={10} /> {ctx.primary_sender}
                </span>
              )}
              {ctx.department && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 7px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {ctx.department}
                </span>
              )}
              {entities?.driver && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  <Truck size={10} /> {entities.driver}
                </span>
              )}
              {entities?.load && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  <Package size={10} /> {entities.load}
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                <Clock size={10} />
                {ctx.created_at ? formatDistanceToNow(new Date(ctx.created_at), { addSuffix: true }) : '—'}
              </span>
            </div>
          </div>

          {/* Expand toggle */}
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            {isExpanded
              ? <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} />
              : <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />}
          </div>
        </button>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border-subtle)' }}>

          {/* AI Summary */}
          {ctx.summary && (
            <div style={{ paddingTop: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>AI Summary</p>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{ctx.summary}</p>
            </div>
          )}

          {/* Recommended action */}
          {ctx.recommended_action && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--accent-glow2)', border: '1px solid rgba(62,207,207,0.12)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Recommended Action</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{ctx.recommended_action}</div>
            </div>
          )}

          {/* Rationale */}
          {ctx.rationale && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>AI Rationale</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{ctx.rationale}</p>
            </div>
          )}

          {/* Raw context */}
          {ctx.context_text && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Raw Context</p>
              <pre style={{ fontSize: 11, padding: 12, borderRadius: 8, background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {ctx.context_text}
              </pre>
            </div>
          )}

          {/* Footer: AI status + confidence */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>
              AI:{' '}
              {stuck ? (
                <span style={{ color: '#d97706', fontWeight: 600 }}>stuck</span>
              ) : isError ? (
                <span style={{ color: 'var(--severity-critical)', fontWeight: 600 }}>error</span>
              ) : (
                <span style={{ color: aiStatusColor(ctx.ai_status), fontWeight: 600 }}>
                  {retrying ? 'processing' : ctx.ai_status}
                </span>
              )}
            </span>
            {ctx.confidence != null && (
              <span>Confidence: <span style={{ color: 'var(--text-secondary)' }}>{ctx.confidence}%</span></span>
            )}
            {ctx.analyzed_at && (
              <span>Analyzed {formatDistanceToNow(new Date(ctx.analyzed_at), { addSuffix: true })}</span>
            )}
            {(ctx.ai_status === 'done' || isError || stuck) && (
              <button
                onClick={async (e) => { e.stopPropagation(); setAnalyzing(true); await onReanalyze(ctx.id, { force: isError || stuck }); setAnalyzing(false) }}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
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
  if (status === 'done')       return 'var(--severity-low)'
  if (status === 'processing') return 'var(--severity-high)'
  if (status === 'failed')     return 'var(--severity-critical)'
  return 'var(--text-muted)'
}

/* ─── Bulk Action Bar ────────────────────────────────────────────────────── */
function BulkActionBar({ count, retrying, progress, result, onRetry, onRetryFailed, onSelectAllStuck, onClear }: {
  count: number
  retrying: boolean
  progress: { done: number; total: number; failedIds: string[] } | null
  result:   { total: number; failedIds: string[] } | null
  onRetry: () => void
  onRetryFailed: (ids: string[]) => void
  onSelectAllStuck: () => void
  onClear: () => void
}) {
  const pct       = progress ? Math.round((progress.done / progress.total) * 100) : 0
  const remaining = progress ? progress.total - progress.done : 0
  const etaSecs   = Math.ceil((remaining * 300) / 1000)

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        zIndex: 200,
        whiteSpace: 'nowrap',
        minWidth: 360,
      }}
    >
      {/* ── Retrying in progress ── */}
      {retrying && progress && (
        <>
          <Loader2 size={13} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Retrying {progress.done} / {progress.total}
          </span>
          {/* Progress bar */}
          <div style={{ flex: 1, height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', minWidth: 80 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
          {remaining > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>~{etaSecs}s</span>
          )}
        </>
      )}

      {/* ── Done — success ── */}
      {!retrying && result && result.failedIds.length === 0 && (
        <>
          <CheckCircle2 size={14} style={{ color: 'var(--severity-low)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--severity-low)' }}>
            Done — {result.total} context{result.total !== 1 ? 's' : ''} queued
          </span>
        </>
      )}

      {/* ── Done — with failures ── */}
      {!retrying && result && result.failedIds.length > 0 && (
        <>
          <AlertTriangle size={13} style={{ color: 'var(--severity-high)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Done — {result.total - result.failedIds.length} succeeded,{' '}
            <span style={{ color: 'var(--severity-critical)' }}>{result.failedIds.length} failed</span>
          </span>
          <button
            onClick={() => onRetryFailed(result.failedIds)}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--severity-critical)', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 7, padding: '4px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <RefreshCw size={10} /> Retry failed
          </button>
        </>
      )}

      {/* ── Idle — selection controls ── */}
      {!retrying && !result && (
        <>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {count} selected
          </span>

          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', flexShrink: 0 }} />

          <button
            onClick={onSelectAllStuck}
            style={{ fontSize: 12, fontWeight: 500, color: '#d97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <AlertTriangle size={11} /> Select all stuck
          </button>

          <button
            onClick={onRetry}
            disabled={count === 0}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(62,207,207,0.25)', borderRadius: 7, padding: '5px 14px', cursor: count === 0 ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: count === 0 ? 0.5 : 1 }}
          >
            <RefreshCw size={11} /> Retry Analysis
          </button>

          <button
            onClick={onClear}
            style={{ fontSize: 12, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 8px' }}
          >
            <X size={12} /> Clear
          </button>
        </>
      )}
    </div>
  )
}

function EmptyInbox({ hasData }: { hasData: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '64px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(62,207,207,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Inbox size={22} style={{ color: 'var(--border-default)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {hasData ? 'No contexts match this filter' : 'Context Inbox is empty'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, maxWidth: 280, lineHeight: 1.5 }}>
          {hasData
            ? 'Try selecting a different filter or department.'
            : 'Once you connect a Telegram source, Tori will analyze incoming messages and group them here automatically.'}
        </p>
      </div>
      {!hasData && (
        <a href="/sources">
          <button style={{ fontSize: 12, padding: '6px 16px', borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(62,207,207,0.2)', cursor: 'pointer', fontWeight: 600 }}>
            Connect a source
          </button>
        </a>
      )}
    </div>
  )
}
