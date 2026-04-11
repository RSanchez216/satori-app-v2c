'use client'

import { useState } from 'react'
import { Plus, Radio, Send, Zap, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SourceCard } from '@/components/sources/SourceCard'
import { AddSourceModal } from '@/components/sources/AddSourceModal'
import type { Source } from '@/types/database'

interface Props {
  initialSources: Source[]
  messageCountMap: Record<string, number>
  contextCountMap: Record<string, number>
}

export function SourcesClient({ initialSources, messageCountMap, contextCountMap }: Props) {
  const [sources, setSources]     = useState<Source[]>(initialSources)
  const [showModal, setShowModal] = useState(false)

  const activeCount   = sources.filter((s) => s.is_active).length
  const telegramCount = sources.filter((s) => s.type === 'telegram').length
  const totalMessages = Object.values(messageCountMap).reduce((a, b) => a + b, 0)

  /* ── CRUD handlers ── */
  function handleAdded(src: Source) {
    setSources((prev) => [src, ...prev])
  }

  async function handleToggleActive(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('sources').update({ is_active: !current }).eq('id', id)
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_active: !current } : s))
    )
  }

  async function handleToggleMute(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('sources').update({ muted: !current }).eq('id', id)
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, muted: !current } : s))
    )
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this source? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('sources').delete().eq('id', id)
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="space-y-6 fade-up">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-[22px] font-extrabold tracking-tight"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            Sources
          </h1>
          <p className="text-[12px] mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
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

      {/* ── Summary bar ── */}
      {sources.length > 0 && (
        <div
          className="flex items-center gap-6 px-5 py-3 rounded-xl flex-wrap"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <SummaryStat label="Total Sources" value={sources.length} color="var(--accent)" />
          <Divider />
          <SummaryStat label="Active" value={activeCount} color="#56d364" />
          <Divider />
          <SummaryStat label="Telegram" value={telegramCount} color="var(--accent)" />
          <Divider />
          <SummaryStat label="Messages Ingested" value={totalMessages} color="var(--text-secondary)" />
        </div>
      )}

      {/* ── Source types coming soon banner ── */}
      <div
        className="flex items-center gap-4 px-4 py-3 rounded-xl text-[12px]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2" style={{ color: 'var(--accent)' }}>
          <Send size={13} />
          <span className="font-semibold">Telegram</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: 'rgba(86,211,100,0.15)', color: '#56d364' }}
          >
            Available
          </span>
        </div>
        <div className="h-4 w-px" style={{ background: 'var(--border-subtle)' }} />
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <BookOpen size={13} />
          <span>Email Inbox</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          >
            Coming Soon
          </span>
        </div>
        <div className="h-4 w-px" style={{ background: 'var(--border-subtle)' }} />
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Zap size={13} />
          <span>Voice / Phone</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          >
            Coming Soon
          </span>
        </div>
      </div>

      {/* ── Sources grid ── */}
      {sources.length === 0 ? (
        <EmptyState onAdd={() => setShowModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sources.map((src) => (
            <SourceCard
              key={src.id}
              source={src}
              messageCount={messageCountMap[src.id] ?? 0}
              contextCount={contextCountMap[src.id] ?? 0}
              onToggleActive={handleToggleActive}
              onToggleMute={handleToggleMute}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── Add Source Modal ── */}
      {showModal && (
        <AddSourceModal
          onClose={() => setShowModal(false)}
          onAdded={(src) => {
            handleAdded(src as Source)
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

/* ── Sub-components ── */

function Divider() {
  return <div className="w-px h-4 self-center" style={{ background: 'var(--border-subtle)' }} />
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[14px] font-bold" style={{ color }}>{value}</span>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 py-20 rounded-2xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Illustration */}
      <div className="relative">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <circle cx="36" cy="36" r="34" stroke="var(--border-default)" strokeWidth="1.5" />
          <circle cx="36" cy="36" r="22" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="36" cy="36" r="10" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
          {/* Pulse rings */}
          <circle cx="36" cy="36" r="16" stroke="var(--accent)" strokeWidth="0.75" opacity="0.2" />
          <circle cx="36" cy="36" r="4" fill="var(--accent)" opacity="0.5" />
          {/* Antenna lines */}
          <line x1="36" y1="2" x2="36" y2="14" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
          <line x1="28" y1="5" x2="32" y2="14" stroke="var(--accent)" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
          <line x1="44" y1="5" x2="40" y2="14" stroke="var(--accent)" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
        </svg>
      </div>

      <div className="text-center max-w-sm">
        <h3
          className="text-[17px] font-bold mb-2"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
        >
          No sources connected
        </h3>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Connect your first Telegram group and Tori will start monitoring messages,
          building context windows, and detecting situations automatically.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button className="btn-accent" onClick={onAdd}>
          <Radio size={14} />
          Connect Telegram Source
        </button>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          You&apos;ll need a Telegram bot token from @BotFather
        </p>
      </div>
    </div>
  )
}
