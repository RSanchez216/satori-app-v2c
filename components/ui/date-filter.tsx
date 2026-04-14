'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

export type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom'

export interface DateRange {
  preset: DatePreset
  label:  string
  from:   string   // ISO UTC (inclusive)
  to:     string   // ISO UTC (exclusive)
}

const TZ = 'America/Chicago'
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function ctDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

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

function formatDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d))
}

export function buildDateRange(preset: DatePreset, customFrom?: string, customTo?: string): DateRange {
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
      const from = customFrom ?? today
      const to   = customTo   ?? from
      const label = from === to
        ? formatDisplay(from)
        : `${formatDisplay(from)} – ${formatDisplay(to)}`
      return { preset, label, from: ctMidnightUTC(from), to: ctMidnightUTC(shiftDate(to, 1)) }
    }
  }
}

/* ── Calendar helpers ───────────────────────────────────────── */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/* ── Main component ─────────────────────────────────────────── */

interface Props {
  value:    DateRange
  onChange: (range: DateRange) => void
}

export function DateFilter({ value, onChange }: Props) {
  const [open,      setOpen]      = useState(false)
  const [selecting, setSelecting] = useState<string | null>(null) // first click date
  const [hover,     setHover]     = useState<string | null>(null)
  const today = ctDateStr()
  const [calYear,  setCalYear]  = useState(() => { const d = new Date(); return d.getFullYear() })
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return d.getMonth() })

  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSelecting(null)
        setHover(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Reset selecting state when calendar closes
  useEffect(() => {
    if (!open) { setSelecting(null); setHover(null) }
  }, [open])

  const handlePreset = useCallback((preset: DatePreset) => {
    setOpen(false)
    onChange(buildDateRange(preset))
  }, [onChange])

  const handleDayClick = useCallback((dateStr: string) => {
    if (!selecting) {
      // First click — pick start
      setSelecting(dateStr)
    } else {
      // Second click — pick end, close
      const [from, to] = compareDates(selecting, dateStr) <= 0
        ? [selecting, dateStr]
        : [dateStr, selecting]
      setOpen(false)
      setSelecting(null)
      setHover(null)
      onChange(buildDateRange('custom', from, to))
    }
  }, [selecting, onChange])

  /* Build calendar grid */
  const firstDay  = getFirstDayOfMonth(calYear, calMonth)
  const daysInMon = getDaysInMonth(calYear, calMonth)
  const cells: (string | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMon }, (_, i) => toYMD(calYear, calMonth, i + 1)),
  ]
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  /* Resolve selected range for highlight */
  let selFrom: string | null = null
  let selTo:   string | null = null
  if (selecting) {
    const hov = hover ?? selecting
    const sorted = compareDates(selecting, hov) <= 0 ? [selecting, hov] : [hov, selecting]
    selFrom = sorted[0]; selTo = sorted[1]
  } else if (value.preset === 'custom') {
    // Recover local dates from UTC ISO
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(value.from))
    const t = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(new Date(value.to).getTime() - 1))
    selFrom = f; selTo = t
  }

  const isRangeStart = (d: string) => d === selFrom
  const isRangeEnd   = (d: string) => d === selTo
  const isInRange    = (d: string) => selFrom && selTo && d > selFrom && d < selTo
  const isToday      = (d: string) => d === today
  const isFuture     = (d: string) => d > today

  /* Label for the custom-range button */
  const customLabel = value.preset === 'custom' ? value.label : 'Custom Range'
  const customActive = value.preset === 'custom'

  const btnBase: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid', transition: 'all 0.15s',
  }
  const btnActive: React.CSSProperties = {
    background: 'rgba(var(--accent-rgb),0.1)',
    color: 'var(--accent)',
    borderColor: 'rgba(var(--accent-rgb),0.25)',
  }
  const btnInactive: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-subtle)',
  }

  const PRESETS: { id: DatePreset; label: string }[] = [
    { id: 'today',     label: 'Today'     },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7d',        label: '7 Days'    },
    { id: '30d',       label: '30 Days'   },
  ]

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {PRESETS.map(p => (
        <button
          key={p.id}
          onClick={() => handlePreset(p.id)}
          style={{ ...btnBase, ...(value.preset === p.id ? btnActive : btnInactive) }}
        >
          {p.label}
        </button>
      ))}

      {/* Custom range button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...btnBase,
          ...(customActive ? btnActive : btnInactive),
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <Calendar size={11} />
        {customLabel}
        {customActive && (
          <span
            onClick={e => { e.stopPropagation(); onChange(buildDateRange('today')) }}
            style={{ display: 'flex', alignItems: 'center', marginLeft: 2, opacity: 0.7 }}
          >
            <X size={10} />
          </span>
        )}
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            padding: '16px',
            minWidth: 280,
            userSelect: 'none',
          }}
        >
          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              onClick={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
                else setCalMonth(m => m - 1)
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: 6 }}
            >
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {MONTH_NAMES[calMonth]} {calYear}
            </span>
            <button
              onClick={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
                else setCalMonth(m => m + 1)
              }}
              disabled={toYMD(calYear, calMonth, 1) >= toYMD(new Date().getFullYear(), new Date().getMonth(), 1)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: toYMD(calYear, calMonth, 1) >= toYMD(new Date().getFullYear(), new Date().getMonth(), 1)
                  ? 'var(--text-muted)' : 'var(--text-secondary)',
                padding: '2px 6px', borderRadius: 6,
              }}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Day names */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 0' }}>
            {cells.map((dateStr, i) => {
              if (!dateStr) return <div key={i} />
              const start  = isRangeStart(dateStr)
              const end    = isRangeEnd(dateStr)
              const inRange = isInRange(dateStr)
              const todayDay = isToday(dateStr)
              const future = isFuture(dateStr)
              const selected = start || end

              return (
                <div
                  key={dateStr}
                  onMouseEnter={() => selecting && setHover(dateStr)}
                  onClick={() => !future && handleDayClick(dateStr)}
                  style={{
                    textAlign: 'center',
                    padding: '5px 0',
                    fontSize: 12,
                    fontWeight: selected ? 700 : todayDay ? 600 : 400,
                    cursor: future ? 'default' : 'pointer',
                    opacity: future ? 0.3 : 1,
                    borderRadius: start && end ? 6 : start ? '6px 0 0 6px' : end ? '0 6px 6px 0' : 0,
                    background: selected
                      ? 'var(--accent)'
                      : inRange
                        ? 'rgba(var(--accent-rgb),0.12)'
                        : 'transparent',
                    color: selected
                      ? '#fff'
                      : todayDay
                        ? 'var(--accent)'
                        : 'var(--text-primary)',
                    position: 'relative',
                  }}
                >
                  {parseInt(dateStr.split('-')[2], 10)}
                  {todayDay && !selected && (
                    <span style={{
                      position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                      width: 3, height: 3, borderRadius: '50%', background: 'var(--accent)',
                    }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Status hint */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            {selecting
              ? `Select end date${hover && hover !== selecting ? ` · ${formatDisplay(compareDates(selecting, hover) <= 0 ? selecting : hover)} – ${formatDisplay(compareDates(selecting, hover) <= 0 ? hover : selecting)}` : ''}`
              : 'Click a date to start, click again to set range'}
          </div>
        </div>
      )}
    </div>
  )
}
