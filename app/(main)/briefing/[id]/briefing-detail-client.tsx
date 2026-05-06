'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Send, Loader2, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LiveDot } from '@/components/ui/live-dot'
import { RelativeTime } from '@/components/ui/relative-time'
import type {
  BriefingWithRecipients, BriefingHistory,
} from '@/types/database'
import type { WatchlistPayload } from '@/lib/briefings/types'
import { WatchlistRenderer } from './render-watchlist'

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  success: { color: 'var(--severity-low)',      label: 'Sent' },
  partial: { color: 'var(--severity-high)',     label: 'Partial' },
  error:   { color: 'var(--severity-critical)', label: 'Error' },
}

const TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  legacy:       { bg: '#1e2530',                color: '#8a92a3',         label: 'Legacy' },
  watchlist:    { bg: 'rgba(62,207,207,0.1)',   color: '#3ecfcf',         label: 'Watchlist' },
  alert_digest: { bg: 'rgba(227,179,65,0.08)',  color: 'var(--severity-high)', label: 'Alert digest' },
  drill_in:     { bg: 'rgba(179,146,240,0.12)', color: 'var(--kb-purple)', label: 'Drill-in' },
}

interface Props {
  initialBriefing: BriefingWithRecipients
  initialHistory:  BriefingHistory[]
}

