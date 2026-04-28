import { createClient } from '@/lib/supabase/server'
import { buildDateRange } from '@/lib/date-range'
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
  // Resolve range. Default = Today (CT midnight → next CT midnight).
  // For today/yesterday/custom, the client pushes from/to in the URL
  // (computed via buildDateRange which uses CT-midnight math); the server
  // trusts those bounds. 7d/30d have server-side defaults so shared URLs
  // stay clean. The no-params landing case also uses buildDateRange so the
  // Today window aligns to CT midnight, matching the Dashboard.
  let preset: RangePreset = isPreset(searchParams.preset) ? searchParams.preset : 'today'
  let fromISO: string
  let toISO:   string

  if (searchParams.from && searchParams.to) {
    const f = new Date(searchParams.from)
    const t = new Date(searchParams.to)
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
      fromISO = f.toISOString()
      toISO   = t.toISOString()
    } else {
      const r = buildDateRange('today')
      preset  = 'today'
      fromISO = r.from
      toISO   = r.to
    }
  } else if (preset === '7d' || preset === '30d') {
    const r = buildDateRange(preset)
    fromISO = r.from
    toISO   = r.to
  } else {
    const r = buildDateRange('today')
    preset  = 'today'
    fromISO = r.from
    toISO   = r.to
  }

  const supabase = createClient()

  const [overviewRes, driversRes, unitsRes, criticalRes, driverCountRes, unitCountRes] = await Promise.all([
    supabase.rpc('get_samsara_overview',           { p_start: fromISO, p_end: toISO }).single(),
    supabase.rpc('get_samsara_driver_offenders',   { p_start: fromISO, p_end: toISO, p_limit: 25, p_offset: 0 }),
    supabase.rpc('get_samsara_unit_offenders',     { p_start: fromISO, p_end: toISO, p_limit: 25, p_offset: 0 }),
    supabase.rpc('get_samsara_critical_events',    { p_start: fromISO, p_end: toISO, p_limit: 50 }),
    supabase.rpc('count_samsara_driver_offenders', { p_start: fromISO, p_end: toISO }),
    supabase.rpc('count_samsara_unit_offenders',   { p_start: fromISO, p_end: toISO }),
  ])

  if (overviewRes.error)    console.error('[samsara-offenders] overview:',     overviewRes.error)
  if (driversRes.error)     console.error('[samsara-offenders] drivers:',      driversRes.error)
  if (unitsRes.error)       console.error('[samsara-offenders] units:',        unitsRes.error)
  if (criticalRes.error)    console.error('[samsara-offenders] critical:',     criticalRes.error)
  if (driverCountRes.error) console.error('[samsara-offenders] driver count:', driverCountRes.error)
  if (unitCountRes.error)   console.error('[samsara-offenders] unit count:',   unitCountRes.error)

  const overview: OverviewData | null = overviewRes.data ? {
    totalAlerts:         Number((overviewRes.data as Record<string, unknown>).total_alerts ?? 0),
    uniqueDrivers:       Number((overviewRes.data as Record<string, unknown>).unique_drivers ?? 0),
    uniqueUnits:         Number((overviewRes.data as Record<string, unknown>).unique_units ?? 0),
    criticalCount:       Number((overviewRes.data as Record<string, unknown>).critical_count ?? 0),
    highCount:           Number((overviewRes.data as Record<string, unknown>).high_count ?? 0),
    operationalCount:    Number((overviewRes.data as Record<string, unknown>).operational_count ?? 0),
    totalAlertsPrevious: Number((overviewRes.data as Record<string, unknown>).total_alerts_previous ?? 0),
    unmappedDrivers:     Number((overviewRes.data as Record<string, unknown>).unmapped_drivers ?? 0),
  } : null

  const drivers: DriverRow[] = (driversRes.data ?? []).map((r: Record<string, unknown>) => ({
    driverId:      r.driver_id as string,
    driverName:    (r.driver_name as string | null) ?? null,
    isResolved:    Boolean(r.is_resolved),
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
    unitsDriven:   (r.units_driven as string[] | null) ?? [],
  }))

  const units: UnitRow[] = (unitsRes.data ?? []).map((r: Record<string, unknown>) => ({
    unitId:             r.unit_id as string,
    faultCount:         Number(r.fault_count ?? 0),
    faultCodesDistinct: Number(r.fault_codes_distinct ?? 0),
    idleCount:          Number(r.idle_count ?? 0),
    totalAlerts:        Number(r.total_alerts ?? 0),
    lastAlertAt:        r.last_alert_at as string,
    drivers:            (r.drivers as string[] | null) ?? [],
  }))

  const critical: CriticalRow[] = (criticalRes.data ?? []).map((r: Record<string, unknown>) => ({
    alertType:   r.alert_type as CriticalRow['alertType'],
    driverId:    (r.driver_id as string | null) ?? null,
    driverName:  (r.driver_name as string | null) ?? null,
    unitId:      (r.unit_id as string | null) ?? null,
    messageFull: r.message_full as string,
    occurredAt:  r.occurred_at as string,
  }))

  const driversTotal = Number((driverCountRes.data as unknown as number | null) ?? drivers.length)
  const unitsTotal   = Number((unitCountRes.data   as unknown as number | null) ?? units.length)

  return (
    <SamsaraOffendersClient
      from={fromISO}
      to={toISO}
      preset={preset}
      overview={overview}
      drivers={drivers}
      driversTotal={driversTotal}
      units={units}
      unitsTotal={unitsTotal}
      critical={critical}
    />
  )
}
