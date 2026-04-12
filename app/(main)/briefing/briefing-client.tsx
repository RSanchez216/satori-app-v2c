'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Bot, Send, RefreshCw, Clock, Moon, Sun,
  MessageSquare, Mail, CheckCircle2, XCircle,
  Loader2, ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ToriSettings, ToriActivityLog } from '@/types/database'

// ─── Time helpers ─────────────────────────────────────────────────────────────

function generateTimeOptions(): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
      const ampm = h < 12 ? 'AM' : 'PM'
      const label = `${h12}:${String(m).padStart(2, '0')} ${ampm}`
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      opts.push({ label, value })
    }
  }
  return opts
}

function to12h(time24: string): string {
  const opts = generateTimeOptions()
  return opts.find(o => o.value === time24)?.label ?? time24
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: checked ? '#3ecfcf' : '#1e2530',
        border: 'none', cursor: 'pointer',
        position: 'relative', transition: 'background 0.2s',
        flexShrink: 0, outline: 'none',
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: checked ? '#0a0f18' : '#4a5a6a',
        position: 'absolute', top: 3,
        left: checked ? 23 : 3,
        transition: 'left 0.2s',
      }} />
    </button>
  )
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = useMemo(() => generateTimeOptions(), [])
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          background: '#0a0f18', border: '1px solid #1e2530',
          borderRadius: 8, color: '#e6edf3',
          padding: '8px 36px 8px 12px',
          fontSize: 13, cursor: 'pointer', outline: 'none',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown
        size={13}
        style={{ position: 'absolute', right: 10, color: '#4a5a6a', pointerEvents: 'none' }}
      />
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: '#4a5a6a', marginBottom: 16,
    }}>
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11.5, fontWeight: 600, color: '#8899a6', marginBottom: 6 }}>
      {children}
    </p>
  )
}

function CyanButton({
  onClick, disabled, loading, children, outline,
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
  outline?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8,
        fontSize: 13, fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.55 : 1,
        transition: 'all 0.15s',
        background: outline ? 'transparent' : '#3ecfcf',
        color: outline ? '#3ecfcf' : '#0a0f18',
        border: outline ? '1px solid rgba(62,207,207,0.35)' : 'none',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
      {children}
    </button>
  )
}

// ─── Briefing Schedule Card ───────────────────────────────────────────────────

interface BriefingCardProps {
  icon: React.ReactNode
  title: string
  description: string
  enabled: boolean
  onToggle: (v: boolean) => void
  time: string
  onTimeChange: (v: string) => void
  chatIdField?: React.ReactNode
  onSave: () => void
  saving: boolean
  onSendNow: () => void
  sending: boolean
  comingSoon?: boolean
}

function BriefingCard({
  icon, title, description, enabled, onToggle,
  time, onTimeChange, chatIdField,
  onSave, saving, onSendNow, sending, comingSoon,
}: BriefingCardProps) {
  return (
    <div style={{
      background: '#0d1117', border: '1px solid #1e2530', borderRadius: 12,
      padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(62,207,207,0.08)', border: '1px solid rgba(62,207,207,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#3ecfcf', flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3', lineHeight: 1.3 }}>{title}</p>
            <p style={{ fontSize: 11.5, color: '#4a5a6a', marginTop: 2 }}>{description}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: enabled ? '#3ecfcf' : '#4a5a6a', fontWeight: 600 }}>
            {enabled ? 'On' : 'Off'}
          </span>
          <Toggle checked={enabled} onChange={onToggle} />
        </div>
      </div>

      {/* Time */}
      <div>
        <FieldLabel>Send time (Chicago CT)</FieldLabel>
        <TimeSelect value={time} onChange={onTimeChange} />
      </div>

      {/* Optional chat ID field */}
      {chatIdField && (
        <div>{chatIdField}</div>
      )}

      {/* Coming soon note */}
      {comingSoon && (
        <p style={{
          fontSize: 11.5, color: '#4a5a6a', fontStyle: 'italic',
          background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '8px 12px',
        }}>
          Morning briefing edge function is in development.
          &quot;Send Now&quot; will confirm config but no message will be sent yet.
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: '1px solid #111820' }}>
        <CyanButton onClick={onSave} loading={saving}>
          {saving ? 'Saving…' : 'Save'}
        </CyanButton>
        <CyanButton onClick={onSendNow} loading={sending} outline>
          {sending ? 'Sending…' : <><Send size={12} /> Send Now</>}
        </CyanButton>
      </div>
    </div>
  )
}

// ─── History table ────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  evening_briefing:       { label: 'Evening', bg: 'rgba(62,207,207,0.1)',  color: '#3ecfcf' },
  morning_briefing:       { label: 'Morning', bg: 'rgba(86,211,100,0.1)', color: '#56d364' },
  evening_briefing_error: { label: 'Error',   bg: 'rgba(248,81,73,0.1)',  color: '#f85149' },
}