export function BriefingDetailClient({ initialBriefing, initialHistory }: Props) {
  const supabase = createClient()
  const [briefing, setBriefing] = useState<BriefingWithRecipients>(initialBriefing)
  const [history,  setHistory]  = useState<BriefingHistory[]>(initialHistory)
  const [tab, setTab] = useState<'latest' | 'history'>('latest')
  // The user can replay an older run from the History tab — null = "latest".
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // Realtime status mirrors `live-dot.tsx`'s contract; we drive it from
  // the channel subscription below.
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Refetch this briefing + its history. Used by Realtime subscription
  // and by the Run-now optimistic flow.
  const reload = useCallback(async () => {
    const [bRes, hRes] = await Promise.all([
      supabase.from('briefings').select('*, briefing_recipients(*)').eq('id', briefing.id).maybeSingle(),
      supabase.from('briefing_history').select('*, briefings(name)').eq('briefing_id', briefing.id).order('sent_at', { ascending: false }).limit(50),
    ])
    if (bRes.data) setBriefing(bRes.data as BriefingWithRecipients)
    if (hRes.data) setHistory(hRes.data as BriefingHistory[])
    setLastUpdated(new Date())
  }, [briefing.id, supabase])

  // Realtime — subscribe to this briefing's row + its history INSERTs so
  // the page reflects new sends within ~2s without a refresh. Filtered
  // server-side via `filter` so other briefings' events don't trigger
  // refetches.
  useEffect(() => {
    const ch = supabase
      .channel(`briefing-detail-${briefing.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'briefings', filter: `id=eq.${briefing.id}` },
        () => reload(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'briefing_history', filter: `briefing_id=eq.${briefing.id}` },
        () => reload(),
      )
      .subscribe(status => {
        if      (status === 'SUBSCRIBED')                                                  setRealtimeStatus('connected')
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('disconnected')
      })
    setLastUpdated(new Date())
    return () => { supabase.removeChannel(ch) }
  }, [briefing.id, supabase, reload])

  const selectedRun = useMemo<BriefingHistory | null>(() => {
    if (history.length === 0) return null
    if (selectedRunId == null) return history[0] ?? null
    return history.find(h => h.id === selectedRunId) ?? history[0] ?? null
  }, [history, selectedRunId])

  const typeBadge = TYPE_BADGE[briefing.briefing_type ?? 'legacy'] ?? TYPE_BADGE.legacy
  const scheduleLine = briefing.frequency === 'daily'
    ? `Daily at ${briefing.send_time} ${briefing.timezone === 'America/Chicago' ? 'CT' : briefing.timezone}`
    : briefing.frequency === 'weekly'
      ? `Weekly · day ${briefing.weekly_day ?? 0} at ${briefing.send_time}`
      : briefing.frequency === 'monthly'
        ? `Monthly · 1st at ${briefing.send_time}`
        : briefing.frequency

  async function handleSendNow() {
    setSending(true)
    try {
      const res = await fetch(`/api/tori/briefings/${briefing.id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Unknown error')
      toast.success(`Briefing sent to ${data.recipients_succeeded} recipient${data.recipients_succeeded !== 1 ? 's' : ''}!`)
      await reload()
    } catch (err) {
      toast.error(`Send failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Breadcrumb */}
      <Link
        href="/briefing"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
          textDecoration: 'none', alignSelf: 'flex-start',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)' }}
      >
        <ArrowLeft size={12} /> Briefings
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
            {briefing.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: typeBadge.bg, color: typeBadge.color }}>
              {typeBadge.label}
            </span>
            <span>·</span>
            <span>{scheduleLine}</span>
            <span>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <LiveDot status={realtimeStatus} />
              {realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'disconnected' ? 'Reconnecting…' : 'Connecting…'}
            </span>
            {lastUpdated && (
              <>
                <span>·</span>
                <span>Updated <RelativeTime date={lastUpdated} /></span>
              </>
            )}
            {briefing.is_default && (
              <>
                <span>·</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: 'rgba(86,211,100,0.1)', color: 'var(--severity-low)',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  Default
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Link
            href="/briefing"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', textDecoration: 'none',
            }}
          >
            <Pencil size={11} /> Edit
          </Link>
          <button
            onClick={handleSendNow}
            disabled={sending}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'var(--accent)', border: 'none', color: '#fff',
              cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            {sending ? 'Sending…' : 'Run now'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['latest', 'history'] as const).map(t => {
          const active = tab === t
          const label = t === 'latest' ? 'Latest run' : `History (${history.length})`
          return (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'latest') setSelectedRunId(null) }}
              style={{
                padding: '10px 18px', fontSize: 12, fontWeight: 600,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Tab body */}
      {tab === 'latest' && (
        <LatestRunPane
          briefing={briefing}
          run={selectedRun}
          isLatest={selectedRunId === null}
          onBackToLatest={() => setSelectedRunId(null)}
        />
      )}
      {tab === 'history' && (
        <HistoryPane
          history={history}
          onSelect={id => { setSelectedRunId(id); setTab('latest') }}
        />
      )}
    </div>
  )
}

/* ─── Panes ────────────────────────────────────────────────────────────── */

function LatestRunPane({
  briefing, run, isLatest, onBackToLatest,
}: {
  briefing:        BriefingWithRecipients
  run:             BriefingHistory | null
  isLatest:        boolean
  onBackToLatest:  () => void
}) {
  if (!run) {
    return (
      <EmptyState
        title="No runs yet"
        body={
          briefing.is_enabled
            ? 'This briefing hasn\'t fired yet. Click Run now above to send a one-off, or wait for the next scheduled run.'
            : 'This briefing is disabled. Enable it on the index page or click Run now to test.'
        }
      />
    )
  }

  const status = STATUS_STYLE[run.status] ?? { color: 'var(--text-muted)', label: run.status }
  const isLegacy = (briefing.briefing_type ?? 'legacy') === 'legacy'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Run meta strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderRadius: 8,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        {/* Latest / replay pill — left edge of the meta strip so the user
            always knows whether they're looking at the freshest run. */}
        {isLatest ? (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: 'rgba(86,211,100,0.12)', color: 'var(--severity-low)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Latest
          </span>
        ) : (
          <button
            onClick={onBackToLatest}
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(227,179,65,0.12)', color: 'var(--severity-high)',
              letterSpacing: '0.04em', textTransform: 'uppercase',
              border: '1px solid rgba(227,179,65,0.25)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            title="Back to latest run"
          >
            Past run · ← back to latest
          </button>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${status.color}1f`, color: status.color }}>
          {status.label}
        </span>
        <span>{format(new Date(run.sent_at), 'MMM d, yyyy h:mm a')}</span>
        <span>·</span>
        <span>{formatDistanceToNow(new Date(run.sent_at), { addSuffix: true })}</span>
        <span>·</span>
        <span>{run.recipients_succeeded} / {run.recipients_attempted} recipients</span>
        {run.voice_sent && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: 'rgba(179,146,240,0.12)', color: 'var(--kb-purple)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Voice sent
          </span>
        )}
      </div>

      {/* Body — legacy renders the markdown text; watchlist payloads
          (Phase 3) will render via a structured renderer. For Phase 2,
          we surface the JSON pretty-printed so the data is at least
          inspectable. */}
      {isLegacy ? (
        <LegacyMessageBody text={run.message_full_text ?? run.message_preview ?? ''} />
      ) : (
        <WatchlistPlaceholder run={run} />
      )}

      {run.error_message && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)',
          fontSize: 12, color: 'var(--severity-critical)',
        }}>
          {run.error_message}
        </div>
      )}
    </div>
  )
}

