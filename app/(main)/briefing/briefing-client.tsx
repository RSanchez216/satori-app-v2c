'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Bot, Plus, Send, Trash2, Copy, Pencil, RefreshCw,
  Loader2, ChevronDown, X, CheckCircle2, XCircle,
  Moon, Sun, Calendar, Mail,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type {
  BriefingWithRecipients, BriefingRecipient,
  BriefingHistory,
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
  daily:   { bg: 'rgba(62,207,207,0.1)',    color: '#3ecfcf',  label: 'Daily' },
  weekly:  { bg: 'rgba(179,146,240,0.12)',  color: '#b392f0',  label: 'Weekly' },
  monthly: { bg: 'rgba(227,179,65,0.1)',    color: '#e3b341',  label: 'Monthly' },
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  success: { color: '#56d364', label: 'Sent' },
  partial: { color: '#e3b341', label: 'Partial' },
  error:   { color: '#f85149', label: 'Error' },
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

// ─── Shared primitives ────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      width: 40, height: 22, borderRadius: 11,
      background: checked ? '#3ecfcf' : '#1e2530',
      border: 'none', cursor: 'pointer', position: 'relative',
      transition: 'background 0.2s', flexShrink: 0, outline: 'none',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: checked ? '#0a0f18' : '#4a5a6a',
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
        background: '#0a0f18', border: '1px solid #1e2530',
        borderRadius: 8, color: '#e6edf3',
        padding: '7px 32px 7px 10px', fontSize: 13,
        cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
      }}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} style={{ position: 'absolute', right: 9, color: '#4a5a6a', pointerEvents: 'none' }} />
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#4a5a6a', marginBottom: 7 }}>{children}</p>
}

function Input({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: '#0a0f18', border: '1px solid #1e2530',
        borderRadius: 8, color: '#e6edf3', padding: '8px 12px',
        fontSize: 13, outline: 'none',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}
    />
  )
}

// ─── Briefing Card ────────────────────────────────────────────────────────────

interface CardProps {
  briefing: BriefingWithRecipients
  lastSent: BriefingHistory | null
  onToggle:    (id: string, v: boolean) => void
  onEdit:      (b: BriefingWithRecipients) => void
  onCopy:      (b: BriefingWithRecipients) => void
  onDelete:    (id: string) => void
  onSendNow:   (id: string) => void
  sending:     boolean
  onAddRecipient:    (briefingId: string, r: Omit<BriefingRecipient, 'id' | 'briefing_id'>) => Promise<void>
  onRemoveRecipient: (briefingId: string, rId: string) => Promise<void>
}

