'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, Settings, User, Send, ChevronRight, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

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
        background: '#080d14',
        borderBottom: '1px solid #1a2332',
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
            color: '#2a3545',
          }}
        >
          Operations Intelligence
        </span>
        {/* separator */}
        <div style={{ width: 1, height: 12, background: '#1e2530', margin: '0 12px', flexShrink: 0 }} />
        {/* live pulse */}
        <div className="flex items-center" style={{ gap: 6 }}>
          <div
            className="animate-pulse rounded-full"
            style={{ width: 6, height: 6, background: '#56d364', flexShrink: 0 }}
          />
          <span style={{ fontSize: 9, fontWeight: 500, color: '#3a4555' }}>Live</span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center" style={{ gap: 8 }}>

        {/* Tori Active pill */}
        <div
          className="flex items-center"
          style={{
            background: 'rgba(62,207,207,0.07)',
            border: '1px solid rgba(62,207,207,0.18)',
            borderRadius: 20,
            padding: '4px 12px',
            gap: 7,
          }}
        >
          <span className="relative flex-shrink-0" style={{ width: 6, height: 6 }}>
            <span
              className="animate-ping absolute inline-flex rounded-full"
              style={{ width: '100%', height: '100%', background: '#3ecfcf', opacity: 0.5 }}
            />
            <span
              className="relative inline-flex rounded-full"
              style={{ width: 6, height: 6, background: '#3ecfcf', boxShadow: '0 0 6px rgba(62,207,207,0.8)' }}
            />
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#3ecfcf', letterSpacing: '0.01em' }}>
            Tori Active
          </span>
        </div>

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
              background: open ? 'rgba(255,255,255,0.04)' : 'transparent',
              border: `1px solid ${badgeCount > 0 ? 'rgba(255,75,75,0.3)' : '#1a2332'}`,
              color: badgeCount > 0 ? '#ff6b6b' : '#4a5a6a',
              cursor: 'pointer',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.background = 'rgba(255,255,255,0.04)'
              el.style.color = badgeCount > 0 ? '#ff6b6b' : '#8d96a0'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.background = open ? 'rgba(255,255,255,0.04)' : 'transparent'
              el.style.color = badgeCount > 0 ? '#ff6b6b' : '#4a5a6a'
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
                  background: '#ff4444',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  border: '1.5px solid #080d14',
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
                background: '#0d1117',
                border: '1px solid #1e2530',
                borderRadius: 12,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                zIndex: 50,
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between"
                style={{ padding: '14px 16px', borderBottom: '1px solid #1e2530' }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>
                  Notifications
                </span>
                {badgeCount > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#ff6b6b',
                      background: 'rgba(255,75,75,0.12)',
                      border: '1px solid rgba(255,75,75,0.2)',
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
                  borderTop: '1px solid #1e2530',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#3ecfcf',
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
            background: 'linear-gradient(135deg, #1a2d3e, #0f1e2d)',
            border: '1.5px solid rgba(62,207,207,0.3)',
            color: '#4a6a7a',
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
        borderBottom: '1px solid #1a2030',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Telegram icon */}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: 'rgba(62,207,207,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Send size={13} style={{ color: '#3ecfcf' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#8d96a0', marginBottom: 2 }}>
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
              color: '#e6edf3',
              background: 'rgba(62,207,207,0.06)',
              border: '1px solid rgba(62,207,207,0.3)',
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
              color: '#3ecfcf',
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
          <span style={{ fontSize: 10, color: '#4a5a6a', fontFamily: 'monospace' }}>
            {src.external_id}
          </span>
          <span style={{ fontSize: 10, color: '#2a3545' }}>·</span>
          <span style={{ fontSize: 10, color: '#3a4555' }}>{timeAgo}</span>
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
                color: '#3ecfcf',
                background: 'rgba(62,207,207,0.12)',
                border: '1px solid rgba(62,207,207,0.3)',
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
                color: '#4a5a6a',
                background: 'transparent',
                border: '1px solid #1e2530',
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
              color: '#3ecfcf',
              background: 'rgba(62,207,207,0.12)',
              border: '1px solid rgba(62,207,207,0.25)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              opacity: isActivating ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(62,207,207,0.2)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(62,207,207,0.12)' }}
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
      <Send size={26} style={{ color: '#2a3545' }} />
      <p style={{ fontSize: 12, fontWeight: 600, color: '#4a5a6a' }}>
        No new groups detected
      </p>
      <p style={{ fontSize: 11, color: '#3a4555', lineHeight: 1.5, maxWidth: 240 }}>
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
        border: '1px solid #1a2332',
        color: '#4a5a6a',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'rgba(255,255,255,0.04)'
        el.style.color = '#8d96a0'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'transparent'
        el.style.color = '#4a5a6a'
      }}
    >
      {children}
    </button>
  )
}
