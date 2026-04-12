'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, Settings, User, Send, ChevronRight, Check, X, Sun, Moon } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { useTheme } from '@/components/theme-provider'

interface PendingSource {
  id: string
  name: string
  telegram_group_name: string | null
  telegram_group_id: number | null
  external_id: string | null
  detected_at: string | null
  created_at: string
}

export function Topbar() {
  const [pendingSources, setPendingSources] = useState<PendingSource[]>([])
  const [open, setOpen]                     = useState(false)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [editName, setEditName]             = useState('')
  const [activating, setActivating]         = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router      = useRouter()
  const { theme, toggle } = useTheme()

  // ── Poll for pending sources every 30 s ─────────────────────────
  const fetchPending = useCallback(async () => {
    try {
      const res  = await fetch('/api/sources/pending')
      const data = await res.json()
      if (data.sources) setPendingSources(data.sources)
    } catch {
      // silent — topbar polling failures should never surface to the user
    }
  }, [])

  useEffect(() => {
    fetchPending()
    const interval = setInterval(fetchPending, 30_000)
    return () => clearInterval(interval)
  }, [fetchPending])

  // ── Close dropdown on outside click ─────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setEditingId(null)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // ── Activate source ──────────────────────────────────────────────
  async function handleActivate(src: PendingSource) {
    const displayName = editingId === src.id
      ? editName.trim() || src.telegram_group_name || src.name
      : src.telegram_group_name || src.name

    setActivating(src.id)
    try {
      const res  = await fetch('/api/sources/activate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_id: src.id, display_name: displayName }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)

      setPendingSources((prev) => prev.filter((s) => s.id !== src.id))
      setEditingId(null)
      setOpen(pendingSources.length > 1)   // keep open if more pending
      toast.success(`Now monitoring ${displayName}`)
      router.refresh()
    } catch (err) {
      toast.error('Failed to activate source')
      console.error(err)
    } finally {
      setActivating(null)
    }
  }

  // ── Start inline edit ────────────────────────────────────────────
  function startEdit(src: PendingSource) {
    setEditingId(src.id)
    setEditName(src.telegram_group_name || src.name || '')
  }

  const badgeCount = pendingSources.length

  return (
    <header
      className="flex items-center justify-between flex-shrink-0"
      style={{
        height: 48,
        padding: '0 20px',
        background: 'var(--topbar-bg)',
        borderBottom: '1px solid var(--topbar-border)',
        position: 'relative',
        zIndex: 40,
      }}
    >
      {/* Left — label + live indicator */}
      <div className="flex items-center" style={{ paddingLeft: 24, gap: 0 }}>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--topbar-label)',
          }}
        >
          Operations Intelligence
        </span>
        {/* separator */}
        <div style={{ width: 1, height: 12, background: 'var(--border-subtle)', margin: '0 12px', flexShrink: 0 }} />
        {/* live pulse */}
        <div className="flex items-center" style={{ gap: 6 }}>
          <div
            className="animate-pulse rounded-full"
            style={{ width: 6, height: 6, background: 'var(--severity-low)', flexShrink: 0 }}
          />
          <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text-muted)' }}>Live</span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center" style={{ gap: 8 }}>

        {/* Tori Active pill */}
        <div
          className="flex items-center"
          style={{
            background: 'var(--accent-dim)',
            border: '1px solid rgba(var(--accent-rgb), 0.18)',
            borderRadius: 20,
            padding: '4px 12px',
            gap: 7,
          }}
        >
          <span className="relative flex-shrink-0" style={{ width: 6, height: 6 }}>
            <span
              className="animate-ping absolute inline-flex rounded-full"
              style={{ width: '100%', height: '100%', background: 'var(--accent)', opacity: 0.5 }}
            />
            <span
              className="relative inline-flex rounded-full"
              style={{ width: 6, height: 6, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent-glow)' }}
            />
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.01em' }}>
            Tori Active
          </span>
        </div>

        {/* ── Theme toggle ── */}
        <button
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggle}
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'transparent',
            border: '1px solid var(--topbar-icon-border)',
            color: 'var(--topbar-icon)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'rgba(var(--accent-rgb), 0.08)'
            el.style.color = 'var(--accent)'
            el.style.borderColor = 'rgba(var(--accent-rgb), 0.3)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'transparent'
            el.style.color = 'var(--topbar-icon)'
            el.style.borderColor = 'var(--topbar-icon-border)'
          }}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* ── Notification Bell ── */}
        <div className="relative" ref={dropdownRef}>
          <button
            aria-label="Notifications"
            onClick={() => { setOpen((v) => !v); setEditingId(null) }}
            className="flex items-center justify-center flex-shrink-0 transition-all duration-150"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: open ? 'rgba(var(--accent-rgb), 0.04)' : 'transparent',
              border: `1px solid ${badgeCount > 0 ? 'var(--bell-error-border)' : 'var(--topbar-icon-border)'}`,
              color: badgeCount > 0 ? 'var(--bell-error)' : 'var(--topbar-icon)',
              cursor: 'pointer',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.background = 'rgba(var(--accent-rgb), 0.04)'
              el.style.color = badgeCount > 0 ? 'var(--bell-error)' : 'var(--text-secondary)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.background = open ? 'rgba(var(--accent-rgb), 0.04)' : 'transparent'
              el.style.color = badgeCount > 0 ? 'var(--bell-error)' : 'var(--topbar-icon)'
            }}
          >
            <Bell size={14} />
            {badgeCount > 0 && (
              <span
                className="absolute flex items-center justify-center"
                style={{
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--severity-critical)',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  border: '1.5px solid var(--topbar-bg)',
                  lineHeight: 1,
                }}
              >
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>

          {/* ── Dropdown panel ── */}
          {open && (
            <div
              className="absolute"
              style={{
                top: 40,
                right: 0,
                width: 340,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                overflow: 'hidden',
                zIndex: 50,
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between"
                style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Notifications
                </span>
                {badgeCount > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--bell-error)',
                      background: 'var(--bell-error-bg)',
                      border: '1px solid var(--bell-error-border)',
                      borderRadius: 20,
                      padding: '2px 7px',
                    }}
                  >
                    {badgeCount} pending
                  </span>
                )}
              </div>

              {/* Items */}
              {pendingSources.length === 0 ? (
                <EmptyNotifications />
              ) : (
                <div>
                  {pendingSources.map((src) => (
                    <NotificationItem
                      key={src.id}
                      src={src}
                      isEditing={editingId === src.id}
                      editName={editName}
                      isActivating={activating === src.id}
                      onStartEdit={() => startEdit(src)}
                      onEditChange={setEditName}
                      onActivate={() => handleActivate(src)}
                      onCancelEdit={() => setEditingId(null)}
                    />
                  ))}
                </div>
              )}

              {/* Footer */}
              <Link
                href="/sources"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1"
                style={{
                  padding: '10px 16px',
                  borderTop: '1px solid var(--border-subtle)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                }}
              >
                View all sources <ChevronRight size={11} />
              </Link>
            </div>
          )}
        </div>

        {/* Settings */}
        <IconBtn label="Settings">
          <Settings size={14} />
        </IconBtn>

        {/* Avatar */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--accent-dim)',
            border: '1.5px solid rgba(var(--accent-rgb), 0.3)',
            color: 'var(--text-secondary)',
          }}
        >
          <User size={13} />
        </div>
      </div>
    </header>
  )
}

