'use client'

import { useState } from 'react'
import {
  MessageSquare, Layers, MoreVertical, Volume2, VolumeX,
  Power, Trash2, CheckCircle2, Clock,
} from 'lucide-react'
import type { Source } from '@/types/database'

interface Props {
  source: Source
  messageCount: number
  contextCount: number
  lastMessageAt: string | null
  onToggleActive: (id: string, current: boolean) => void
  onToggleMute: (id: string, current: boolean) => void
  onDelete: (id: string) => void
}

export function SourceCard({
  source,
  messageCount,
  contextCount,
  lastMessageAt,
  onToggleActive,
  onToggleMute,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered]   = useState(false)

  const hasActivity = messageCount > 0
  const initial     = source.name.charAt(0).toUpperCase()
  const shortId     = source.external_id
    ? `···${source.external_id.slice(-6)}`
    : null

  // Last active: use last message time if available, else source created_at
  const lastActiveLabel = lastMessageAt ? 'Last msg' : 'Connected'
  const lastActiveTime  = timeAgo(lastMessageAt ?? source.created_at)

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: '#0d1117',
        borderColor: hovered ? 'rgba(62,207,207,0.25)' : '#1a2332',
        opacity: source.is_active ? 1 : 0.6,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent bar */}
      <div
        className="h-0.5 w-full"
        style={{ background: source.is_active ? '#3ecfcf' : '#1a2332' }}
      />

      <div style={{ padding: '16px 18px' }}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-3" style={{ marginBottom: 14 }}>
          <div className="flex items-center gap-3">
            {/* Initial avatar */}
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(62,207,207,0.1)',
                border: '1px solid rgba(62,207,207,0.2)',
                color: '#3ecfcf',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {initial}
            </div>

            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: '#e6edf3', lineHeight: 1.2 }}>
                {source.name}
              </p>
              <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '1px 7px',
                    borderRadius: 4,
                    background: 'rgba(62,207,207,0.1)',
                    color: '#3ecfcf',
                  }}
                >
                  Telegram
                </span>
                {shortId && (
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#3a4555' }}>
                    {shortId}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status + menu */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="flex items-center gap-1.5 rounded-full"
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 600,
                background: source.is_active ? 'rgba(86,211,100,0.1)' : 'rgba(255,255,255,0.04)',
                color: source.is_active ? '#56d364' : '#4a5a6a',
                border: source.is_active ? '1px solid rgba(86,211,100,0.2)' : '1px solid #1a2332',
              }}
            >
              <span
                className="rounded-full"
                style={{ width: 5, height: 5, background: source.is_active ? '#56d364' : '#4a5a6a', display: 'inline-block' }}
              />
              {source.is_active ? 'Live' : 'Inactive'}
            </div>

            {source.muted && (
              <div
                className="flex items-center gap-1 rounded-full"
                style={{ padding: '3px 8px', fontSize: 11, background: 'rgba(227,179,65,0.1)', color: '#e3b341', border: '1px solid rgba(227,179,65,0.2)' }}
              >
                <VolumeX size={10} /> Muted
              </div>
            )}

            <div className="relative">
              <button
                className="flex items-center justify-center rounded-lg transition-colors"
                style={{ width: 26, height: 26, color: '#3a4a5a' }}
                onClick={() => setMenuOpen(!menuOpen)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8a9aaa' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#3a4a5a' }}
              >
                <MoreVertical size={14} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-8 z-20 rounded-xl overflow-hidden w-44 shadow-2xl"
                    style={{ background: '#111820', border: '1px solid #1e2530' }}
                  >
                    <MenuItem
                      icon={source.is_active ? Power : CheckCircle2}
                      label={source.is_active ? 'Deactivate' : 'Activate'}
                      onClick={() => { onToggleActive(source.id, source.is_active); setMenuOpen(false) }}
                    />
                    <MenuItem
                      icon={source.muted ? Volume2 : VolumeX}
                      label={source.muted ? 'Unmute' : 'Mute alerts'}
                      onClick={() => { onToggleMute(source.id, source.muted); setMenuOpen(false) }}
                    />
                    <div style={{ height: 1, margin: '0 12px', background: '#1e2530' }} />
                    <MenuItem
                      icon={Trash2}
                      label="Delete source"
                      danger
                      onClick={() => { onDelete(source.id); setMenuOpen(false) }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div
          className="grid grid-cols-3 gap-3"
          style={{
            borderTop: '1px solid #111820',
            paddingTop: 12,
            opacity: hasActivity ? 1 : 0.6,
          }}
        >
          <Stat
            icon={<MessageSquare size={11} />}
            label="Messages"
            value={messageCount}
            highlight={hasActivity}
          />
          <Stat
            icon={<Layers size={11} />}
            label="Contexts"
            value={contextCount}
          />
          <Stat
            icon={<Clock size={11} />}
            label={lastActiveLabel}
            value={lastActiveTime}
            small
          />
        </div>

        {/* Waiting state */}
        {!hasActivity && (
          <p style={{ fontSize: 10, color: '#2a3545', fontStyle: 'italic', marginTop: 8 }}>
            Waiting for messages…
          </p>
        )}
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  small,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  small?: boolean
  highlight?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="flex items-center gap-1" style={{ color: '#3a4a5a' }}>
        {icon}
        <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
      <p
        style={{
          fontSize: small ? 12 : 18,
          fontWeight: small ? 500 : 800,
          color: highlight ? '#3ecfcf' : '#c8d8e8',
          letterSpacing: small ? 0 : '-0.02em',
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full text-left transition-colors"
      style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, color: danger ? '#f85149' : '#8a9aaa' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = danger ? 'rgba(248,81,73,0.08)' : 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins  = Math.floor(diff / 60000)
  if (days > 0)  return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${mins}m ago`
}
