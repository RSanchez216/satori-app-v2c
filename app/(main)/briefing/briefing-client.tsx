'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Bot, Plus, Send, Trash2, Copy, Pencil, RefreshCw,
  Loader2, ChevronDown, X, CheckCircle2, XCircle,
  Moon, Sun, Calendar, Mail, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type {
  BriefingWithRecipients, BriefingRecipient,
  BriefingHistory, RecipientResult,
} from '@/types/database'

// ─── Constants ────────────────────────────────────────────────────────────────

const TOPIC_OPTIONS = [
  { value: 'all',         label: 'All Topics' },
  { value: 'dispatch',    label: 'Dispatch' },
  { value: 'safety',      label: 'Safety' },
  { value: 'fleet',       label: 'Fleet' },
  { value: 'hr',          label: 'HR' },
  { value: 'accounting',  label: 'Accounting' },
  { value: 'compliance',  label: 'Compliance' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'driver',      label: 'Driver' },
]

const SEVERITY_OPTIONS = [
  { value: 'low',      label: 'Low+' },
  { value: 'medium',   label: 'Medium+' },
  { value: 'high',     label: 'High+' },
  { value: 'critical', label: 'Critical only' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const FREQ_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  daily:   { bg: 'rgba(var(--accent-rgb),0.1)',   color: 'var(--accent)',        label: 'Daily' },
  weekly:  { bg: 'var(--kb-purple-dim)',           color: 'var(--kb-purple)',     label: 'Weekly' },
  monthly: { bg: 'rgba(227,179,65,0.1)',           color: 'var(--severity-high)', label: 'Monthly' },
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  success: { color: 'var(--severity-low)',      label: 'Sent' },
  partial: { color: 'var(--severity-high)',     label: 'Partial' },
  error:   { color: 'var(--severity-critical)', label: 'Error' },
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function genTimeOptions() {
  const opts: { label: string; value: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
      const ampm = h < 12 ? 'AM' : 'PM'
      opts.push({
        label: `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
        value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      })
    }
  }
  return opts
}

function to12h(t: string) {
  return genTimeOptions().find(o => o.value === t)?.label ?? t
}

function scheduleLabel(b: BriefingWithRecipients) {
  const time = to12h(b.send_time)
  if (b.frequency === 'daily')   return `Daily at ${time} CT`
  if (b.frequency === 'weekly')  return `Weekly · ${DAYS[b.weekly_day ?? 0]}s at ${time} CT`
  if (b.frequency === 'monthly') return `Monthly · 1st at ${time} CT`
  return time
}

// ─── Next send calculation ────────────────────────────────────────────────────

function getNextSend(b: BriefingWithRecipients): Date {
  const TZ = b.timezone ?? 'America/Chicago'
  const now = new Date()

  // Build a UTC Date for "YYYY-MM-DD at HH:MM in TZ"
  function buildCTDate(ctDateStr: string, hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number)
    for (const off of [4, 5, 6, 7]) {
      const mid = new Date(`${ctDateStr}T${String(off).padStart(2, '0')}:00:00Z`)
      const localH = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
          .formatToParts(mid).find(p => p.type === 'hour')?.value ?? '99', 10,
      )
      if (localH === 0) return new Date(mid.getTime() + (h * 60 + m) * 60000)
    }
    return new Date(`${ctDateStr}T${String(h + 6).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  }

  // Start from today's CT date
  const todayCT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now)
  const [ty, tm, td] = todayCT.split('-').map(Number)

  for (let offset = 0; offset < 400; offset++) {
    const probeUTC  = new Date(Date.UTC(ty, tm - 1, td + offset, 12, 0, 0))
    const probeCT   = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(probeUTC)
    const dow       = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(probeUTC),
    )
    const dom       = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).format(probeUTC))

    let matches = false
    if (b.frequency === 'daily')        matches = true
    else if (b.frequency === 'weekly')  matches = dow === (b.weekly_day ?? 0)
    else if (b.frequency === 'monthly') matches = dom === 1

    if (matches) {
      const candidate = buildCTDate(probeCT, b.send_time)
      if (candidate > now) return candidate
    }
  }

  return new Date(now.getTime() + 24 * 3600 * 1000)
}

function formatNextSend(b: BriefingWithRecipients): string {
  if (!b.is_enabled) return 'Paused'

  const next = getNextSend(b)
  const now  = new Date()
  const diffMs   = next.getTime() - now.getTime()
  if (diffMs <= 0) return 'Sending now…'

  const TZ       = b.timezone ?? 'America/Chicago'
  const diffMins = Math.floor(diffMs / 60000)
  const h        = Math.floor(diffMins / 60)
  const m        = diffMins % 60
  const countdown = h > 0 ? `in ${h}h ${m}m` : `in ${m}m`

  const timeLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(next)

  const nowDate  = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now)
  const nextDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(next)
  const tomDate  = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(now.getTime() + 25 * 3600 * 1000))

  const dayLabel = nowDate === nextDate ? 'Today'
    : tomDate === nextDate ? 'Tomorrow'
    : new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(next)

  return `${dayLabel} at ${timeLabel} CT · ${countdown}`
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useNextSend(b: BriefingWithRecipients): string {
  const [text, setText] = useState(() => formatNextSend(b))

  // Capture stable key fields to avoid stale closures
  const id         = b.id
  const is_enabled = b.is_enabled
  const send_time  = b.send_time
  const frequency  = b.frequency
  const weekly_day = b.weekly_day
  const timezone   = b.timezone

  useEffect(() => {
    const compute = () => formatNextSend(b)
    setText(compute())
    if (!is_enabled) return
    const timer = setInterval(() => setText(compute()), 60_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, is_enabled, send_time, frequency, weekly_day, timezone])

  return text
}

function useExpandedState(briefingId: string): [boolean, (v: boolean) => void] {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(`briefing-expanded-${briefingId}`) === 'true') setExpanded(true)
    } catch { /* ignore */ }
  }, [briefingId])

  function setAndStore(v: boolean) {
    setExpanded(v)
    try { localStorage.setItem(`briefing-expanded-${briefingId}`, String(v)) } catch { /* ignore */ }
  }

  return [expanded, setAndStore]
}