function BriefingCard({
  briefing, lastSent,
  onToggle, onEdit, onCopy, onDelete, onSendNow, sending,
  onAddRecipient, onRemoveRecipient,
}: CardProps) {
  const [addOpen,      setAddOpen]      = useState(false)
  const [addChannel,   setAddChannel]   = useState<'telegram' | 'email'>('telegram')
  const [addTarget,    setAddTarget]    = useState('')
  const [addLabel,     setAddLabel]     = useState('')
  const [addLoading,   setAddLoading]   = useState(false)
  const [removingId,   setRemovingId]   = useState<string | null>(null)

  const freq = FREQ_STYLE[briefing.frequency] ?? FREQ_STYLE.daily

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
    <div style={{
      background: '#0d1117',
      border: `1px solid ${briefing.is_enabled ? 'rgba(62,207,207,0.15)' : '#1e2530'}`,
      borderRadius: 14, overflow: 'hidden',
      opacity: briefing.is_enabled ? 1 : 0.65,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top accent */}
      <div style={{ height: 2, background: briefing.is_enabled ? '#3ecfcf' : '#1e2530' }} />

      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#e6edf3', lineHeight: 1.2 }}>{briefing.name}</p>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: freq.bg, color: freq.color }}>
                {freq.label}
              </span>
            </div>
            {briefing.description && (
              <p style={{ fontSize: 12, color: '#4a5a6a', marginTop: 3 }}>{briefing.description}</p>
            )}
          </div>
          <Toggle checked={briefing.is_enabled} onChange={v => onToggle(briefing.id, v)} />
        </div>

        {/* Schedule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={12} style={{ color: '#3ecfcf', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#8899a6' }}>{scheduleLabel(briefing)}</span>
        </div>

        {/* Topics */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {(briefing.topics?.includes('all') ? [{ value: 'all', label: 'All Topics' }]
            : TOPIC_OPTIONS.filter(o => briefing.topics?.includes(o.value))
          ).map(t => (
            <span key={t.value} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', color: '#6a7a8a',
              border: '1px solid #1e2530',
            }}>{t.label}</span>
          ))}
          {briefing.min_severity && briefing.min_severity !== 'low' && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(227,179,65,0.08)', color: '#e3b341', border: '1px solid rgba(227,179,65,0.15)',
            }}>
              {SEVERITY_OPTIONS.find(s => s.value === briefing.min_severity)?.label}
            </span>
          )}
        </div>

        {/* Recipients */}
        <div style={{ borderTop: '1px solid #0e1420', paddingTop: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3a4555', marginBottom: 8 }}>
            {briefing.briefing_recipients?.length ?? 0} recipient{briefing.briefing_recipients?.length !== 1 ? 's' : ''}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {briefing.briefing_recipients?.filter(r => r.is_active).map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: r.channel === 'telegram' ? 'rgba(41,182,246,0.1)' : 'rgba(255,255,255,0.05)',
                }}>
                  {r.channel === 'telegram'
                    ? <Send size={11} style={{ color: '#29b6f6' }} />
                    : <Mail size={11} style={{ color: '#6a7a8a' }} />}
                </div>
                <span style={{ fontSize: 12, color: '#8899a6', flex: 1, minWidth: 0 }}>
                  {r.label && <span style={{ color: '#c8d8e8', marginRight: 5 }}>{r.label}</span>}
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#4a5a6a' }}>
                    {r.target.length > 22 ? r.target.slice(0, 22) + '…' : r.target}
                  </span>
                </span>
                <button onClick={() => handleRemove(r.id)} disabled={removingId === r.id}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a4555', padding: 3, lineHeight: 1 }}>
                  {removingId === r.id
                    ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    : <X size={11} />}
                </button>
              </div>
            ))}
          </div>

          {/* Inline add recipient */}
          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: '1px dashed #1e2530', borderRadius: 7,
              padding: '5px 10px', cursor: 'pointer', color: '#3a4555', fontSize: 12, width: '100%',
            }}>
              <Plus size={11} /> Add recipient
            </button>
          ) : (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8,
              background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e2530' }}>
              {/* Channel toggle */}
              <div style={{ display: 'flex', gap: 6 }}>
                {(['telegram', 'email'] as const).map(ch => (
                  <button key={ch} type="button" onClick={() => setAddChannel(ch)} style={{
                    flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid',
                    background: addChannel === ch ? 'rgba(62,207,207,0.1)' : 'transparent',
                    color:      addChannel === ch ? '#3ecfcf' : '#4a5a6a',
                    borderColor: addChannel === ch ? 'rgba(62,207,207,0.3)' : '#1e2530',
                  }}>
                    {ch === 'telegram' ? 'Telegram' : 'Email'}
                  </button>
                ))}
              </div>
              <input value={addTarget} onChange={e => setAddTarget(e.target.value)}
                placeholder={addChannel === 'telegram' ? 'Chat ID (-100...)' : 'email@domain.com'}
                style={{ background: '#0a0f18', border: '1px solid #1e2530', borderRadius: 6,
                  color: '#e6edf3', padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: addChannel === 'telegram' ? 'monospace' : 'inherit' }}
              />
              <input value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder='Label (e.g. "Owner")'
                style={{ background: '#0a0f18', border: '1px solid #1e2530', borderRadius: 6,
                  color: '#e6edf3', padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleAdd} disabled={!addTarget.trim() || addLoading} style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: '#3ecfcf', color: '#0a0f18', border: 'none', cursor: 'pointer',
                  opacity: !addTarget.trim() || addLoading ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  {addLoading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                  Add
                </button>
                <button onClick={() => { setAddOpen(false); setAddTarget(''); setAddLabel('') }} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'transparent',
                  border: '1px solid #1e2530', color: '#4a5a6a', cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div style={{ borderTop: '1px solid #0e1420', padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>

        {/* Last sent */}
        <p style={{ fontSize: 11, color: '#3a4555' }}>
          {lastSent
            ? <>Last sent {formatDistanceToNow(new Date(lastSent.sent_at), { addSuffix: true })}
                <span style={{ color: STATUS_STYLE[lastSent.status]?.color ?? '#4a5a6a', marginLeft: 5 }}>
                  · {STATUS_STYLE[lastSent.status]?.label}
                </span>
              </>
            : 'Never sent'}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <IconBtn icon={<Send size={12} />} label="Send Now" primary loading={sending} onClick={() => onSendNow(briefing.id)} />
          <IconBtn icon={<Pencil size={12} />} label="Edit"     onClick={() => onEdit(briefing)} />
          <IconBtn icon={<Copy size={12} />}   label="Copy"     onClick={() => onCopy(briefing)} />
          <IconBtn icon={<Trash2 size={12} />} label="Delete"   danger onClick={() => onDelete(briefing.id)} />
        </div>
      </div>
    </div>
  )
}

function IconBtn({ icon, label, onClick, primary, danger, loading }: {
  icon: React.ReactNode; label: string; onClick: () => void
  primary?: boolean; danger?: boolean; loading?: boolean
}) {
  return (
    <button onClick={onClick} disabled={loading} title={label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
      cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
      border: '1px solid',
      background: primary ? '#3ecfcf' : 'transparent',
      color:  primary ? '#0a0f18' : danger ? '#f85149' : '#6a7a8a',
      borderColor: primary ? 'transparent' : danger ? 'rgba(248,81,73,0.25)' : '#1e2530',
    }}>
      {loading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      {label}
    </button>
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
    name:        briefing.name,
    description: briefing.description ?? '',
    frequency:   briefing.frequency,
    weekly_day:  briefing.weekly_day ?? 1,
    send_time:   briefing.send_time,
    topics:      briefing.topics ?? ['all'],
    min_severity: briefing.min_severity ?? 'low',
  } : { ...DEFAULT_FORM })

  // Recipients only for new briefing
  const [recipients, setRecipients] = useState<ModalRecipient[]>([])
  const [addCh,    setAddCh]    = useState<'telegram' | 'email'>('telegram')
  const [addTgt,   setAddTgt]   = useState('')
  const [addLbl,   setAddLbl]   = useState('')

  function set<K extends keyof ModalForm>(k: K, v: ModalForm[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function toggleTopic(t: string) {
    if (t === 'all') { set('topics', ['all']); return }
    const cur = form.topics.includes('all') ? [] : [...form.topics]
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
        background: '#0d1117', border: '1px solid #1e2530', borderRadius: 16,
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Modal header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#e6edf3' }}>
            {mode === 'new' ? 'New Briefing' : `Edit — ${briefing?.name}`}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5a6a', padding: 4 }}>
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
          <div style={{ borderTop: '1px solid #111820', paddingTop: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3ecfcf', marginBottom: 14 }}>Schedule</p>

            {/* Frequency */}
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Frequency</FieldLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['daily', 'weekly', 'monthly'] as const).map(f => {
                  const s = FREQ_STYLE[f]
                  const active = form.frequency === f
                  return (
                    <button key={f} type="button" onClick={() => set('frequency', f)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: active ? s.bg : 'transparent',
                      color:      active ? s.color : '#4a5a6a',
                      borderColor: active ? s.color.replace(')', ',0.3)').replace('rgb', 'rgba') : '#1e2530',
                    }}>{s.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Day of week (weekly only) */}
            {form.frequency === 'weekly' && (
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Day of week</FieldLabel>
                <div style={{ display: 'flex', gap: 4 }}>
                  {DAYS.map((d, i) => (
                    <button key={d} type="button" onClick={() => set('weekly_day', i)} style={{
                      flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: form.weekly_day === i ? 'rgba(179,146,240,0.12)' : 'transparent',
                      color:      form.weekly_day === i ? '#b392f0' : '#4a5a6a',
                      borderColor: form.weekly_day === i ? 'rgba(179,146,240,0.3)' : '#1e2530',
                    }}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Time */}
            <div>
              <FieldLabel>Send time (Chicago CT)</FieldLabel>
              <TimeSelect value={form.send_time} onChange={v => set('send_time', v)} />
            </div>
          </div>

          {/* Filters */}
          <div style={{ borderTop: '1px solid #111820', paddingTop: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3ecfcf', marginBottom: 14 }}>Filters</p>

            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Topics</FieldLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {TOPIC_OPTIONS.map(t => {
                  const active = form.topics.includes(t.value)
                  return (
                    <button key={t.value} type="button" onClick={() => toggleTopic(t.value)} style={{
                      padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: active ? 'rgba(62,207,207,0.1)' : 'transparent',
                      color:      active ? '#3ecfcf' : '#4a5a6a',
                      borderColor: active ? 'rgba(62,207,207,0.3)' : '#1e2530',
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
                      background: active ? 'rgba(62,207,207,0.08)' : 'transparent',
                      color:      active ? '#3ecfcf' : '#4a5a6a',
                      borderColor: active ? 'rgba(62,207,207,0.25)' : '#1e2530',
                    }}>{s.label}</button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Recipients (new only) */}
          {mode === 'new' && (
            <div style={{ borderTop: '1px solid #111820', paddingTop: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3ecfcf', marginBottom: 14 }}>Recipients</p>

              {recipients.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {recipients.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(255,255,255,0.02)', borderRadius: 7, padding: '7px 10px' }}>
                      <span style={{ fontSize: 11, color: '#4a5a6a', width: 60 }}>{r.channel}</span>
                      {r.label && <span style={{ fontSize: 12, color: '#c8d8e8' }}>{r.label}</span>}
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#4a5a6a', flex: 1 }}>{r.target}</span>
                      <button onClick={() => setRecipients(rs => rs.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a4555' }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
                background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '12px', border: '1px solid #1e2530' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['telegram', 'email'] as const).map(ch => (
                    <button key={ch} type="button" onClick={() => setAddCh(ch)} style={{
                      flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: addCh === ch ? 'rgba(62,207,207,0.1)' : 'transparent',
                      color:      addCh === ch ? '#3ecfcf' : '#4a5a6a',
                      borderColor: addCh === ch ? 'rgba(62,207,207,0.3)' : '#1e2530',
                    }}>{ch === 'telegram' ? 'Telegram' : 'Email'}</button>
                  ))}
                </div>
                <input value={addTgt} onChange={e => setAddTgt(e.target.value)}
                  placeholder={addCh === 'telegram' ? 'Chat ID (-100...)' : 'email@domain.com'}
                  style={{ background: '#0a0f18', border: '1px solid #1e2530', borderRadius: 6,
                    color: '#e6edf3', padding: '7px 10px', fontSize: 12, outline: 'none',
                    fontFamily: addCh === 'telegram' ? 'monospace' : 'inherit' }}
                />
                <input value={addLbl} onChange={e => setAddLbl(e.target.value)} placeholder='Label — "Owner", "Fleet Mgr"…'
                  style={{ background: '#0a0f18', border: '1px solid #1e2332', borderRadius: 6,
                    color: '#e6edf3', padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={addRecipient} disabled={!addTgt.trim()} style={{
                  padding: '7px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'rgba(62,207,207,0.08)', color: '#3ecfcf',
                  border: '1px solid rgba(62,207,207,0.2)', cursor: 'pointer',
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
                background: '#3ecfcf', color: '#0a0f18', border: 'none', cursor: 'pointer',
                opacity: !form.name.trim() || saving ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
              {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              {saving ? 'Saving…' : mode === 'new' ? 'Create Briefing' : 'Save Changes'}
            </button>
            <button onClick={onClose} style={{
              padding: '10px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1px solid #1e2530', color: '#6a7a8a', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History Table ────────────────────────────────────────────────────────────

function HistorySection({
  rows, briefingNames, onRefresh, loading,
}: {
  rows: BriefingHistory[]; briefingNames: string[]
  onRefresh: () => void; loading: boolean
}) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? rows : rows.filter(r => r.briefings?.name === filter)

  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2530', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #111820',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>Briefing History</p>
          <p style={{ fontSize: 11.5, color: '#4a5a6a', marginTop: 2 }}>Last 50 deliveries</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{
              appearance: 'none', WebkitAppearance: 'none',
              background: '#0a0f18', border: '1px solid #1e2530', borderRadius: 8,
              color: '#8899a6', padding: '6px 28px 6px 10px', fontSize: 12, cursor: 'pointer', outline: 'none',
            }}>
              <option value="all">All briefings</option>
              {briefingNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <ChevronDown size={11} style={{ position: 'absolute', right: 8, color: '#4a5a6a', pointerEvents: 'none' }} />
          </div>
          <button onClick={onRefresh} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2530',
            color: '#6a7a8a', cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '52px 20px', textAlign: 'center' }}>
          <Moon size={28} style={{ color: '#1e2530', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#4a5a6a' }}>No briefings sent yet.</p>
          <p style={{ fontSize: 12, color: '#2a3545', marginTop: 4 }}>
            Configure a briefing above and click Send Now to test.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #111820' }}>
                {['Briefing', 'Sent At', 'Status', 'Recipients', 'Preview'].map(h => (
                  <th key={h} style={{ padding: '10px 18px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: '#3a4555', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const st  = STATUS_STYLE[row.status] ?? STATUS_STYLE.error
                const ts  = new Date(row.sent_at)
                return (
                  <tr key={row.id} style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid #0e1420' : 'none',
                    background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent',
                  }}>
                    <td style={{ padding: '11px 18px' }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#c8d8e8' }}>
                        {row.briefings?.name ?? '—'}
                      </p>
                    </td>
                    <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
                      <p style={{ fontSize: 12, color: '#c8d8e8' }}>{format(ts, 'MMM d, yyyy')}</p>
                      <p style={{ fontSize: 11, color: '#4a5a6a', marginTop: 2 }}>
                        {format(ts, 'h:mm a')} · {formatDistanceToNow(ts, { addSuffix: true })}
                      </p>
                    </td>
                    <td style={{ padding: '11px 18px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: st.color, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.status === 'success'
                          ? <CheckCircle2 size={12} /> : row.status === 'partial'
                          ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
                      <p style={{ fontSize: 12, color: '#6a7a8a' }}>
                        {row.recipients_succeeded}/{row.recipients_attempted}
                      </p>
                    </td>
                    <td style={{ padding: '11px 18px', maxWidth: 280 }}>
                      <p style={{ fontSize: 11.5, color: '#4a5a6a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                        {row.error_message ?? row.message_preview ?? '—'}
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
  initialBriefings: BriefingWithRecipients[]
  initialHistory:   BriefingHistory[]
}

export function BriefingClient({ initialBriefings, initialHistory }: Props) {
  const supabase = createClient()

  const [briefings,    setBriefings]    = useState<BriefingWithRecipients[]>(initialBriefings)
  const [history,      setHistory]      = useState<BriefingHistory[]>(initialHistory)
  const [modal,        setModal]        = useState<{ mode: 'new' | 'edit'; briefing?: BriefingWithRecipients } | null>(null)
  const [modalSaving,  setModalSaving]  = useState(false)
  const [sending,      setSending]      = useState<Record<string, boolean>>({})
  const [historyLoad,  setHistoryLoad]  = useState(false)

  // Compute last sent per briefing from history
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

  // ── Refresh helpers ────────────────────────────────────────────────────────

  const reloadHistory = useCallback(async () => {
    setHistoryLoad(true)
    const { data } = await supabase
      .from('briefing_history').select('*, briefings(name)')
      .order('sent_at', { ascending: false }).limit(50)
    if (data) setHistory(data as BriefingHistory[])
    setHistoryLoad(false)
  }, [supabase])

  // ── Toggle enable ──────────────────────────────────────────────────────────

  async function handleToggle(id: string, val: boolean) {
    setBriefings(bs => bs.map(b => b.id === id ? { ...b, is_enabled: val } : b))
    const res  = await fetch(`/api/tori/briefings/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: val }),
    })
    if (!(await res.json()).ok) {
      setBriefings(bs => bs.map(b => b.id === id ? { ...b, is_enabled: !val } : b))
      toast.error('Failed to update briefing')
    }
  }

  // ── Send now ───────────────────────────────────────────────────────────────

  async function handleSendNow(id: string) {
    setSending(s => ({ ...s, [id]: true }))
    try {
      const res  = await fetch(`/api/tori/briefings/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Unknown error')
      toast.success(`Briefing sent to ${data.recipients_succeeded} recipient${data.recipients_succeeded !== 1 ? 's' : ''}!`)
      await reloadHistory()
    } catch (err) {
      toast.error(`Send failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setSending(s => ({ ...s, [id]: false }))
    }
  }

  // ── Modal save (new / edit) ────────────────────────────────────────────────

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
        setBriefings(bs => bs.map(b => b.id === id ? { ...(data.briefing as BriefingWithRecipients), briefing_recipients: b.briefing_recipients } : b))
        toast.success('Changes saved.')
      }
      setModal(null)
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setModalSaving(false)
    }
  }

  // ── Copy briefing ──────────────────────────────────────────────────────────

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

  async function handleAddRecipient(
    briefingId: string,
    r: Omit<BriefingRecipient, 'id' | 'briefing_id'>,
  ) {
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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
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
              Automated intelligence delivered your way
            </p>
          </div>
        </div>

        <button onClick={() => setModal({ mode: 'new' })} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
          background: '#3ecfcf', color: '#0a0f18', border: 'none', cursor: 'pointer',
        }}>
          <Plus size={14} /> New Briefing
        </button>
      </div>

      {/* Cards grid */}
      {briefings.length === 0 ? (
        <div style={{
          background: '#0d1117', border: '1px dashed #1e2530', borderRadius: 14,
          padding: '64px 20px', textAlign: 'center', marginBottom: 32,
        }}>
          <Sun size={32} style={{ color: '#1e2530', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 14, color: '#4a5a6a', marginBottom: 6 }}>No briefings configured yet.</p>
          <p style={{ fontSize: 12, color: '#2a3545' }}>Create your first one with the button above.</p>
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
        </div>
      )}

      {/* History */}
      <HistorySection
        rows={history}
        briefingNames={briefingNames}
        onRefresh={reloadHistory}
        loading={historyLoad}
      />

      {/* Modal */}
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