function HistoryTable({
  rows, loading, onRefresh,
}: {
  rows: ToriActivityLog[]
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2530', borderRadius: 12, overflow: 'hidden' }}>
      {/* Table header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #111820',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>Briefing History</p>
          <p style={{ fontSize: 11.5, color: '#4a5a6a', marginTop: 2 }}>Last 30 entries</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 7,
            fontSize: 12, fontWeight: 600,
            background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2530',
            color: '#8899a6', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '52px 20px', textAlign: 'center' }}>
          <MessageSquare size={28} style={{ color: '#1e2530', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#4a5a6a' }}>No briefings sent yet.</p>
          <p style={{ fontSize: 12, color: '#2a3545', marginTop: 4 }}>
            Configure your schedule above and click Send Now to test.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #111820' }}>
                {['Type', 'Sent At', 'Status', 'Details'].map(h => (
                  <th key={h} style={{
                    padding: '10px 20px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: '#4a5a6a',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const style = TYPE_STYLES[row.activity_type] ?? TYPE_STYLES['evening_briefing']
                const isError = row.activity_type === 'evening_briefing_error'
                const ts = new Date(row.created_at)
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < rows.length - 1 ? '1px solid #0e1420' : 'none',
                      background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent',
                    }}
                  >
                    {/* Type badge */}
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                        background: style.bg, color: style.color,
                      }}>
                        {style.label}
                      </span>
                    </td>

                    {/* Sent at */}
                    <td style={{ padding: '12px 20px' }}>
                      <p style={{ fontSize: 12.5, color: '#c8d8e8', whiteSpace: 'nowrap' }}>
                        {format(ts, 'MMM d, yyyy')}
                      </p>
                      <p style={{ fontSize: 11, color: '#4a5a6a', marginTop: 2, whiteSpace: 'nowrap' }}>
                        {format(ts, 'h:mm a')} · {formatDistanceToNow(ts, { addSuffix: true })}
                      </p>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 20px' }}>
                      {isError ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#f85149', fontSize: 12 }}>
                          <XCircle size={13} /> Failed
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#56d364', fontSize: 12 }}>
                          <CheckCircle2 size={13} /> Sent
                        </span>
                      )}
                    </td>

                    {/* Details / preview */}
                    <td style={{ padding: '12px 20px', maxWidth: 340 }}>
                      <p style={{
                        fontSize: 12, color: '#6a7a8a', lineHeight: 1.5,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: 300,
                      }}>
                        {row.description
                          ? row.description.slice(0, 100) + (row.description.length > 100 ? '…' : '')
                          : row.title}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialSettings: ToriSettings | null
  initialHistory:  ToriActivityLog[]
}

