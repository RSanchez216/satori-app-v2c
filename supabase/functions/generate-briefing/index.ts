// @ts-nocheck
//
// Supabase Edge Function: generate-briefing
//
// Single entry for all v2 briefing templates. Routes by `briefing.briefing_type`
// to a per-template handler, validates `briefing.scope` via Zod, persists the
// result as a `briefing_history` row, and (Phase 4+) triggers `deliver-briefing`
// for push channels.
//
// Legacy briefings (`briefing_type='legacy'`) are blocked here — they go
// through `tori-evening-briefing` via the dispatcher's branch. Defense in
// depth at the function boundary.
//
// Auth: verify_jwt = true. Cron calls supply the service-role bearer; UI
// "Run now" calls (Phase 5) use the user's JWT.

import * as watchlistHandler from './handlers/watchlist.ts'
import { SCOPE_VALIDATORS } from './scope-schemas.ts'
import { resolveRange }     from './range.ts'
import { adminClient, jsonResponse, logError, logInfo } from './shared.ts'
import type { WatchlistPayload } from './types.ts'

type TemplateHandler = {
  generate: (input: {
    briefing:        Record<string, unknown>
    range:           { from: string; to: string }
    previousPayload: WatchlistPayload | null
    supabase:        unknown
  }) => Promise<WatchlistPayload>
}

const TEMPLATE_HANDLERS: Record<string, TemplateHandler> = {
  watchlist: watchlistHandler,
  // alert_digest: alertDigestHandler,  // Phase 6
  // drill_in:     drillInHandler,      // Phase 8
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)
  }

  let body: { briefing_id?: string; range_from?: string; range_to?: string; dispatch?: boolean }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Body must be JSON' }, 400)
  }

  const briefingId = body.briefing_id
  if (!briefingId) {
    return jsonResponse({ ok: false, error: 'briefing_id required' }, 400)
  }

  const supabase = adminClient()

  // 1. Load briefing.
  const { data: briefing, error: bErr } = await supabase
    .from('briefings').select('*').eq('id', briefingId).maybeSingle()
  if (bErr) {
    logError('load', `db error loading ${briefingId}: ${bErr.message}`)
    return jsonResponse({ ok: false, error: bErr.message }, 500)
  }
  if (!briefing) {
    return jsonResponse({ ok: false, error: `Briefing ${briefingId} not found` }, 404)
  }

  // 2. Reject legacy at the function boundary.
  if (briefing.briefing_type === 'legacy' || !briefing.briefing_type) {
    return jsonResponse(
      { ok: false, error: 'Legacy briefings route to tori-evening-briefing' },
      400,
    )
  }

  // 3. Validate scope per template.
  const validator = SCOPE_VALIDATORS[briefing.briefing_type as keyof typeof SCOPE_VALIDATORS]
  if (!validator) {
    return jsonResponse(
      { ok: false, error: `Unknown template: ${briefing.briefing_type}` },
      400,
    )
  }
  const parsed = validator.safeParse(briefing.scope)
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: `Invalid scope for ${briefing.briefing_type}: ${parsed.error.message}` },
      400,
    )
  }

  // 4. Resolve range.
  const range = resolveRange(briefing.briefing_type, {
    range_from: body.range_from,
    range_to:   body.range_to,
  })

  // 5. Load previous successful run for "What's New" diff.
  const { data: priorRow } = await supabase
    .from('briefing_history')
    .select('id, message_full_text, sent_at')
    .eq('briefing_id', briefingId)
    .eq('status', 'success')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let previousPayload: WatchlistPayload | null = null
  if (priorRow?.message_full_text) {
    try {
      const parsedPrior = JSON.parse(priorRow.message_full_text)
      // Guard: only treat the prior as "comparable" if its template matches
      // the current briefing's template. A briefing whose template was
      // reconfigured shouldn't compare against the old shape.
      if (parsedPrior?.template === briefing.briefing_type) {
        previousPayload = parsedPrior as WatchlistPayload
      }
    } catch {
      // Prior row is legacy / malformed — leave previousPayload null.
    }
  }

  // 6. Route to the template handler.
  const handler = TEMPLATE_HANDLERS[briefing.briefing_type as string]
  if (!handler) {
    return jsonResponse(
      { ok: false, error: `Template handler not yet implemented: ${briefing.briefing_type}` },
      501,
    )
  }

  let payload: WatchlistPayload
  try {
    payload = await handler.generate({
      briefing,
      range,
      previousPayload,
      supabase,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError('handler', `${briefing.briefing_type}: ${msg}`)
    // Record the failure in history so the UI shows what tried to fire.
    await supabase.from('briefing_history').insert({
      briefing_id:          briefingId,
      status:               'error',
      recipients_attempted: 0,
      recipients_succeeded: 0,
      message_preview:      null,
      error_message:        msg,
    })
    return jsonResponse({ ok: false, error: msg }, 500)
  }

  // 7. Persist the run as a briefing_history row.
  const messageFull = JSON.stringify(payload)
  const { data: histRow, error: hErr } = await supabase
    .from('briefing_history')
    .insert({
      briefing_id:          briefingId,
      status:               'success',
      recipients_attempted: 0,    // Phase 4 fills these
      recipients_succeeded: 0,
      message_preview:      `${payload.template} · ${payload.range.from.slice(0, 16)} → ${payload.range.to.slice(0, 16)}`,
      message_full_text:    messageFull,
      voice_sent:           false,
      recipient_results:    [],
    })
    .select('id')
    .single()
  if (hErr) {
    logError('persist', `failed to write briefing_history: ${hErr.message}`)
    return jsonResponse({ ok: false, error: hErr.message }, 500)
  }

  // 8. Optional dispatch (Phase 4 wires deliver-briefing).
  if (body.dispatch === true) {
    logInfo('dispatch', `dispatch=true requested for run ${histRow.id} but deliver-briefing is not yet deployed (Phase 4); skipping push`)
  }

  return jsonResponse({
    ok:      true,
    run_id:  histRow.id,
    payload,
  })
})