function LegacyMessageBody({ text }: { text: string }) {
  if (!text) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '14px 16px' }}>
        No message body recorded for this run.
      </p>
    )
  }
  // Existing legacy briefings emit plain text with emojis — preserve
  // line breaks via white-space:pre-wrap. No markdown processor needed.
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 10,
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65,
      whiteSpace: 'pre-wrap',
    }}>
      {text}
    </div>
  )
}

function WatchlistPlaceholder({ run }: { run: BriefingHistory }) {
  // Parse the engine's structured payload. If the row is malformed
  // (legacy text mistakenly stored, or a pre-Phase-3 schema), fall back
  // to a pretty-printed JSON view so the data is still inspectable.
  let payload: WatchlistPayload | null = null
  let parseError: string | null = null
  if (run.message_full_text) {
    try {
      const parsed = JSON.parse(run.message_full_text)
      if (parsed && parsed.template === 'watchlist' && parsed.schema_version === 1) {
        payload = parsed as WatchlistPayload
      } else {
        parseError = `Unexpected payload shape (template=${parsed?.template}, schema_version=${parsed?.schema_version}).`
      }
    } catch (e) {
      parseError = `Could not parse run payload as JSON: ${e instanceof Error ? e.message : 'unknown'}`
    }
  } else {
    parseError = 'No payload recorded for this run.'
  }

  if (payload) return <WatchlistRenderer payload={payload} />

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      fontSize: 12, color: 'var(--text-muted)',
    }}>
      <p style={{ marginBottom: 8, fontStyle: 'italic' }}>{parseError}</p>
      {run.message_full_text && (
        <pre style={{
          margin: 0, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 320, overflowY: 'auto',
        }}>
          {run.message_full_text}
        </pre>
      )}
    </div>
  )
}

function HistoryPane({ history, onSelect }: { history: BriefingHistory[]; onSelect: (id: string) => void }) {
  if (history.length === 0) {
    return <EmptyState title="No runs yet" body="History will populate after the first send." />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-subtle)' }}>
        {history.map(row => {
          const status = STATUS_STYLE[row.status] ?? { color: 'var(--text-muted)', label: row.status }
          const ts = new Date(row.sent_at)
          return (
            <button
              key={row.id}
              onClick={() => onSelect(row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)',
                background: 'transparent', border: 'none', borderTop: 'none',
                borderLeft: 'none', borderRight: 'none', cursor: 'pointer',
                textAlign: 'left', width: '100%',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: `${status.color}1f`, color: status.color, flexShrink: 0 }}>
                {status.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', minWidth: 180 }}>
                {format(ts, 'MMM d, yyyy h:mm a')}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {formatDistanceToNow(ts, { addSuffix: true })}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {row.recipients_succeeded}/{row.recipients_attempted} recipients
              </span>
              <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: 'rotate(-90deg)', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      padding: '36px 20px', textAlign: 'center',
      background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)', borderRadius: 12,
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{body}</p>
    </div>
  )
}