export function BriefingClient({ initialSettings, initialHistory }: Props) {
  const supabase = createClient()

  // ── Settings state ─────────────────────────────────────────────────────────
  const s = initialSettings

  // Evening
  const [eveningEnabled,  setEveningEnabled]  = useState(s?.briefing_enabled ?? true)
  const [eveningTime,     setEveningTime]     = useState(s?.briefing_time ?? '18:00')
  const [telegramChatId,  setTelegramChatId]  = useState(s?.briefing_telegram_chat_id ?? '')
  const [eveningSaving,   setEveningSaving]   = useState(false)
  const [eveningSending,  setEveningSending]  = useState(false)

  // Morning
  const [morningEnabled,  setMorningEnabled]  = useState(s?.morning_enabled ?? false)
  const [morningTime,     setMorningTime]     = useState(s?.morning_time ?? '07:00')
  const [morningSaving,   setMorningSaving]   = useState(false)
  const [morningSending,  setMorningSending]  = useState(false)

  // Channels
  const [emailEnabled,    setEmailEnabled]    = useState(s?.email_briefing_enabled ?? false)
  const [briefingEmail,   setBriefingEmail]   = useState(s?.briefing_email ?? '')
  const [channelsSaving,  setChannelsSaving]  = useState(false)

  // History
  const [history,         setHistory]         = useState<ToriActivityLog[]>(initialHistory)
  const [historyLoading,  setHistoryLoading]  = useState(false)

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function updateSettings(fields: Record<string, unknown>) {
    if (!s?.id) throw new Error('No settings row found')
    const { error } = await supabase
      .from('tori_settings')
      .update(fields)
      .eq('id', s.id)
    if (error) throw error
  }

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const { data } = await supabase
        .from('tori_activity_log')
        .select('*')
        .in('activity_type', ['evening_briefing', 'morning_briefing', 'evening_briefing_error'])
        .order('created_at', { ascending: false })
        .limit(30)
      setHistory((data ?? []) as ToriActivityLog[])
    } finally {
      setHistoryLoading(false)
    }
  }, [supabase])

  // ── Save handlers ──────────────────────────────────────────────────────────

  async function saveEvening() {
    setEveningSaving(true)
    try {
      await updateSettings({
        briefing_enabled:          eveningEnabled,
        briefing_time:             eveningTime,
        briefing_telegram_chat_id: telegramChatId.trim() || null,
      })
      toast.success('Evening briefing settings saved.')
    } catch {
      toast.error('Failed to save evening settings.')
    } finally {
      setEveningSaving(false)
    }
  }

  async function saveMorning() {
    setMorningSaving(true)
    try {
      await updateSettings({
        morning_enabled: morningEnabled,
        morning_time:    morningTime,
      })
      toast.success('Morning briefing settings saved.')
    } catch {
      toast.error('Failed to save morning settings.')
    } finally {
      setMorningSaving(false)
    }
  }

  async function saveChannels() {
    setChannelsSaving(true)
    try {
      await updateSettings({
        email_briefing_enabled: emailEnabled,
        briefing_email:         briefingEmail.trim() || null,
      })
      toast.success('Delivery channel settings saved.')
    } catch {
      toast.error('Failed to save channel settings.')
    } finally {
      setChannelsSaving(false)
    }
  }

  // ── Send Now handlers ──────────────────────────────────────────────────────

  async function sendEvening() {
    setEveningSending(true)
    try {
      const res  = await fetch('/api/tori/send-briefing', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Unknown error')
      toast.success('Evening briefing sent to Telegram!')
      await refreshHistory()
    } catch (err) {
      toast.error(`Send failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setEveningSending(false)
    }
  }

  async function sendMorning() {
    setMorningSending(true)
    try {
      const res  = await fetch('/api/tori/send-morning-briefing', { method: 'POST' })
      const data = await res.json()
      if (data.note) toast.info(data.note)
      else toast.success('Morning briefing sent!')
      await refreshHistory()
    } catch {
      toast.error('Failed to trigger morning briefing.')
    } finally {
      setMorningSending(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(62,207,207,0.08)', border: '1px solid rgba(62,207,207,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3ecfcf',
          }}>
            <Bot size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Tori Briefing
            </h1>
            <p style={{ fontSize: 13, color: '#4a5a6a', marginTop: 3 }}>
              Configure when and how Tori reaches you
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 14px', borderRadius: 20,
          background: 'rgba(86,211,100,0.08)', border: '1px solid rgba(86,211,100,0.2)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: '#56d364',
            boxShadow: '0 0 6px #56d364', display: 'inline-block',
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#56d364' }}>Tori Active</span>
        </div>
      </div>

      {/* ── No settings warning ───────────────────────────────────────────── */}
      {!s && (
        <div style={{
          background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)',
          borderRadius: 10, padding: '14px 18px', marginBottom: 24,
          fontSize: 13, color: '#f85149',
        }}>
          ⚠️ Could not load settings. Run the migration in Supabase SQL editor first
          (supabase/migrations/20260412_tori_settings.sql).
        </div>
      )}

      {/* ── Section 1: Briefing Schedule ─────────────────────────────────── */}
      <SectionTitle>Briefing Schedule</SectionTitle>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        <BriefingCard
          icon={<Moon size={17} />}
          title="Evening Briefing"
          description="Daily operational summary sent to Telegram"
          enabled={eveningEnabled}
          onToggle={setEveningEnabled}
          time={eveningTime}
          onTimeChange={setEveningTime}
          chatIdField={
            <div>
              <FieldLabel>Telegram Chat ID</FieldLabel>
              <input
                type="text"
                value={telegramChatId}
                onChange={e => setTelegramChatId(e.target.value)}
                placeholder="-100xxxxxxxxxx"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#0a0f18', border: '1px solid #1e2530',
                  borderRadius: 8, color: '#e6edf3',
                  padding: '8px 12px', fontSize: 13,
                  outline: 'none', fontFamily: 'monospace',
                }}
              />
              <p style={{ fontSize: 11, color: '#2a3545', marginTop: 5 }}>
                The group or chat ID where Tori sends briefings. Get it by checking the Telegram bot logs.
              </p>
            </div>
          }
          onSave={saveEvening}
          saving={eveningSaving}
          onSendNow={sendEvening}
          sending={eveningSending}
        />

        <BriefingCard
          icon={<Sun size={17} />}
          title="Morning Briefing"
          description="Overnight summary and day preview sent to Telegram"
          enabled={morningEnabled}
          onToggle={setMorningEnabled}
          time={morningTime}
          onTimeChange={setMorningTime}
          onSave={saveMorning}
          saving={morningSaving}
          onSendNow={sendMorning}
          sending={morningSending}
          comingSoon
        />
      </div>

      {/* ── Section 2: Delivery Channels ─────────────────────────────────── */}
      <SectionTitle>Delivery Channels</SectionTitle>
      <div style={{ background: '#0d1117', border: '1px solid #1e2530', borderRadius: 12, padding: '20px 22px', marginBottom: 28 }}>

        {/* Telegram row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, paddingBottom: 18, borderBottom: '1px solid #111820',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'rgba(62,207,207,0.07)', border: '1px solid rgba(62,207,207,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Send size={15} style={{ color: '#3ecfcf' }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Telegram</p>
              <p style={{ fontSize: 11.5, color: '#4a5a6a', marginTop: 2 }}>
                {telegramChatId
                  ? <span style={{ fontFamily: 'monospace', color: '#3ecfcf' }}>Chat {telegramChatId}</span>
                  : 'No chat ID configured'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#56d364' }}>Connected</span>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#56d364' }} />
          </div>
        </div>

        {/* Email row */}
        <div style={{ paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(227,179,65,0.07)', border: '1px solid rgba(227,179,65,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Mail size={15} style={{ color: '#e3b341' }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Email</p>
                <p style={{ fontSize: 11.5, color: '#4a5a6a', marginTop: 2 }}>Receive briefings as email summaries</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: emailEnabled ? '#3ecfcf' : '#4a5a6a', fontWeight: 600 }}>
                {emailEnabled ? 'On' : 'Off'}
              </span>
              <Toggle checked={emailEnabled} onChange={setEmailEnabled} />
            </div>
          </div>

          {emailEnabled && (
            <div style={{ marginBottom: 16, paddingLeft: 46 }}>
              <FieldLabel>Email address</FieldLabel>
              <input
                type="email"
                value={briefingEmail}
                onChange={e => setBriefingEmail(e.target.value)}
                placeholder="ops@yourcompany.com"
                style={{
                  width: '100%', maxWidth: 340, boxSizing: 'border-box',
                  background: '#0a0f18', border: '1px solid #1e2530',
                  borderRadius: 8, color: '#e6edf3',
                  padding: '8px 12px', fontSize: 13, outline: 'none',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
            </div>
          )}

          <CyanButton onClick={saveChannels} loading={channelsSaving}>
            {channelsSaving ? 'Saving…' : 'Save Channels'}
          </CyanButton>
        </div>
      </div>

      {/* ── Section 3: History ────────────────────────────────────────────── */}
      <SectionTitle>Briefing History</SectionTitle>
      <HistoryTable rows={history} loading={historyLoading} onRefresh={refreshHistory} />

      {/* spin keyframe */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
