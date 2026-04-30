'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import { X, Loader2, Plus, ArrowRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AssignmentModal } from '@/components/sources/AssignmentModal'
import { pluralize } from '@/lib/utils'

type UnmappedRow = {
  unitId:     string
  alertType:  string
  occurredAt: string
  hint:       string
  count:      number
}

const ALERT_LABEL: Record<string, string> = {
  crash:           'Crash / Impact',
  distraction:     'Distraction',
  vehicle_fault:   'Vehicle Fault',
  speeding:        'Speeding',
  harsh_brake:     'Harsh Braking',
  def_system:      'DEF System',
  idle:            'Engine Idle',
  fuel_low:        'Fuel Low',
}

interface Props {
  open:        boolean
  onClose:     () => void
  fromISO:     string
  toISO:       string
  /** Bump after a successful assignment so the report behind the panel re-fetches */
  onChanged?:  () => void
}

export function UnmappedEventsPanel({ open, onClose, fromISO, toISO, onChanged }: Props) {
  const router = useRouter()
  const [rows,    setRows]    = useState<UnmappedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [modalPrefill, setModalPrefill] = useState<{ unit_id: string; start_date?: string } | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const supabase = createClient()
    setLoading(true)
    supabase
      .rpc('get_samsara_unmapped_events', { p_start: fromISO, p_end: toISO, p_limit: 200 })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[unmapped-panel] fetch failed:', error)
          setRows([])
        } else {
          setRows((data ?? []).map((r: Record<string, unknown>) => ({
            unitId:     r.unit_id      as string,
            alertType:  r.alert_type   as string,
            occurredAt: r.occurred_at  as string,
            hint:       r.message_hint as string,
            count:      Number(r.alert_count ?? 0),
          })))
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, fromISO, toISO, reloadKey])

  if (!open) return null

  const totalUnits = new Set(rows.map((r) => r.unitId)).size
  const totalEvents = rows.reduce((sum, r) => sum + r.count, 0)

  function openAssignFor(row: UnmappedRow) {
    // Backdate to the day of the event so the new assignment covers it
    const d = new Date(row.occurredAt)
    const yy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    setModalPrefill({ unit_id: row.unitId, start_date: `${yy}-${mm}-${dd}` })
  }

  function openAssignBlank() {
    setModalPrefill({ unit_id: '' })
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 150 }}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 560, maxWidth: '94vw',
          background: 'var(--bg-card)', borderLeft: '1px solid var(--border-default)',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.45)',
          zIndex: 151,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Unmapped Events
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {format(new Date(fromISO), 'MMM d, h:mm a')} – {format(new Date(toISO), 'MMM d, h:mm a')}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Intro + global Add button */}
        <div className="flex items-start gap-3" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex-1">
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              These alerts arrived for units that don&apos;t have a driver assignment covering the alert&apos;s timestamp.
              To attribute them, either backdate an existing assignment or create a new one.
            </p>
          </div>
          <button
            onClick={openAssignBlank}
            className="flex-shrink-0 flex items-center gap-1.5"
            style={{
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer',
            }}
          >
            <Plus size={12} /> Add Assignment
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 6px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading unmapped events…</p>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <CheckCircle2 size={20} style={{ color: 'var(--severity-low)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Everything in this window is attributed to a driver.
              </p>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 20px', fontSize: 11, color: 'var(--text-muted)' }}>
                {pluralize(totalEvents, 'unmapped event')} across {pluralize(totalUnits, 'unit')}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                    <th style={thStyle}>Unit</th>
                    <th style={thStyle}>Alert Type</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                    <th style={thStyle}>Last Seen</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.unitId}|${r.alertType}|${i}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{r.unitId}</span>
                      </td>
                      <td style={tdStyle}>{ALERT_LABEL[r.alertType] ?? r.alertType}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{r.count}</td>
                      <td style={tdStyle}>
                        <span style={{ color: 'var(--text-muted)' }}>{formatDistanceToNow(new Date(r.occurredAt), { addSuffix: true })}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          onClick={() => openAssignFor(r)}
                          className="inline-flex items-center gap-1"
                          style={{
                            padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                            background: 'var(--accent-dim)', border: '1px solid rgba(62,207,207,0.25)', color: 'var(--accent)', cursor: 'pointer',
                          }}
                        >
                          Assign <ArrowRight size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </aside>

      <AssignmentModal
        open={modalPrefill !== null}
        onClose={() => setModalPrefill(null)}
        onSaved={() => {
          setModalPrefill(null)
          setReloadKey((k) => k + 1)
          onChanged?.()
          // Pop back to top of report when count drops
          router.refresh()
        }}
        prefill={modalPrefill ?? undefined}
        title={modalPrefill?.unit_id ? `Assign Unit ${modalPrefill.unit_id}` : 'New Assignment'}
      />
    </>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--text-muted)',
}
const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 12,
  color: 'var(--text-secondary)',
}
