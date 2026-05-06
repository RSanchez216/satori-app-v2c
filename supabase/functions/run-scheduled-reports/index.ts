// @ts-nocheck
// Supabase Edge Function: run-scheduled-reports
// Orchestrates all time-based Tori tasks.
// Triggered by a Supabase cron job every minute: * * * * *
//
// Reads from the `briefings` table and fires the appropriate engine for
// each briefing whose send_time matches the current local time:
//
//   briefing_type = 'legacy' (or NULL)  → tori-evening-briefing
//   briefing_type = 'watchlist'         → generate-briefing  (Phase 3)
//   briefing_type = 'alert_digest'      → generate-briefing  (Phase 6)
//   briefing_type = 'drill_in'          → generate-briefing  (Phase 8)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function getLocalHHMM(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const hour   = parts.find(p => p.type === 'hour')?.value   ?? '00'
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${hour === '24' ? '00' : hour}:${minute}`
}

function getLocalDayOfWeek(tz: string): number {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date())
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day)
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const triggered: unknown[] = []
  const skipped:   unknown[] = []

  try {
    const { data: briefings, error } = await supabase
      .from('briefings')
      .select('id, name, frequency, weekly_day, send_time, timezone, is_enabled, briefing_type')
      .eq('is_enabled', true)

    if (error) throw new Error(`Could not load briefings: ${error.message}`)

    for (const b of briefings ?? []) {
      const tz        = b.timezone ?? 'America/Chicago'
      const localTime = getLocalHHMM(tz)
      const localDay  = getLocalDayOfWeek(tz)

      let shouldFire = false
      if (b.frequency === 'daily') {
        shouldFire = localTime === b.send_time
      } else if (b.frequency === 'weekly') {
        shouldFire = localTime === b.send_time && localDay === b.weekly_day
      } else if (b.frequency === 'monthly') {
        // Fire on the 1st of each month at the specified time
        const day = parseInt(
          new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(new Date()), 10,
        )
        shouldFire = localTime === b.send_time && day === 1
      }

      if (!shouldFire) {
        skipped.push({ id: b.id, name: b.name, reason: `${localTime} ≠ ${b.send_time}` })
        continue
      }

      // Branch by briefing_type. Legacy rows (and NULL for any unmigrated
      // row) keep going to the existing engine — zero behavior change.
      // New v2 templates route to generate-briefing, which Phase 3 will
      // implement; until then it returns 501 and we record a clean
      // "deferred" history row so the UX is honest.
      const type = b.briefing_type ?? 'legacy'

      // Two engines coexist: legacy briefings keep the old narrative
      // engine; v2 templates route to the structured engine. The
      // engine writes to briefing_history itself; we just fire-and-record.
      // dispatch=false because Phase 4 hasn't shipped deliver-briefing yet
      // — generate-briefing logs and skips push when dispatch is true,
      // but explicit is safer.
      const fnName = type === 'legacy' ? 'tori-evening-briefing' : 'generate-briefing'
      const fnBody = type === 'legacy'
        ? { briefing_id: b.id }
        : { briefing_id: b.id, dispatch: false }
      const fnUrl  = `${SUPABASE_URL}/functions/v1/${fnName}`
      const res    = await fetch(fnUrl, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(fnBody),
      })
      const result = await res.json().catch(() => ({ ok: false, error: 'non-JSON' }))
      triggered.push({ id: b.id, name: b.name, type, fn: fnName, result })
    }

    return new Response(
      JSON.stringify({ ok: true, triggered_count: triggered.length, triggered, skipped }),
      { headers: { 'content-type': 'application/json' } },
    )
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[run-scheduled-reports]', error)
    return new Response(JSON.stringify({ ok: false, error }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
