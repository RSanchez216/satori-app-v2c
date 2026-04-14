'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'

export type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom'

export interface DateRange {
  preset: DatePreset
  label:  string
  from:   string   // ISO UTC (inclusive)
  to:     string   // ISO UTC (exclusive)
}

const TZ = 'America/Chicago'

function ctDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

/** Returns UTC ISO for midnight of a Chicago local date string (YYYY-MM-DD). */
function ctMidnightUTC(localDate: string): string {
  for (const off of [4, 5, 6, 7]) {
    const c = new Date(`${localDate}T${String(off).padStart(2, '0')}:00:00Z`)
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
        .formatToParts(c)
        .find(p => p.type === 'hour')?.value ?? '99',
      10,
    )
    if (h === 0) return c.toISOString()
  }
  return `${localDate}T06:00:00.000Z`
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
    .format(new Date(Date.UTC(y, m - 1, d + days, 12)))
}

export function buildDateRange(preset: DatePreset, custom?: string): DateRange {
  const today = ctDateStr()
  switch (preset) {
    case 'today':
      return { preset, label: 'Today', from: ctMidnightUTC(today), to: ctMidnightUTC(shiftDate(today, 1)) }
    case 'yesterday': {
      const yest = shiftDate(today, -1)
      return { preset, label: 'Yesterday', from: ctMidnightUTC(yest), to: ctMidnightUTC(today) }
    }
    case '7d':
      return { preset, label: 'Last 7 Days', from: ctMidnightUTC(shiftDate(today, -6)), to: ctMidnightUTC(shiftDate(today, 1)) }
    case '30d':
      return { preset, label: 'Last 30 Days', from: ctMidnightUTC(shiftDate(today, -29)), to: ctMidnightUTC(shiftDate(today, 1)) }
    case 'custom': {
      const d = custom ?? today
      return { preset, label: d, from: ctMidnightUTC(d), to: ctMidnightUTC(shiftDate(d, 1)) }
    }
  }
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today',     label: 'Today'     },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d',        label: '7 Days'    },
  { id: '30d',       label: '30 Days'   },
]

interface Props {
  value:    DateRange
  onChange: (range: DateRange) => void
}

export function DateFilter({ value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const today = ctDateStr()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {PRESETS.map(p => {
        const active = value.preset === p.id
        return (
          <button
            key={p.id}
            onClick={() => onChange(buildDateRange(p.id))}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: '1px solid',
              background:  active ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
              color:       active ? 'var(--accent)' : 'var(--text-muted)',
              borderColor: active ? 'rgba(var(--accent-rgb),0.25)' : 'var(--border-subtle)',
              transition: 'all 0.15s',
            }}
          >
            {p.label}
          </button>
        )
      })}

      {/* Custom date picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setPickerOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: '1px solid',
            background:  value.preset === 'custom' ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
            color:       value.preset === 'custom' ? 'var(--accent)' : 'var(--text-muted)',
            borderColor: value.preset === 'custom' ? 'rgba(var(--accent-rgb),0.25)' : 'var(--border-subtle)',
          }}
        >
          <Calendar size={11} />
          {value.preset === 'custom' ? value.label : 'Pick date'}
        </button>

        {pickerOpen && (
          <input
            type="date"
            max={today}
            defaultValue={value.preset === 'custom' ? value.label : today}
            autoFocus
            onChange={e => {
              if (e.target.value) {
                onChange(buildDateRange('custom', e.target.value))
                setPickerOpen(false)
              }
            }}
            onBlur={() => setPickerOpen(false)}
            style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, color: 'var(--text-primary)', padding: '6px 10px',
              fontSize: 12, outline: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              colorScheme: 'dark',
            }}
          />
        )}
      </div>
    </div>
  )
}