/* ─── Notification item ──────────────────────────────────────────────────── */
function NotificationItem({
  src,
  isEditing,
  editName,
  isActivating,
  onStartEdit,
  onEditChange,
  onActivate,
  onCancelEdit,
}: {
  src: PendingSource
  isEditing: boolean
  editName: string
  isActivating: boolean
  onStartEdit: () => void
  onEditChange: (v: string) => void
  onActivate: () => void
  onCancelEdit: () => void
}) {
  const displayName = src.telegram_group_name || src.name
  const timeAgo = src.detected_at
    ? formatDistanceToNow(new Date(src.detected_at), { addSuffix: true })
    : 'just now'

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Telegram icon */}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Send size={13} style={{ color: 'var(--accent)' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>
          New group detected
        </p>

        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onActivate()
              if (e.key === 'Escape') onCancelEdit()
            }}
            style={{
              width: '100%',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              background: 'var(--accent-dim)',
              border: '1px solid rgba(var(--accent-rgb), 0.3)',
              borderRadius: 6,
              padding: '3px 8px',
              outline: 'none',
              marginBottom: 4,
            }}
          />
        ) : (
          <button
            onClick={onStartEdit}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'text',
              padding: 0,
              marginBottom: 2,
              textAlign: 'left',
              display: 'block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title="Click to rename"
          >
            {displayName}
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {src.external_id}
          </span>
          <span style={{ fontSize: 10, color: 'var(--border-default)' }}>·</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {isEditing ? (
          <>
            <button
              onClick={onActivate}
              disabled={isActivating}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--accent)',
                background: 'var(--accent-dim)',
                border: '1px solid rgba(var(--accent-rgb), 0.3)',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Check size={11} />
              {isActivating ? '…' : 'Confirm'}
            </button>
            <button
              onClick={onCancelEdit}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <X size={11} />
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={onActivate}
            disabled={isActivating}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--accent)',
              background: 'var(--accent-dim)',
              border: '1px solid rgba(var(--accent-rgb), 0.25)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              opacity: isActivating ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--accent-rgb), 0.2)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dim)' }}
          >
            {isActivating ? 'Activating…' : 'Activate'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Empty notifications ────────────────────────────────────────────────── */
function EmptyNotifications() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '24px 20px',
        textAlign: 'center',
      }}
    >
      <Send size={26} style={{ color: 'var(--border-default)' }} />
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
        No new groups detected
      </p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 240 }}>
        Add your bot to a Telegram group and SATORI will detect it automatically
      </p>
    </div>
  )
}

/* ─── Generic icon button ────────────────────────────────────────────────── */
function IconBtn({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex items-center justify-center flex-shrink-0 transition-all duration-150"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: 'transparent',
        border: '1px solid var(--topbar-icon-border)',
        color: 'var(--topbar-icon)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'var(--bg-hover)'
        el.style.color = 'var(--text-secondary)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'transparent'
        el.style.color = 'var(--topbar-icon)'
      }}
    >
      {children}
    </button>
  )
}
