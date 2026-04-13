'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell, Settings, User, Send, ChevronRight, Check, X, Sun, Moon,
  AlertTriangle, CheckCheck,
} from 'lucide-react'
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

interface NotifAlert {
  id: string
  title: string
  severity: 'critical' | 'high'
  created_at: string
  source?: { name: string } | null
}

/* ── localStorage helpers ───────────────────────────────────────────────── */
const DISMISSED_KEY = 'satori-dismissed-alerts'

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-500)))
  } catch {}
}

/* ── Topbar ─────────────────────────────────────────────────────────────── */
export function Topbar() {
  const [pendingSources, setPendingSources] = useState<PendingSource[]>([])
  const [alerts, setAlerts]               = useState<NotifAlert[]>([])
  const [dismissedIds, setDismissedIds]   = useState<Set<string>>(new Set())
  const [open, setOpen]                   = useState(false)
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editName, setEditName]           = useState('')
  const [activating, setActivating]       = useState<string | null>(null)
  const [dismissing, setDismissing]       = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router      = useRouter()
  const { theme, toggle } = useTheme()

  // Load dismissed IDs from localStorage (client only)
  useEffect(() => { setDismissedIds(loadDismissed()) }, [])

  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id))
  const badgeCount    = pendingSources.length + visibleAlerts.length

  // ── Fetch notifications ─────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setPendingSources(data.pendingSources ?? [])
      setAlerts(data.alerts ?? [])
    } catch {
      // silent — never surface polling errors to the user
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // ── Close on outside click ──────────────────────────────────────────────
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

  // ── Activate source ─────────────────────────────────────────────────────
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
      // Optimistic removal
      setPendingSources((prev) => prev.filter((s) => s.id !== src.id))
      setEditingId(null)
      toast.success(`Now monitoring ${displayName}`)
      router.refresh()
      // Sync with server after short delay
      setTimeout(fetchNotifications, 500)
    } catch {
      toast.error('Failed to activate source')
    } finally {
      setActivating(null)
    }
  }

  // ── Dismiss source (sets dismissed_at) ──────────────────────────────────
  async function handleDismissSource(id: string) {
    setDismissing(id)
    // Optimistic removal immediately
    setPendingSources((prev) => prev.filter((s) => s.id !== id))
    try {
      const res  = await fetch('/api/sources/dismiss', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_id: id }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      // Sync with server after short delay
      setTimeout(fetchNotifications, 500)
    } catch {
      toast.error('Failed to dismiss')
      // Rollback optimistic update on failure
      fetchNotifications()
    } finally {
      setDismissing(null)
    }
  }

  // ── Dismiss alert (localStorage) ────────────────────────────────────────
  function handleDismissAlert(id: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }

  // ── Mark all read ────────────────────────────────────────────────────────
  function handleMarkAllRead() {
    // Dismiss all visible alerts via localStorage
    setDismissedIds((prev) => {
      const next = new Set(prev)
      alerts.forEach((a) => next.add(a.id))
      saveDismissed(next)
      return next
    })
    // Batch-dismiss all pending sources
    if (pendingSources.length > 0) {
      const ids = pendingSources.map((s) => s.id)
      setPendingSources([])
      fetch('/api/sources/dismiss', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_ids: ids }),
      }).then(() => setTimeout(fetchNotifications, 500)).catch(() => fetchNotifications())
    }
  }

  function startEdit(src: PendingSource) {
    setEditingId(src.id)
    setEditName(src.telegram_group_name || src.name || '')
  }

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
        <div style={{ width: 1, height: 12, background: 'var(--border-subtle)', margin: '0 12px', flexShrink: 0 }} />
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
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2">
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
                {(badgeCount > 0 || visibleAlerts.length > 0) && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
                  >
                    <CheckCheck size={11} /> Mark all read
                  </button>
                )}
              </div>

              {/* Body */}
              {pendingSources.length === 0 && visibleAlerts.length === 0 ? (
                <EmptyNotifications />
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>

                  {/* ── New Sources section ── */}
                  {pendingSources.length > 0 && (
                    <>
                      <SectionLabel label="New Sources" count={pendingSources.length} />
                      {pendingSources.map((src) => (
                        <SourceNotifItem
                          key={src.id}
                          src={src}
                          isEditing={editingId === src.id}
                          editName={editName}
                          isActivating={activating === src.id}
                          isDismissing={dismissing === src.id}
                          onStartEdit={() => startEdit(src)}
                          onEditChange={setEditName}
                          onActivate={() => handleActivate(src)}
                          onCancelEdit={() => setEditingId(null)}
                          onDismiss={() => handleDismissSource(src.id)}
                        />
                      ))}
                    </>
                  )}

                  {/* ── Recent Alerts section ── */}
                  {visibleAlerts.length > 0 && (
                    <>
                      <SectionLabel label="Recent Alerts" count={visibleAlerts.length} />
                      {visibleAlerts.map((alert) => (
                        <AlertNotifItem
                          key={alert.id}
                          alert={alert}
                          onDismiss={() => handleDismissAlert(alert.id)}
                          onClose={() => setOpen(false)}
                        />
                      ))}
                    </>
                  )}
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
                  display: 'flex',
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

/* ─── Section label ──────────────────────────────────────────────────────── */
function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        padding: '8px 16px 4px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          color: 'var(--text-muted)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: '1px 5px',
        }}
      >
        {count}
      </span>
    </div>
  )
}

