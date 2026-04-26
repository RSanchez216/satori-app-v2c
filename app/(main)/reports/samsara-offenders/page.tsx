import { createClient } from '@/lib/supabase/server'
import { SamsaraOffendersClient } from './samsara-offenders-client'
import type { OverviewData, DriverRow, UnitRow, CriticalRow, RangePreset } from './samsara-offenders-client'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { from?: string; to?: string; preset?: string }
}

function isPreset(v: string | undefined): v is RangePreset {
  return v === 'today' || v === 'yesterday' || v === '7d' || v === '30d' || v === 'custom'
}

export default async function SamsaraOffendersPage({ searchParams }: Props) {
  const now    = new Date()
  const sevenD = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)

  // Resolve range. Default = last 7 days.
  // For today/yesterday/custom, the client always pushes from/to in the URL
  // (computed via buildDateRange which uses CT-midnight math); the server
  // trusts those bounds. 7d/30d have server-side defaults so URLs stay clean.
  let preset: RangePreset = isPreset(searchParams.preset) ? searchParams.preset : '7d'
  let fromISO: string
  let toISO:   string

  if (searchParams.from && searchParams.to) {
    const f = new Date(searchParams.from)
    const t = new Date(searchParams.to)
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
      fromISO = f.toISOString()
      toISO   = t.toISOString()
    } else {
      preset  = '7d'
      fromISO = sevenD.toISOString()
      toISO   = now.toISOString()
    }
  } else if (preset === '30d') {
    fromISO = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    toISO   = now.toISOString()
  } else {
    preset  = '7d'
    fromISO = sevenD.toISOString()
    toISO   = now.toISOString()
  }

  const supabase = createClient()

  const [overviewRes, driversRes, unitsRes, criticalRes] = await Promise.all([
    supabase.rpc('get_samsara_overview',         { p_start: fromISO, p_end: toISO }).single(),
    supabase.rpc('get_samsara_driver_offenders', { p_start: fromISO, p_end: toISO, p_limit: 10 }),
    supabase.rpc('get_samsara_unit_offenders',   { p_start: fromISO, p_end: toISO, p_limit: 10 }),
    supabase.rpc('get_samsara_critical_events',  { p_start: fromISO, p_end: toISO, p_limit: 50 }),
  ])

  if (overviewRes.error)  console.error('[samsara-offenders] overview:',  overviewRes.error)
  if (driversRes.error)   console.error('[samsara-offenders] drivers:',   driversRes.error)
  if (unitsRes.error)     console.error('[samsara-offenders] units:',     unitsRes.error)
  if (criticalRes.error)  console.error('[samsara-offenders] critical:',  criticalRes.error)

  const overview: OverviewData | null = overviewRes.data ? {
    totalAlerts:         Number((overviewRes.data as Record<string, unknown>).total_alerts ?? 0),
    uniqueDrivers:       Number((overviewRes.data as Record<string, unknown>).unique_drivers ?? 0),
    uniqueUnits:         Number((overviewRes.data as Record<string, unknown>).unique_units ?? 0),
    criticalCount:       Number((overviewRes.data as Record<string, unknown>).critical_count ?? 0),
    highCount:           Number((overviewRes.data as Record<string, unknown>).high_count ?? 0),
    operationalCount:    Number((overviewRes.data as Record<string, unknown>).operational_count ?? 0),
    totalAlertsPrevious: Number((overviewRes.data as Record<string, unknown>).total_alerts_previous ?? 0),
  } : null

  const drivers: DriverRow[] = (driversRes.data ?? []).map((r: Record<string, unknown>) => ({
    driverId:      r.driver_id as string,
    totalAlerts:   Number(r.total_alerts ?? 0),
    speeding:      Number(r.speeding_count ?? 0),
    harshBrake:    Number(r.harsh_brake_count ?? 0),
    idle:          Number(r.idle_count ?? 0),
    fuelLow:       Number(r.fuel_low_count ?? 0),
    distraction:   Number(r.distraction_count ?? 0),
    def:           Number(r.def_count ?? 0),
    alertTypesHit: Number(r.alert_types_hit ?? 0),
    lastAlertAt:   r.last_alert_at as string,
    riskScore:     Number(r.risk_score ?? 0),
  }))

  const units: UnitRow[] = (unitsRes.data ?? []).map((r: Record<string, unknown>) => ({
    unitId:             r.unit_id as string,
    faultCount:         Number(r.fault_count ?? 0),
    faultCodesDistinct: Number(r.fault_codes_distinct ?? 0),
    idleCount:          Number(r.idle_count ?? 0),
    totalAlerts:        Number(r.total_alerts ?? 0),
    lastAlertAt:        r.last_alert_at as string,
  }))

  const critical: CriticalRow[] = (criticalRes.data ?? []).map((r: Record<string, unknown>) => ({
    alertType:   r.alert_type as CriticalRow['alertType'],
    driverId:    (r.driver_id as string | null) ?? null,
    unitId:      (r.unit_id as string | null) ?? null,
    messageFull: r.message_full as string,
    occurredAt:  r.occurred_at as string,
  }))

  return (
    <SamsaraOffendersClient
      from={fromISO}
      to={toISO}
      preset={preset}
      overview={overview}
      drivers={drivers}
      units={units}
      critical={critical}
    />
  )
}