// ─── Delivery rate helper ─────────────────────────────────────────────────────

function getDeliveryRate(
  history: BriefingHistory[], briefingId: string, target: string,
): { label: string; color: string } {
  const results = history
    .filter(h => h.briefing_id === briefingId && Array.isArray(h.recipient_results) && h.recipient_results.length > 0)
    .flatMap(h => h.recipient_results as RecipientResult[])
    .filter(r => r.target === target)

  if (results.length < 3) return { label: 'New', color: 'var(--text-muted)' }
  const pct   = Math.round(results.filter(r => r.status === 'success').length / results.length * 100)
  const color = pct >= 90 ? 'var(--severity-low)' : pct >= 70 ? 'var(--severity-high)' : 'var(--severity-critical)'
  return { label: `${pct}%`, color }
}

// ─── Primitive components ─────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      width: 40, height: 22, borderRadius: 11,
      background: checked ? 'var(--accent)' : 'var(--border-subtle)',
      border: 'none', cursor: 'pointer', position: 'relative',
      transition: 'background 0.2s', flexShrink: 0, outline: 'none',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: checked ? '#ffffff' : 'var(--text-muted)',
        position: 'absolute', top: 3,
        left: checked ? 21 : 3, transition: 'left 0.2s',
      }} />
    </button>
  )
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = useMemo(genTimeOptions, [])
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        appearance: 'none', WebkitAppearance: 'none',
        background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, color: 'var(--text-primary)',
        padding: '7px 32px 7px 10px', fontSize: 13,
        cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
      }}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} style={{ position: 'absolute', right: 9, color: 'var(--text-muted)', pointerEvents: 'none' }} />
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 7 }}>
      {children}
    </p>
  )
}

function Input({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, color: 'var(--text-primary)', padding: '8px 12px',
        fontSize: 13, outline: 'none',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}
    />
  )
}

function IconBtn({ icon, label, onClick, primary, danger, loading, title }: {
  icon: React.ReactNode; label: string; onClick: () => void
  primary?: boolean; danger?: boolean; loading?: boolean; title?: string
}) {
  return (
    <button onClick={onClick} disabled={loading} title={title ?? label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
      cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
      border: '1px solid',
      background: primary ? 'var(--accent)' : 'transparent',
      color:  primary ? '#ffffff' : danger ? 'var(--severity-critical)' : 'var(--text-secondary)',
      borderColor: primary ? 'transparent' : danger ? 'rgba(248,81,73,0.25)' : 'var(--border-subtle)',
    }}>
      {loading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      {label}
    </button>
  )
}

// ─── StatusTooltip ────────────────────────────────────────────────────────────

