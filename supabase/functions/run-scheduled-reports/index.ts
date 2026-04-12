// Supabase Edge Function: run-scheduled-reports
// Orchestrates all time-based Tori tasks.
// Should be triggered by a Supabase cron job every minute:
//   Schedule: * * * * *  (every minute)
//   Or set a less frequent schedule and match within a window.
//
// Checks tori_settings.briefing_time against current Chicago time
// and fires tori-evening-briefing when they match.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ─── Chicago time helper ──────────────────────────────────────────────────────

/** Returns current Chicago time as "HH:MM" in 24-hour format, e.g. "18:00". */
function getChicagoHHMM(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const hour   = parts.find(p => p.type === 'hour')?.value   ?? '00'
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00'

  // Normalize edge case: some runtimes emit '24' for midnight instead of '00'
  const h = hour === '24' ? '00' : hour
  return `${h}:${minute}`
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const supabase     = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const chicagoHHMM  = getChicagoHHMM()
  const checks: unknown[] = []

  try {
    // Load settings
    const { data: settings, error: settingsErr } = await supabase
      .from('tori_settings')
      .select('briefing_time, briefing_enabled')
      .single()

    if (settingsErr) {
      return new Response(
        JSON.stringify({ ok: false, error: `Could not load tori_settings: ${settingsErr.message}` }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      )
    }

    // ── Evening briefing check ──────────────────────────────────────────────
    const briefingEnabled = settings?.briefing_enabled ?? false
    const briefingTime    = settings?.briefing_time ?? '18:00'

    if (!briefingEnabled) {
      checks.push({ task: 'evening_briefing', triggered: false, reason: 'Disabled in tori_settings' })
    } else if (chicagoHHMM !== briefingTime) {
      checks.push({
        task: 'evening_briefing',
        triggered: false,
        reason: `Not yet — current ${chicagoHHMM}, target ${briefingTime}`,
      })
    } else {
      // Time matches — fire the briefing function
      const fnUrl  = `${SUPABASE_URL}/functions/v1/tori-evening-briefing`
      const fnRes  = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      })
      const fnJson = await fnRes.json().catch(() => ({ ok: false, error: 'non-JSON response' }))
      checks.push({ task: 'evening_briefing', triggered: true, result: fnJson })
    }

    // ── Future scheduled tasks go here ─────────────────────────────────────
    // e.g. morning digest, weekly report, KB review prompt, etc.

    return new Response(
      JSON.stringify({ ok: true, current_chicago_time: chicagoHHMM, checks }),
      { headers: { 'content-type': 'application/json' } },
    )

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[run-scheduled-reports] Error:', error)
    return new Response(
      JSON.stringify({ ok: false, error, current_chicago_time: chicagoHHMM }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
})
