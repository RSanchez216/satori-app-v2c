'use client'

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface AssignmentDraft {
  unit_id:     string
  driver_id:   string
  driver_name: string
  start_date:  string   // YYYY-MM-DD
  end_date:    string   // YYYY-MM-DD or '' for active
  notes:       string
}

interface Props {
  open:       boolean
  onClose:    () => void
  onSaved:    () => void
  /** Optional prefill — used when opening from the unmapped panel */
  prefill?:   Partial<AssignmentDraft>
  /** Custom title; defaults to "New Assignment" */
  title?:     string
}

function todayLocalISO(): string {
  // YYYY-MM-DD in local TZ — date input expects this format
  const d = new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

const NOTES_LIMIT = 200

export function AssignmentModal({ open, onClose, onSaved, prefill, title = 'New Assignment' }: Props) {
  const supabase = createClient()
  const [draft, setDraft] = useState<AssignmentDraft>(() => ({
    unit_id:     prefill?.unit_id     ?? '',
    driver_id:   prefill?.driver_id   ?? '',
    driver_name: prefill?.driver_name ?? '',
    start_date:  prefill?.start_date  ?? todayLocalISO(),
    end_date:    prefill?.end_date    ?? '',
    notes:       prefill?.notes       ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Re-seed when reopening with a different prefill
  useEffect(() => {
    if (open) {
      setDraft({
        unit_id:     prefill?.unit_id     ?? '',
        driver_id:   prefill?.driver_id   ?? '',
        driver_name: prefill?.driver_name ?? '',
        start_date:  prefill?.start_date  ?? todayLocalISO(),
        end_date:    prefill?.end_date    ?? '',
        notes:       prefill?.notes       ?? '',
      })
      setError(null)
    }
  }, [open, prefill])

  if (!open) return null

  function set<K extends keyof AssignmentDraft>(key: K, value: AssignmentDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function save() {
    if (!draft.unit_id.trim() || !draft.driver_id.trim() || !draft.driver_name.trim() || !draft.start_date) {
      setError('Unit, Driver ID, Driver Name, and Start Date are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Convert YYYY-MM-DD to a noon-UTC ISO so the date isn't off-by-one
      // in non-UTC viewer timezones (matches the import-time logic).
      const startISO = ymdAtNoonUTC(draft.start_date)
      const endISO   = draft.end_date ? ymdAtNoonUTC(draft.end_date) : null

      const { error: insertErr } = await supabase
        .from('driver_unit_assignments')
        .insert({
          unit_id:     draft.unit_id.trim(),
          driver_id:   draft.driver_id.trim(),
          driver_name: draft.driver_name.trim(),
          start_date:  startISO,
          end_date:    endISO,
          notes:       draft.notes.trim() || null,
          source:      'manual',
        })

      if (insertErr) throw insertErr
      toast.success('Assignment created')
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, width: 440, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Unit ID" required>
            <input
              type="text"
              value={draft.unit_id}
              onChange={(e) => set('unit_id', e.target.value)}
              placeholder="M80"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Driver ID" required>
              <input
                type="text"
                value={draft.driver_id}
                onChange={(e) => set('driver_id', e.target.value)}
                placeholder="1830"
                style={inputStyle}
              />
            </Field>
            <Field label="Driver Name" required>
              <input
                type="text"
                value={draft.driver_name}
                onChange={(e) => set('driver_name', e.target.value)}
                placeholder="John Smith"
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start Date" required>
              <input
                type="date"
                value={draft.start_date}
                onChange={(e) => set('start_date', e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="End Date" hint="Empty = active">
              <input
                type="date"
                value={draft.end_date}
                onChange={(e) => set('end_date', e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Notes" hint={`Optional · ${draft.notes.length}/${NOTES_LIMIT}`}>
            <textarea
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value.slice(0, NOTES_LIMIT))}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>

          {error && (
            <p style={{ fontSize: 11, color: 'var(--severity-critical)', marginTop: -2 }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2" style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: saving ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5"
            style={{ padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: 'var(--accent)', border: 'none', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
          {label}
          {required && <span style={{ color: 'var(--severity-critical)', marginLeft: 3 }}>*</span>}
        </span>
        {hint && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hint}</span>}
      </div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 7,
  fontSize: 12,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  outline: 'none',
}

function ymdAtNoonUTC(ymd: string): string {
  // Match the import-time helper: parse YYYY-MM-DD and anchor to noon UTC
  // so the calendar day is consistent across viewer timezones.
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return new Date(ymd).toISOString()
  const [, y, mo, d] = m
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0)).toISOString()
}