function StatusTooltip({ row }: { row: BriefingHistory }) {
  const [show, setShow] = useState(false)
  const st      = STATUS_STYLE[row.status] ?? STATUS_STYLE.error
  const results = (row.recipient_results ?? []) as RecipientResult[]
  const hasDetail = results.length > 0 && (row.status === 'partial' || row.status === 'error')

  const badge = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: st.color, fontSize: 12, whiteSpace: 'nowrap',
      cursor: hasDetail ? 'help' : 'default' }}>
      {row.status === 'success'
        ? <CheckCircle2 size={12} />
        : row.status === 'partial' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {st.label}
    </span>
  )

  if (!hasDetail) return badge

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {badge}
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10,
          padding: '10px 14px', minWidth: 260,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 8 }}>Delivery Breakdown</p>
          {results.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              paddingBottom: i < results.length - 1 ? 7 : 0,
              marginBottom: i < results.length - 1 ? 7 : 0,
              borderBottom: i < results.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <span style={{ fontSize: 12, lineHeight: 1.4 }}>{r.status === 'success' ? '✅' : '❌'}</span>
              <span style={{ fontSize: 12 }}>{r.channel === 'telegram' ? '📱' : '✉️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>
                  {r.label ? `${r.label} · ` : ''}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  {r.target.length > 26 ? r.target.slice(0, 26) + '…' : r.target}
                </span>
                {r.error && (
                  <p style={{ fontSize: 10, color: 'var(--severity-critical)', marginTop: 3, lineHeight: 1.4 }}>{r.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── RecipientIcons (history table) ───────────────────────────────────────────

function RecipientIcons({ row }: { row: BriefingHistory }) {
  const results = (row.recipient_results ?? []) as RecipientResult[]

  if (results.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.recipients_succeeded}/{row.recipients_attempted}</span>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
      {results.map((r, i) => (
        <span key={i}
          title={`${r.label ? r.label + ' · ' : ''}${r.target} · ${r.status === 'success' ? 'Delivered' : 'Failed'}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5, fontSize: 12, cursor: 'default',
            background: r.status === 'success' ? 'rgba(86,211,100,0.12)' : 'rgba(248,81,73,0.12)',
            border:     `1px solid ${r.status === 'success' ? 'rgba(86,211,100,0.2)' : 'rgba(248,81,73,0.2)'}`,
          }}>
          {r.channel === 'telegram' ? '📱' : '✉️'}
        </span>
      ))}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>
        {row.recipients_succeeded}/{row.recipients_attempted}
      </span>
    </div>
  )
}

// ─── FullPreviewModal ─────────────────────────────────────────────────────────

function FullPreviewModal({ row, onClose }: { row: BriefingHistory; onClose: () => void }) {
  const results   = (row.recipient_results ?? []) as RecipientResult[]
  const text      = row.message_full_text ?? row.message_preview ?? '(no preview available)'
  const truncated = !row.message_full_text && !!row.message_preview

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70,
      background: 'rgba(8,13,20,0.88)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16,
        width: '100%', maxWidth: 600, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {row.briefings?.name ?? 'Briefing'}
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {format(new Date(row.sent_at), 'EEEE, MMMM d, yyyy · h:mm a')}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, padding: 16, marginBottom: 20,
            fontSize: 13, lineHeight: 1.75, color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', fontFamily: 'Inter, sans-serif',
          }}>
            {text}
          </div>

          {truncated && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20 }}>
              Full message text not stored for older entries.
            </p>
          )}

          {results.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-muted)', marginBottom: 10 }}>Delivery Breakdown</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--bg-elevated)', borderRadius: 8,
                    padding: '8px 12px', border: '1px solid var(--border-subtle)',
                  }}>
                    {r.status === 'success'
                      ? <CheckCircle2 size={14} style={{ color: 'var(--severity-low)', flexShrink: 0 }} />
                      : <XCircle size={14} style={{ color: 'var(--severity-critical)', flexShrink: 0 }} />}
                    <span style={{ fontSize: 14 }}>{r.channel === 'telegram' ? '📱' : '✉️'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {r.label && <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.label} · </span>}
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.target}</span>
                      {r.error && <p style={{ fontSize: 11, color: 'var(--severity-critical)', marginTop: 2 }}>{r.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SendConfirmPopover ───────────────────────────────────────────────────────

function SendConfirmPopover({
  briefing, sending, onConfirm, onCancel,
}: {
  briefing: BriefingWithRecipients
  sending: boolean
  onConfirm: (testRecipientId?: string) => void
  onCancel: () => void
}) {
  const [testMode, setTestMode] = useState(false)
  const active = briefing.briefing_recipients.filter(r => r.is_active)
  const testR  = active[0]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(8,13,20,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14,
        padding: '20px 24px', width: '100%', maxWidth: 380,
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Send {briefing.name} now?
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Generates a fresh briefing and delivers immediately.
        </p>

        {/* Recipient preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {active.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-hover)', borderRadius: 7,
              padding: '7px 10px', border: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 13 }}>{r.channel === 'telegram' ? '📱' : '✉️'}</span>
              <div style={{ minWidth: 0 }}>
                {r.label && <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.label} · </span>}
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  {r.target.length > 28 ? r.target.slice(0, 28) + '…' : r.target}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Test mode (only shows when 2+ recipients) */}
        {active.length > 1 && testR && (
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 8, marginBottom: 14,
            background: testMode ? 'rgba(62,207,207,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${testMode ? 'rgba(62,207,207,0.2)' : 'var(--border-subtle)'}`,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Test mode</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Send only to {testR.label ?? testR.target}
              </p>
            </div>
          </label>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={() => onConfirm(testMode && testR ? testR.id : undefined)}
            disabled={sending}
            style={{
              flex: 2, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'var(--accent)', color: '#ffffff', border: 'none',
              cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            {sending
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
              : 'Send Now →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ briefings, history }: { briefings: BriefingWithRecipients[]; history: BriefingHistory[] }) {
  const totalDelivered  = history.filter(h => h.status === 'success').length
  const cutoff7d        = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const last7Days       = history.filter(h => h.status === 'success' && new Date(h.sent_at) >= cutoff7d).length
  const activeBriefings = briefings.filter(b => b.is_enabled).length
  const totalAttempted  = history.reduce((s, h) => s + h.recipients_attempted, 0)
  const totalSucceeded  = history.reduce((s, h) => s + h.recipients_succeeded, 0)
  const deliveryRate    = totalAttempted > 0 ? `${Math.round(totalSucceeded / totalAttempted * 100)}%` : '—'

  const tiles = [
    { label: 'Total Delivered',  value: String(totalDelivered) },
    { label: 'Last 7 Days',      value: String(last7Days) },
    { label: 'Active Briefings', value: String(activeBriefings) },
    { label: 'Delivery Rate',    value: deliveryRate },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28,
    }}>
      {tiles.map(t => (
        <div key={t.label} style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 18px',
        }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', lineHeight: 1, letterSpacing: '-0.02em' }}>
            {t.value}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.04em' }}>{t.label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Morning Briefing Setup Card ──────────────────────────────────────────────

function MorningBriefingSetupCard({ onSetup, loading }: { onSetup: () => void; loading: boolean }) {
  return (
    <div style={{
      background: 'transparent', border: '1px dashed var(--border-subtle)', borderRadius: 14,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '32px 20px', gap: 12, minHeight: 220,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Sun size={20} style={{ color: 'var(--accent)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Morning Briefing</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, maxWidth: 200, lineHeight: 1.5 }}>
          Start the day with an 7 AM ops summary delivered to your team.
        </p>
      </div>
      <button onClick={onSetup} disabled={loading} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
        background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent)',
        border: '1px solid rgba(var(--accent-rgb),0.2)',
        cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
      }}>
        {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
        Set Up Morning Briefing
      </button>
    </div>
  )
}

// ─── Briefing Card ────────────────────────────────────────────────────────────

interface CardProps {
  briefing:          BriefingWithRecipients
  lastSent:          BriefingHistory | null
  history:           BriefingHistory[]
  onToggle:          (id: string, v: boolean) => void
  onEdit:            (b: BriefingWithRecipients) => void
  onCopy:            (b: BriefingWithRecipients) => void
  onDelete:          (id: string) => void
  onSendNow:         (id: string, testRecipientId?: string) => void
  sending:           boolean
  onAddRecipient:    (briefingId: string, r: Omit<BriefingRecipient, 'id' | 'briefing_id'>) => Promise<void>
  onRemoveRecipient: (briefingId: string, rId: string) => Promise<void>
}

function BriefingCard({
  briefing, lastSent, history,
  onToggle, onEdit, onCopy, onDelete, onSendNow, sending,
  onAddRecipient, onRemoveRecipient,
}: CardProps) {
  const [expanded,    setExpanded]    = useExpandedState(briefing.id)
  const [addOpen,     setAddOpen]     = useState(false)
  const [addChannel,  setAddChannel]  = useState<'telegram' | 'email'>('telegram')
  const [addTarget,   setAddTarget]   = useState('')
  const [addLabel,    setAddLabel]    = useState('')
  const [addLoading,  setAddLoading]  = useState(false)
  const [removingId,  setRemovingId]  = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const nextSendText = useNextSend(briefing)
  const freq         = FREQ_STYLE[briefing.frequency] ?? FREQ_STYLE.daily
  const activeR      = briefing.briefing_recipients?.filter(r => r.is_active) ?? []

  // Close confirm popover when send transitions from true → false
  const wasSendingRef = useRef(false)
  useEffect(() => {
    if (wasSendingRef.current && !sending) setShowConfirm(false)
    wasSendingRef.current = sending
  }, [sending])

  async function handleAdd() {
    if (!addTarget.trim()) return
    setAddLoading(true)
    await onAddRecipient(briefing.id, { channel: addChannel, target: addTarget.trim(), label: addLabel.trim() || null, is_active: true })
    setAddTarget(''); setAddLabel(''); setAddOpen(false)
    setAddLoading(false)
  }

  async function handleRemove(rId: string) {
    setRemovingId(rId)
    await onRemoveRecipient(briefing.id, rId)
    setRemovingId(null)
  }

  return (
    <>
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${briefing.is_enabled ? 'rgba(62,207,207,0.15)' : 'var(--border-subtle)'}`,
        borderRadius: 14, overflow: 'hidden',
        opacity: briefing.is_enabled ? 1 : 0.65,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top accent line */}
        <div style={{ height: 2, background: briefing.is_enabled ? 'var(--accent)' : 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Always-visible section */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Header: name + freq | toggle + chevron */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{briefing.name}</p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: freq.bg, color: freq.color }}>
                  {freq.label}
                </span>
              </div>
              {briefing.description && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{briefing.description}</p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Toggle checked={briefing.is_enabled} onChange={v => onToggle(briefing.id, v)} />
              <button onClick={() => setExpanded(!expanded)} style={{
                background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center',
              }}>
                <ChevronDown size={13} style={{
                  transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.2s',
                }} />
              </button>
            </div>
          </div>

          {/* Schedule + countdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{scheduleLabel(briefing)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: briefing.is_enabled ? 'normal' : 'italic', opacity: briefing.is_enabled ? 1 : 0.6 }}>
                {nextSendText}
              </span>
            </div>
          </div>

          {/* Topics */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {(briefing.topics?.includes('all') ? [{ value: 'all', label: 'All Topics' }]
              : TOPIC_OPTIONS.filter(o => briefing.topics?.includes(o.value))
            ).map(t => (
              <span key={t.value} style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)',
              }}>{t.label}</span>
            ))}
            {briefing.min_severity && briefing.min_severity !== 'low' && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(227,179,65,0.08)', color: 'var(--severity-high)', border: '1px solid rgba(227,179,65,0.15)',
              }}>
                {SEVERITY_OPTIONS.find(s => s.value === briefing.min_severity)?.label}
              </span>
            )}
          </div>

          {/* Collapsed footer: recipient count + Send Now */}
          {!expanded && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {activeR.length} recipient{activeR.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <IconBtn icon={<Send size={12} />} label="Send Now" primary loading={sending}
                  onClick={() => setShowConfirm(true)} />
              </div>
            </div>
          )}
        </div>

        {/* Expandable section */}
        <div style={{
          overflow: 'hidden',
          maxHeight: expanded ? '800px' : '0px',
          transition: 'max-height 0.2s ease',
        }}>
          <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Recipients with delivery rates */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                {activeR.length} recipient{activeR.length !== 1 ? 's' : ''}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeR.map(r => {
                  const rate = getDeliveryRate(history, briefing.id, r.target)
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: r.channel === 'telegram' ? 'rgba(41,182,246,0.1)' : 'var(--bg-elevated)',
                      }}>
                        {r.channel === 'telegram'
                          ? <Send size={11} style={{ color: '#29b6f6' }} />
                          : <Mail size={11} style={{ color: 'var(--text-secondary)' }} />}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>
                        {r.label && <span style={{ color: 'var(--text-primary)', marginRight: 5 }}>{r.label}</span>}
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                          {r.target.length > 22 ? r.target.slice(0, 22) + '…' : r.target}
                        </span>
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: rate.color, flexShrink: 0 }}
                        title={`Delivery rate for ${r.target}`}>
                        {rate.label}
                      </span>
                      <button onClick={() => handleRemove(r.id)} disabled={removingId === r.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 3, lineHeight: 1, flexShrink: 0 }}>
                        {removingId === r.id
                          ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                          : <X size={11} />}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Add recipient inline */}
              {!addOpen ? (
                <button onClick={() => setAddOpen(true)} style={{
                  marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: '1px dashed var(--border-subtle)', borderRadius: 7,
                  padding: '5px 10px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, width: '100%',
                }}>
                  <Plus size={11} /> Add recipient
                </button>
              ) : (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8,
                  background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['telegram', 'email'] as const).map(ch => (
                      <button key={ch} type="button" onClick={() => setAddChannel(ch)} style={{
                        flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', border: '1px solid',
                        background: addChannel === ch ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
                        color:      addChannel === ch ? 'var(--accent)' : 'var(--text-muted)',
                        borderColor: addChannel === ch ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border-subtle)',
                      }}>{ch === 'telegram' ? 'Telegram' : 'Email'}</button>
                    ))}
                  </div>
                  <input value={addTarget} onChange={e => setAddTarget(e.target.value)}
                    placeholder={addChannel === 'telegram' ? 'Chat ID (-100...)' : 'email@domain.com'}
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                      color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, outline: 'none',
                      fontFamily: addChannel === 'telegram' ? 'monospace' : 'inherit' }}
                  />
                  <input value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder='Label (e.g. "Owner")'
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                      color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleAdd} disabled={!addTarget.trim() || addLoading} style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
                      opacity: !addTarget.trim() || addLoading ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}>
                      {addLoading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                      Add
                    </button>
                    <button onClick={() => { setAddOpen(false); setAddTarget(''); setAddLabel('') }} style={{
                      padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'transparent',
                      border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Expanded footer: last sent + Edit/Copy/Delete/Send */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {lastSent
                  ? <>Last sent {formatDistanceToNow(new Date(lastSent.sent_at), { addSuffix: true })}
                      <span style={{ color: STATUS_STYLE[lastSent.status]?.color ?? 'var(--text-muted)', marginLeft: 5 }}>
                        · {STATUS_STYLE[lastSent.status]?.label}
                      </span>
                    </>
                  : 'Never sent'}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <IconBtn icon={<Send size={12} />} label="Send Now" primary loading={sending} onClick={() => setShowConfirm(true)} />
                <IconBtn icon={<Pencil size={12} />} label="Edit"   onClick={() => onEdit(briefing)} />
                <IconBtn icon={<Copy size={12} />}   label="Copy"   onClick={() => onCopy(briefing)} />
                <IconBtn icon={<Trash2 size={12} />} label="Delete" danger onClick={() => onDelete(briefing.id)} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Confirmation popover (rendered outside card to avoid clipping) */}
      {showConfirm && (
        <SendConfirmPopover
          briefing={briefing}
          sending={sending}
          onConfirm={testRecipientId => onSendNow(briefing.id, testRecipientId)}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// ─── Briefing Modal ───────────────────────────────────────────────────────────

interface ModalForm {
  name: string; description: string
  frequency: 'daily' | 'weekly' | 'monthly'; weekly_day: number
  send_time: string; topics: string[]; min_severity: string
}

type ModalRecipient = { channel: 'telegram' | 'email'; target: string; label: string }

const DEFAULT_FORM: ModalForm = {
  name: '', description: '', frequency: 'daily',
  weekly_day: 1, send_time: '18:00', topics: ['all'], min_severity: 'low',
}

function BriefingModal({
  mode, briefing, onSave, onClose, saving,
}: {
  mode: 'new' | 'edit'
  briefing?: BriefingWithRecipients
  onSave: (form: ModalForm, recipients?: ModalRecipient[]) => Promise<void>
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<ModalForm>(() => mode === 'edit' && briefing ? {
    name:         briefing.name,
    description:  briefing.description ?? '',
    frequency:    briefing.frequency,
    weekly_day:   briefing.weekly_day ?? 1,
    send_time:    briefing.send_time,
    topics:       briefing.topics ?? ['all'],
    min_severity: briefing.min_severity ?? 'low',
  } : { ...DEFAULT_FORM })

  const [recipients, setRecipients] = useState<ModalRecipient[]>([])
  const [addCh,  setAddCh]  = useState<'telegram' | 'email'>('telegram')
  const [addTgt, setAddTgt] = useState('')
  const [addLbl, setAddLbl] = useState('')

  function set<K extends keyof ModalForm>(k: K, v: ModalForm[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function toggleTopic(t: string) {
    if (t === 'all') { set('topics', ['all']); return }
    const cur  = form.topics.includes('all') ? [] : [...form.topics]
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]
    set('topics', next.length === 0 ? ['all'] : next)
  }

  function addRecipient() {
    if (!addTgt.trim()) return
    setRecipients(r => [...r, { channel: addCh, target: addTgt.trim(), label: addLbl.trim() }])
    setAddTgt(''); setAddLbl('')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(8,13,20,0.82)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16,
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
            {mode === 'new' ? 'New Briefing' : `Edit — ${briefing?.name}`}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Name + description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <FieldLabel>Name</FieldLabel>
              <Input value={form.name} onChange={v => set('name', v)} placeholder="Evening Operations" />
            </div>
            <div>
              <FieldLabel>Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></FieldLabel>
              <Input value={form.description} onChange={v => set('description', v)} placeholder="Daily operational summary" />
            </div>
          </div>

          {/* Schedule */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>Schedule</p>

            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Frequency</FieldLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['daily', 'weekly', 'monthly'] as const).map(f => {
                  const s = FREQ_STYLE[f]; const active = form.frequency === f
                  return (
                    <button key={f} type="button" onClick={() => set('frequency', f)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: active ? s.bg : 'transparent',
                      color:      active ? s.color : 'var(--text-muted)',
                      borderColor: active ? s.color.replace(')', ',0.3)').replace('rgb', 'rgba') : 'var(--border-subtle)',
                    }}>{s.label}</button>
                  )
                })}
              </div>
            </div>

            {form.frequency === 'weekly' && (
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Day of week</FieldLabel>
                <div style={{ display: 'flex', gap: 4 }}>
                  {DAYS.map((d, i) => (
                    <button key={d} type="button" onClick={() => set('weekly_day', i)} style={{
                      flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: form.weekly_day === i ? 'var(--kb-purple-dim)' : 'transparent',
                      color:      form.weekly_day === i ? 'var(--kb-purple)' : 'var(--text-muted)',
                      borderColor: form.weekly_day === i ? 'rgba(179,146,240,0.3)' : 'var(--border-subtle)',
                    }}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <FieldLabel>Send time (Chicago CT)</FieldLabel>
              <TimeSelect value={form.send_time} onChange={v => set('send_time', v)} />
            </div>
          </div>

          {/* Filters */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>Filters</p>

            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Topics</FieldLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {TOPIC_OPTIONS.map(t => {
                  const active = form.topics.includes(t.value)
                  return (
                    <button key={t.value} type="button" onClick={() => toggleTopic(t.value)} style={{
                      padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: active ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
                      color:      active ? 'var(--accent)' : 'var(--text-muted)',
                      borderColor: active ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border-subtle)',
                    }}>{t.label}</button>
                  )
                })}
              </div>
            </div>

            <div>
              <FieldLabel>Minimum severity</FieldLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {SEVERITY_OPTIONS.map(s => {
                  const active = form.min_severity === s.value
                  return (
                    <button key={s.value} type="button" onClick={() => set('min_severity', s.value)} style={{
                      flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: active ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
                      color:      active ? 'var(--accent)' : 'var(--text-muted)',
                      borderColor: active ? 'rgba(var(--accent-rgb),0.25)' : 'var(--border-subtle)',
                    }}>{s.label}</button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Recipients (new mode only) */}
          {mode === 'new' && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>Recipients</p>

              {recipients.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {recipients.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                      background: 'var(--bg-elevated)', borderRadius: 7, padding: '7px 10px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 60 }}>{r.channel}</span>
                      {r.label && <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.label}</span>}
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', flex: 1 }}>{r.target}</span>
                      <button onClick={() => setRecipients(rs => rs.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
                background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['telegram', 'email'] as const).map(ch => (
                    <button key={ch} type="button" onClick={() => setAddCh(ch)} style={{
                      flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: addCh === ch ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
                      color:      addCh === ch ? 'var(--accent)' : 'var(--text-muted)',
                      borderColor: addCh === ch ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border-subtle)',
                    }}>{ch === 'telegram' ? 'Telegram' : 'Email'}</button>
                  ))}
                </div>
                <input value={addTgt} onChange={e => setAddTgt(e.target.value)}
                  placeholder={addCh === 'telegram' ? 'Chat ID (-100...)' : 'email@domain.com'}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                    color: 'var(--text-primary)', padding: '7px 10px', fontSize: 12, outline: 'none',
                    fontFamily: addCh === 'telegram' ? 'monospace' : 'inherit' }}
                />
                <input value={addLbl} onChange={e => setAddLbl(e.target.value)} placeholder='Label — "Owner", "Fleet Mgr"…'
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                    color: 'var(--text-primary)', padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={addRecipient} disabled={!addTgt.trim()} style={{
                  padding: '7px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent)',
                  border: '1px solid rgba(var(--accent-rgb),0.2)', cursor: 'pointer',
                  opacity: !addTgt.trim() ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  <Plus size={11} /> Add recipient
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={() => onSave(form, mode === 'new' ? recipients : undefined)} disabled={!form.name.trim() || saving}
              style={{
                flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
                opacity: !form.name.trim() || saving ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
              {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              {saving ? 'Saving…' : mode === 'new' ? 'Create Briefing' : 'Save Changes'}
            </button>
            <button onClick={onClose} style={{
              padding: '10px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History Section ──────────────────────────────────────────────────────────

function HistorySection({
  rows, briefingNames, onRefresh, loading,
}: {
  rows: BriefingHistory[]; briefingNames: string[]
  onRefresh: () => void; loading: boolean
}) {
  const [filter,     setFilter]     = useState('all')
  const [previewRow, setPreviewRow] = useState<BriefingHistory | null>(null)

  const filtered = filter === 'all' ? rows : rows.filter(r => r.briefings?.name === filter)

  return (
    <>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Briefing History</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Last 50 deliveries</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select value={filter} onChange={e => setFilter(e.target.value)} style={{
                appearance: 'none', WebkitAppearance: 'none',
                background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8,
                color: 'var(--text-secondary)', padding: '6px 28px 6px 10px', fontSize: 12, cursor: 'pointer', outline: 'none',
              }}>
                <option value="all">All briefings</option>
                {briefingNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown size={11} style={{ position: 'absolute', right: 8, color: 'var(--text-muted)', pointerEvents: 'none' }} />
            </div>
            <button onClick={onRefresh} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '52px 20px', textAlign: 'center' }}>
            <Moon size={28} style={{ color: 'var(--border-default)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No briefings sent yet.</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Configure a briefing above and click Send Now to test.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Briefing', 'Sent At', 'Status', 'Recipients', 'Preview'].map(h => (
                    <th key={h} style={{ padding: '10px 18px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                      textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const ts = new Date(row.sent_at)
                  const hasFullPreview = !!(row.message_full_text ?? row.message_preview)
                  return (
                    <tr key={row.id} style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent',
                    }}>
                      <td style={{ padding: '11px 18px' }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {row.briefings?.name ?? '—'}
                        </p>
                      </td>
                      <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>{format(ts, 'MMM d, yyyy')}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {format(ts, 'h:mm a')} · {formatDistanceToNow(ts, { addSuffix: true })}
                        </p>
                      </td>
                      <td style={{ padding: '11px 18px' }}>
                        <StatusTooltip row={row} />
                      </td>
                      <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
                        <RecipientIcons row={row} />
                      </td>
                      <td style={{ padding: '11px 18px', maxWidth: 280 }}>
                        {hasFullPreview ? (
                          <button onClick={() => setPreviewRow(row)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            textAlign: 'left', width: '100%',
                          }}>
                            <p style={{
                              fontSize: 11.5, color: 'var(--text-muted)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260,
                              textDecoration: 'underline', textDecorationColor: 'var(--border-default)',
                              transition: 'color 0.15s',
                            }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                            >
                              {row.error_message ?? row.message_preview ?? '—'}
                            </p>
                          </button>
                        ) : (
                          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                            {row.error_message ?? '—'}
                          </p>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full preview modal */}
      {previewRow && (
        <FullPreviewModal row={previewRow} onClose={() => setPreviewRow(null)} />
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialBriefings: BriefingWithRecipients[]
  initialHistory:   BriefingHistory[]
}

export function BriefingClient({ initialBriefings, initialHistory }: Props) {
  const supabase = createClient()

  const [briefings,       setBriefings]       = useState<BriefingWithRecipients[]>(initialBriefings)
  const [history,         setHistory]         = useState<BriefingHistory[]>(initialHistory)
  const [modal,           setModal]           = useState<{ mode: 'new' | 'edit'; briefing?: BriefingWithRecipients } | null>(null)
  const [modalSaving,     setModalSaving]     = useState(false)
  const [sending,         setSending]         = useState<Record<string, boolean>>({})
  const [historyLoad,     setHistoryLoad]     = useState(false)
  const [settingUpMorning, setSettingUpMorning] = useState(false)

  const lastSentMap = useMemo(() => {
    const m: Record<string, BriefingHistory> = {}
    for (const h of history) {
      if (h.briefing_id && !m[h.briefing_id]) m[h.briefing_id] = h
    }
    return m
  }, [history])

  const briefingNames = useMemo(() =>
    [...new Set(history.map(h => h.briefings?.name).filter(Boolean) as string[])],
    [history],
  )

  const hasMorningBriefing = briefings.some(b => b.name === 'Morning Briefing')

  // ── Refresh history ────────────────────────────────────────────────────────

  const reloadHistory = useCallback(async () => {
    setHistoryLoad(true)
    const { data } = await supabase
      .from('briefing_history')
      .select('*, briefings(name)')
      .order('sent_at', { ascending: false })
      .limit(50)
    if (data) setHistory(data as BriefingHistory[])
    setHistoryLoad(false)
  }, [supabase])

  // ── Toggle enable ──────────────────────────────────────────────────────────

  async function handleToggle(id: string, val: boolean) {
    setBriefings(bs => bs.map(b => b.id === id ? { ...b, is_enabled: val } : b))
    const res = await fetch(`/api/tori/briefings/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: val }),
    })
    if (!(await res.json()).ok) {
      setBriefings(bs => bs.map(b => b.id === id ? { ...b, is_enabled: !val } : b))
      toast.error('Failed to update briefing')
    }
  }

  // ── Send now (with optional test recipient) ────────────────────────────────

  async function handleSendNow(id: string, testRecipientId?: string) {
    setSending(s => ({ ...s, [id]: true }))
    try {
      const res = await fetch(`/api/tori/briefings/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testRecipientId ? { test_recipient_id: testRecipientId } : {}),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Unknown error')
      const label = data.test_mode ? ' (test mode)' : ''
      toast.success(`Briefing sent to ${data.recipients_succeeded} recipient${data.recipients_succeeded !== 1 ? 's' : ''}${label}!`)
      await reloadHistory()
    } catch (err) {
      toast.error(`Send failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setSending(s => ({ ...s, [id]: false }))
    }
  }

  // ── Modal save ─────────────────────────────────────────────────────────────

  async function handleModalSave(form: ModalForm, recipients?: ModalRecipient[]) {
    setModalSaving(true)
    try {
      if (modal?.mode === 'new') {
        const res  = await fetch('/api/tori/briefings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, recipients }),
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
        setBriefings(bs => [...bs, data.briefing as BriefingWithRecipients])
        toast.success(`"${form.name}" created!`)
      } else {
        const id   = modal!.briefing!.id
        const res  = await fetch(`/api/tori/briefings/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
        setBriefings(bs => bs.map(b => b.id === id
          ? { ...(data.briefing as BriefingWithRecipients), briefing_recipients: b.briefing_recipients }
          : b))
        toast.success('Changes saved.')
      }
      setModal(null)
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setModalSaving(false)
    }
  }

  // ── Copy ───────────────────────────────────────────────────────────────────

  async function handleCopy(b: BriefingWithRecipients) {
    const res  = await fetch('/api/tori/briefings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Copy of ${b.name}`, description: b.description,
        frequency: b.frequency, weekly_day: b.weekly_day,
        send_time: b.send_time, topics: b.topics,
        departments: b.departments, min_severity: b.min_severity,
        recipients: b.briefing_recipients.map(r => ({ channel: r.channel, target: r.target, label: r.label })),
      }),
    })
    const data = await res.json()
    if (data.ok) {
      setBriefings(bs => [...bs, data.briefing as BriefingWithRecipients])
      toast.success('Briefing duplicated.')
    } else {
      toast.error('Copy failed.')
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm('Delete this briefing and all its recipients? This cannot be undone.')) return
    const res = await fetch(`/api/tori/briefings/${id}`, { method: 'DELETE' })
    if ((await res.json()).ok) {
      setBriefings(bs => bs.filter(b => b.id !== id))
      toast.success('Briefing deleted.')
    } else {
      toast.error('Delete failed.')
    }
  }

  // ── Recipient management ───────────────────────────────────────────────────

  async function handleAddRecipient(briefingId: string, r: Omit<BriefingRecipient, 'id' | 'briefing_id'>) {
    const res  = await fetch(`/api/tori/briefings/${briefingId}/recipients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    })
    const data = await res.json()
    if (data.ok) {
      setBriefings(bs => bs.map(b =>
        b.id === briefingId
          ? { ...b, briefing_recipients: [...b.briefing_recipients, data.recipient] }
          : b,
      ))
      toast.success('Recipient added.')
    } else {
      toast.error('Failed to add recipient.')
    }
  }

  async function handleRemoveRecipient(briefingId: string, rId: string) {
    const res = await fetch(`/api/tori/briefings/${briefingId}/recipients/${rId}`, { method: 'DELETE' })
    if ((await res.json()).ok) {
      setBriefings(bs => bs.map(b =>
        b.id === briefingId
          ? { ...b, briefing_recipients: b.briefing_recipients.filter(r => r.id !== rId) }
          : b,
      ))
    } else {
      toast.error('Failed to remove recipient.')
    }
  }

  // ── Morning Briefing setup ─────────────────────────────────────────────────

  async function handleSetupMorning() {
    setSettingUpMorning(true)
    try {
      // Copy recipients from Evening Operations (or first briefing found)
      const evening    = briefings.find(b => b.name.toLowerCase().includes('evening')) ?? briefings[0]
      const recipients = evening?.briefing_recipients?.map(r => ({
        channel: r.channel, target: r.target, label: r.label,
      })) ?? []

      const res = await fetch('/api/tori/briefings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Morning Briefing',
          description: 'Daily morning operations summary',
          frequency: 'daily',
          send_time: '07:00',
          is_enabled: false,
          topics: ['all'],
          min_severity: 'low',
          recipients,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setBriefings(bs => [...bs, data.briefing as BriefingWithRecipients])
      toast.success('Morning Briefing created! Enable it when ready.')
    } catch (err) {
      toast.error(`Setup failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setSettingUpMorning(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          }}>
            <Bot size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Tori Briefing
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
              Automated intelligence delivered your way
            </p>
          </div>
        </div>
        <button onClick={() => setModal({ mode: 'new' })} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
          background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
        }}>
          <Plus size={14} /> New Briefing
        </button>
      </div>

      {/* Stats bar */}
      <StatsBar briefings={briefings} history={history} />

      {/* Briefing cards */}
      {briefings.length === 0 && hasMorningBriefing === false ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)', borderRadius: 14,
          padding: '64px 20px', textAlign: 'center', marginBottom: 32,
        }}>
          <Sun size={32} style={{ color: 'var(--border-default)', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 6 }}>No briefings configured yet.</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Create your first one with the button above.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16, marginBottom: 32,
        }}>
          {briefings.map(b => (
            <BriefingCard
              key={b.id}
              briefing={b}
              lastSent={lastSentMap[b.id] ?? null}
              history={history}
              onToggle={handleToggle}
              onEdit={br => setModal({ mode: 'edit', briefing: br })}
              onCopy={handleCopy}
              onDelete={handleDelete}
              onSendNow={handleSendNow}
              sending={!!sending[b.id]}
              onAddRecipient={handleAddRecipient}
              onRemoveRecipient={handleRemoveRecipient}
            />
          ))}
          {!hasMorningBriefing && (
            <MorningBriefingSetupCard onSetup={handleSetupMorning} loading={settingUpMorning} />
          )}
        </div>
      )}

      {/* History */}
      <HistorySection
        rows={history}
        briefingNames={briefingNames}
        onRefresh={reloadHistory}
        loading={historyLoad}
      />

      {/* Edit/create modal */}
      {modal && (
        <BriefingModal
          mode={modal.mode}
          briefing={modal.briefing}
          onSave={handleModalSave}
          onClose={() => setModal(null)}
          saving={modalSaving}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
