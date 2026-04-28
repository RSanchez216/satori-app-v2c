/**
 * Pure date-math helpers used by both client (DateFilter pills) and server
 * (default-range computation in report pages). Lives outside the 'use client'
 * DateFilter module so server components can import the helper without
 * pulling React/lucide-react into the server bundle.
 *
 * All windows are aligned to America/Chicago midnight, regardless of the
 * caller's local TZ.
 */

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
