'use client'

import { useState } from 'react'
import {
  MessageSquare, Layers, MoreVertical, Volume2, VolumeX,
  Power, Trash2, Send, CheckCircle2, Clock,
} from 'lucide-react'
import type { Source } from '@/types/database'

const TYPE_CONFIG = {
  telegram: {
    label: 'Telegram',
    icon: Send,
    color: '#3ecfcf',
    bg: 'rgba(62,207,207,0.1)',
  },
  email: {
    label: 'Email',
    icon: MessageSquare,
    color: '#b392f0',
    bg: 'rgba(179,146,240,0.1)',
  },
  phone: {
    label: 'Phone',
    icon: MessageSquare,
    color: '#56d364',
    bg: 'rgba(86,211,100,0.1)',
  },
}

interface Props {
  source: Source
  messageCount: number
  contextCount: number
  onToggleActive: (id: string, current: boolean) => void
  onToggleMute: (id: string, current: boolean) => void
  onDelete: (id: string) => void
}

export function SourceCard({
  source,
  messageCount,
  contextCount,
  onToggleActive,
  onToggleMute,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const cfg = TYPE_CONFIG[source.type] ?? TYPE_CONFIG.telegram
  const Icon = cfg.icon

  return (
    <div
      className="rounded-xl border transition-all duration-200 overflow-hidden group"
      style={{
        background: 'var(--bg-card)',
        borderColor: source.is_active ? 'var(--border-subtle)' : 'var(--border-subtle)',
        opacity: source.is_active ? 1 : 0.6,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 6px 24px rgba(0,0,0,0.4)'
        el.style.borderColor = 'var(--border-default)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = ''
        el.style.borderColor = 'var(--border-subtle)'
      }}
    >
      {/* Top accent bar */}
      <div
        className="h-0.5 w-full"
        style={{ background: source.is_active ? cfg.color : 'var(--border-subtle)' }}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {/* Type icon */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              <Icon size={18} />
            </div>

            <div>
              <p
                className="text-[14px] font-bold leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {source.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: cfg.bg, color: cfg.color }}
                >
                  {cfg.label}
                </span>
                {source.external_id && (
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {source.external_id}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status + menu */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Live / Inactive pill */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: source.is_active
                  ? 'rgba(86,211,100,0.1)'
                  : 'rgba(255,255,255,0.05)',
                color: source.is_active ? '#56d364' : 'var(--text-muted)',
                border: source.is_active
                  ? '1px solid rgba(86,211,100,0.2)'
                  : '1px solid var(--border-subtle)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: source.is_active ? '#56d364' : 'var(--text-muted)',
                  ...(source.is_active ? {} : {}),
                }}
              />
              {source.is_active ? 'Live' : 'Inactive'}
            </div>

            {/* Muted badge */}
            {source.muted && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px]"
                style={{ background: 'rgba(227,179,65,0.1)', color: '#e3b341', border: '1px solid rgba(227,179,65,0.2)' }}
              >
                <VolumeX size={10} /> Muted
              </div>
            )}

            {/* Menu */}
            <div className="relative">
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <MoreVertical size={14} />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 top-8 z-20 rounded-xl overflow-hidden w-44 shadow-2xl"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                    }}
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
                    <div className="h-px mx-3" style={{ background: 'var(--border-subtle)' }} />
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
          className="grid grid-cols-3 gap-3 pt-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <Stat
            icon={<MessageSquare size={12} />}
            label="Messages"
            value={messageCount}
          />
          <Stat
            icon={<Layers size={12} />}
            label="Contexts"
            value={contextCount}
          />
          <Stat
            icon={<Clock size={12} />}
            label="Connected"
            value={timeAgo(source.created_at)}
            small
          />
        </div>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  small?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={small ? 'text-[12px] font-medium' : 'text-[18px] font-bold'}
        style={{ color: 'var(--text-primary)' }}
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
      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12px] font-medium transition-colors text-left"
      style={{ color: danger ? '#f85149' : 'var(--text-secondary)' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = danger
          ? 'rgba(248,81,73,0.08)'
          : 'var(--bg-hover)'
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
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor(diff / 60000)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${mins}m ago`
}
