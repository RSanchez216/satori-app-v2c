'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Radio, Send, Zap, BookOpen, Search, Pencil, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { SourceCard } from '@/components/sources/SourceCard'
import { AddSourceModal } from '@/components/sources/AddSourceModal'
import type { Source } from '@/types/database'

interface Props {
  initialSources: Source[]
  messageCountMap: Record<string, number>
  contextCountMap: Record<string, number>
  lastMessageMap: Record<string, string>
}

export function SourcesClient({ initialSources, messageCountMap, contextCountMap, lastMessageMap }: Props) {
  const [sources, setSources]         = useState<Source[]>(initialSources)
  const [showModal, setShowModal]     = useState(false)
  const [newSourceId, setNewSourceId] = useState<string | null>(null)   // for highlight animation
  const router = useRouter()

  const activeSources   = sources.filter((s) => s.is_active)
  const detectedSources = sources.filter((s) => !s.is_active && s.auto_detected)
  const telegramCount   = activeSources.filter((s) => s.type === 'telegram').length
  const totalMessages   = Object.values(messageCountMap).reduce((a, b) => a + b, 0)

  /* ── Supabase realtime: watch sources table ── */
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel('sources-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sources' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSources((prev) => {
              if (prev.find((s) => s.id === (payload.new as Source).id)) return prev
              return [payload.new as Source, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            setSources((prev) =>
              prev.map((s) => (s.id === (payload.new as Source).id ? (payload.new as Source) : s))
            )
          } else if (payload.eventType === 'DELETE') {
            setSources((prev) => prev.filter((s) => s.id !== (payload.old as Source).id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  /* ── CRUD handlers ── */
  function handleAdded(src: Source) {
    setSources((prev) => [src, ...prev])
  }

  async function handleToggleActive(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('sources').update({ is_active: !current }).eq('id', id)
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !current } : s)))
  }

  async function handleToggleMute(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('sources').update({ muted: !current }).eq('id', id)
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, muted: !current } : s)))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this source? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('sources').delete().eq('id', id)
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  async function handleActivate(src: Source, displayName: string) {
    try {
      const res  = await fetch('/api/sources/activate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_id: src.id, display_name: displayName }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)

      setSources((prev) =>
        prev.map((s) => (s.id === src.id ? { ...s, is_active: true, name: displayName } : s))
      )
      setNewSourceId(src.id)
      setTimeout(() => setNewSourceId(null), 2000)
      toast.success(`Now monitoring ${displayName}`)
      router.refresh()
    } catch {
      toast.error('Failed to activate source')
    }
  }

  async function handleDismiss(id: string) {
    try {
      await fetch('/api/sources/dismiss', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_id: id }),
      })
      setSources((prev) => prev.filter((s) => s.id !== id))
      toast.success('Group dismissed')
    } catch {
      toast.error('Failed to dismiss group')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#e8edf2',
              letterSpacing: '-0.02em',
            }}
          >
            Sources
          </h1>
          <p style={{ fontSize: 12, color: '#3a4a5a', marginTop: 3 }}>
            Connect Telegram groups, email inboxes, and voice channels for Tori to monitor
          </p>
        </div>
        <button
          className="btn-accent flex-shrink-0"
          onClick={() => setShowModal(true)}
        >
          <Plus size={14} />
          Add Source
        </button>
      </div>

      {/* ── Detected Groups banner ── */}
      {detectedSources.length > 0 && (
        <DetectedGroupsBanner
          sources={detectedSources}
          onActivate={handleActivate}
          onDismiss={handleDismiss}
        />
      )}

      {/* ── Summary bar ── */}
      {activeSources.length > 0 && (
        <div
          className="flex items-center gap-6 px-5 py-3 rounded-xl flex-wrap"
          style={{ background: '#0d1117', border: '1px solid #1a2332' }}
        >
          <SummaryStat label="Active Sources" value={activeSources.length} color="#3ecfcf" />
          <Divider />
          <SummaryStat label="Telegram" value={telegramCount} color="#3ecfcf" />
          <Divider />
          <SummaryStat label="Messages Ingested" value={totalMessages} color="#8a9aaa" />
        </div>
      )}

      {/* ── Source types banner ── */}
      <div
        className="flex items-center gap-4 px-4 py-3 rounded-xl"
        style={{ background: '#0d1117', border: '1px solid #1a2332', fontSize: 12 }}
      >
        <div className="flex items-center gap-2" style={{ color: '#3ecfcf' }}>
          <Send size={13} />
          <span className="font-semibold">Telegram</span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 7px',
              borderRadius: 20,
              background: 'rgba(86,211,100,0.15)',
              color: '#56d364',
              fontWeight: 700,
            }}
          >
            Available
          </span>
        </div>
        <div style={{ width: 1, height: 16, background: '#1a2332' }} />
        <div className="flex items-center gap-2" style={{ color: '#3a4a5a' }}>
          <BookOpen size={13} />
          <span>Email Inbox</span>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: '#111820', color: '#3a4a5a', fontWeight: 700 }}>
            Coming Soon
          </span>
        </div>
        <div style={{ width: 1, height: 16, background: '#1a2332' }} />
        <div className="flex items-center gap-2" style={{ color: '#3a4a5a' }}>
          <Zap size={13} />
          <span>Voice / Phone</span>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: '#111820', color: '#3a4a5a', fontWeight: 700 }}>
            Coming Soon
          </span>
        </div>
      </div>

      {/* ── Active sources grid ── */}
      {activeSources.length === 0 ? (
        detectedSources.length === 0 && <EmptyState onAdd={() => setShowModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeSources.map((src) => (
            <div
              key={src.id}
              style={{
                borderRadius: 12,
                transition: 'box-shadow 0.4s ease, border-color 0.4s ease',
                boxShadow: newSourceId === src.id ? '0 0 0 2px rgba(62,207,207,0.5)' : undefined,
              }}
            >
              <SourceCard
                source={src}
                messageCount={messageCountMap[src.id] ?? 0}
                contextCount={contextCountMap[src.id] ?? 0}
                lastMessageAt={lastMessageMap[src.id] ?? null}
                onToggleActive={handleToggleActive}
                onToggleMute={handleToggleMute}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddSourceModal
          onClose={() => setShowModal(false)}
          onAdded={(src) => { handleAdded(src as Source); setShowModal(false) }}
        />
      )}
    </div>
  )
}

/* ─── Detected Groups Banner ─────────────────────────────────────────────── */
function DetectedGroupsBanner({
  sources,
  onActivate,
  onDismiss,
}: {
  sources: Source[]
  onActivate: (src: Source, name: string) => Promise<void>
  onDismiss: (id: string) => Promise<void>
}) {
  return (
    <div
      style={{
        background: 'rgba(227,179,65,0.05)',
        border: '1px solid rgba(227,179,65,0.2)',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Search size={14} style={{ color: '#e3b341' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e3b341' }}>
          {sources.length} New Group{sources.length !== 1 ? 's' : ''} Detected
        </span>
        <span style={{ fontSize: 11, color: '#6a7e92', marginLeft: 4 }}>
          SATORI found new Telegram groups with your bot
        </span>
      </div>

      {/* Source rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.map((src) => (
          <DetectedSourceRow
            key={src.id}
            src={src}
            onActivate={onActivate}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  )
}

function DetectedSourceRow({
  src,
  onActivate,
  onDismiss,
}: {
  src: Source
  onActivate: (src: Source, name: string) => Promise<void>
  onDismiss: (id: string) => Promise<void>
}) {
  const [name, setName]           = useState(src.telegram_group_name || src.name || '')
  const [editing, setEditing]     = useState(false)
  const [confirming, setConfirm]  = useState(false)
  const [loading, setLoading]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const timeAgo = src.detected_at
    ? formatDistanceToNow(new Date(src.detected_at), { addSuffix: true })
    : 'just now'

  async function activate() {
    setLoading(true)
    await onActivate(src, name.trim() || src.name)
    setLoading(false)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        border: '1px solid rgba(227,179,65,0.1)',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'rgba(62,207,207,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Send size={13} style={{ color: '#3ecfcf' }} />
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false) } }}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#e6edf3',
              background: 'rgba(62,207,207,0.06)',
              border: '1px solid rgba(62,207,207,0.3)',
              borderRadius: 6,
              padding: '2px 8px',
              outline: 'none',
              width: '100%',
              maxWidth: 240,
            }}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 13, fontWeight: 600, color: '#c8d8e8' }}>
              {name}
            </span>
            <button
              onClick={() => setEditing(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#3a4a5a' }}
            >
              <Pencil size={11} />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: '#3a4a5a', fontFamily: 'monospace' }}>
            {src.external_id}
          </span>
          <span style={{ fontSize: 10, color: '#2a3545' }}>·</span>
          <span style={{ fontSize: 10, color: '#3a4555' }}>Detected {timeAgo}</span>
        </div>
      </div>

      {/* Action buttons */}
      {confirming ? (
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, color: '#8d96a0' }}>Sure?</span>
          <button
            onClick={async () => { setLoading(true); await onDismiss(src.id); setLoading(false) }}
            disabled={loading}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#ff6b6b',
              background: 'rgba(255,75,75,0.1)',
              border: '1px solid rgba(255,75,75,0.25)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            {loading ? '…' : 'Yes'}
          </button>
          <button
            onClick={() => setConfirm(false)}
            style={{
              fontSize: 11,
              color: '#4a5a6a',
              background: 'transparent',
              border: '1px solid #1e2530',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={activate}
            disabled={loading}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#080d14',
              background: '#3ecfcf',
              border: 'none',
              borderRadius: 7,
              padding: '5px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 0 10px rgba(62,207,207,0.25)',
            }}
          >
            {loading ? '…' : <><Check size={11} /> Start Monitoring</>}
          </button>
          <button
            onClick={() => setConfirm(true)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#4a5a6a',
              background: 'transparent',
              border: '1px solid #1e2530',
              borderRadius: 7,
              padding: '5px 12px',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#ff6b6b'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,75,75,0.3)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#4a5a6a'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#1e2530'
            }}
          >
            <X size={12} style={{ display: 'inline', marginRight: 3 }} />
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function Divider() {
  return <div style={{ width: 1, height: 16, background: '#1a2332', alignSelf: 'center' }} />
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 12, color: '#3a4a5a' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}</span>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: '64px 20px',
        background: '#0d1117',
        border: '1px solid #1a2332',
        borderRadius: 16,
      }}
    >
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <circle cx="36" cy="36" r="34" stroke="#1a2332" strokeWidth="1.5" />
        <circle cx="36" cy="36" r="22" stroke="#1a2332" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="36" cy="36" r="10" stroke="#3ecfcf" strokeWidth="1.5" opacity="0.4" />
        <circle cx="36" cy="36" r="16" stroke="#3ecfcf" strokeWidth="0.75" opacity="0.2" />
        <circle cx="36" cy="36" r="4" fill="#3ecfcf" opacity="0.5" />
        <line x1="36" y1="2" x2="36" y2="14" stroke="#3ecfcf" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
        <line x1="28" y1="5" x2="32" y2="14" stroke="#3ecfcf" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
        <line x1="44" y1="5" x2="40" y2="14" stroke="#3ecfcf" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
      </svg>

      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#c8d8e8', marginBottom: 8, letterSpacing: '-0.01em' }}>
          No sources connected
        </h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#4a5a6a' }}>
          Connect your first Telegram group and Tori will start monitoring messages,
          building context windows, and detecting situations automatically.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button className="btn-accent" onClick={onAdd}>
          <Radio size={14} />
          Connect Telegram Source
        </button>
        <p style={{ fontSize: 11, color: '#2a3545' }}>
          Or just add your bot to any group — SATORI will detect it automatically
        </p>
      </div>
    </div>
  )
}