/* ─── Source notification item ───────────────────────────────────────────── */
function SourceNotifItem({
  src,
  isEditing,
  editName,
  isActivating,
  isDismissing,
  onStartEdit,
  onEditChange,
  onActivate,
  onCancelEdit,
  onDismiss,
}: {
  src: PendingSource
  isEditing: boolean
  editName: string
  isActivating: boolean
  isDismissing: boolean
  onStartEdit: () => void
  onEditChange: (v: string) => void
  onActivate: () => void
  onCancelEdit: () => void
  onDismiss: () => void
}) {
  const displayName = src.telegram_group_name || src.name
  const timeAgo     = src.detected_at
    ? formatDistanceToNow(new Date(src.detected_at), { addSuffix: true })
    : 'just now'

  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Send size={12} style={{ color: 'var(--accent)' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>
          New group detected
        </p>

        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  onActivate()
              if (e.key === 'Escape') onCancelEdit()
            }}
            style={{
              width: '100%',
              fontSize: 12.5,
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
            title="Click to rename"
            style={{
              fontSize: 12.5,
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
          >
            {displayName}
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {src.external_id && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {src.external_id}
            </span>
          )}
          {src.external_id && <span style={{ fontSize: 10, color: 'var(--border-default)' }}>·</span>}
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
          <>
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
            <button
              onClick={onDismiss}
              disabled={isDismissing}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                opacity: isDismissing ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--severity-critical)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
            >
              {isDismissing ? '…' : 'Dismiss'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Alert notification item ────────────────────────────────────────────── */
function AlertNotifItem({
  alert,
  onDismiss,
  onClose,
}: {
  alert: NotifAlert
  onDismiss: () => void
  onClose: () => void
}) {
  const isCritical = alert.severity === 'critical'
  const color      = isCritical ? 'var(--severity-critical)' : 'var(--severity-high)'
  const bg         = isCritical ? 'rgba(248,81,73,0.08)' : 'rgba(227,179,65,0.08)'
  const timeAgo    = formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })

  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <AlertTriangle size={12} style={{ color }} />
      </div>

      {/* Content — clickable, navigates to /alerts */}
      <Link
        href="/alerts"
        onClick={onClose}
        style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}
      >
        <p style={{ fontSize: 10.5, fontWeight: 600, color, marginBottom: 2, textTransform: 'capitalize' }}>
          {alert.severity} alert
        </p>
        <p
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {alert.title}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {alert.source?.name && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{alert.source.name}</span>
          )}
          {alert.source?.name && <span style={{ fontSize: 10, color: 'var(--border-default)' }}>·</span>}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo}</span>
        </div>
      </Link>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          flexShrink: 0,
          marginTop: 1,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
        title="Dismiss"
      >
        <X size={11} />
      </button>
    </div>
  )
}

/* ─── Empty state ────────────────────────────────────────────────────────── */
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
      <Bell size={24} style={{ color: 'var(--border-default)' }} />
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
        All caught up
      </p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 230 }}>
        No new groups or active alerts right now
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
