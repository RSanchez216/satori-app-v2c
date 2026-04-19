// @ts-nocheck
// Supabase Edge Function: auto-heal-stuck-contexts
// Runs every 5 minutes via pg_cron.
//
// Finds contexts that are stuck in 'processing' (> 5 min) or were never
// analyzed (ai_status null/pending, created > 2 min ago), then re-queues
// each one via the Next.js analyze API. Caps at 20 per run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL                  = Deno.env.get('APP_URL') ?? ''   // e.g. https://your-app.vercel.app

const BATCH_CAP   = 20
const DELAY_MS    = 300
const STUCK_MINS  = 5
const UNANALYZED_MINS = 2

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const now      = new Date()

  const stuckCutoff      = new Date(now.getTime() - STUCK_MINS      * 60 * 1000).toISOString()
  const unanalyzedCutoff = new Date(now.getTime() - UNANALYZED_MINS * 60 * 1000).toISOString()

  const healed:  string[] = []
  const failed:  string[] = []

  try {
    // 1. Stuck in 'processing'
    const { data: stuckRows, error: e1 } = await supabase
      .from('message_contexts')
      .select('id, source_id')
      .eq('ai_status', 'processing')
      .lt('updated_at', stuckCutoff)
      .limit(BATCH_CAP)

    if (e1) throw new Error(`stuck query: ${e1.message}`)

    // 2. Never analyzed (null or pending, created long enough ago)
    const remaining = BATCH_CAP - (stuckRows?.length ?? 0)
    let unanalyzedRows: { id: string; source_id: string | null }[] = []

    if (remaining > 0) {
      const { data, error: e2 } = await supabase
        .from('message_contexts')
        .select('id, source_id')
        .or('ai_status.is.null,ai_status.eq.pending')
        .lt('created_at', unanalyzedCutoff)
        .limit(remaining)

      if (e2) throw new Error(`unanalyzed query: ${e2.message}`)
      unanalyzedRows = data ?? []
    }

    const candidates = [...(stuckRows ?? []), ...unanalyzedRows]

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'Nothing to heal', healed: 0, failed: 0 }),
        { headers: { 'content-type': 'application/json' } },
      )
    }

    if (!APP_URL) {
      console.warn('[auto-heal] APP_URL env var not set — skipping HTTP retrigger, resetting to pending only')
    }

    // 3. Process each candidate
    for (let i = 0; i < candidates.length; i++) {
      const ctx = candidates[i]

      try {
        if (APP_URL) {
          // Call the Next.js analyze route
          const res = await fetch(`${APP_URL}/api/ai/analyze-context`, {
            method:  'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ context_id: ctx.id, force: true }),
          })

          if (!res.ok) {
            const txt = await res.text().catch(() => '')
            throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`)
          }
        } else {
          // Fallback: just reset to pending so the next manual trigger picks it up
          await supabase
            .from('message_contexts')
            .update({ ai_status: 'pending', updated_at: now.toISOString() })
            .eq('id', ctx.id)
        }

        healed.push(ctx.id)

        // Log to tori_activity_log
        await supabase.from('tori_activity_log').insert({
          activity_type: 'auto_heal',
          title:         'Auto-heal triggered',
          description:   `Re-queued context ${ctx.id} for AI analysis`,
          context_id:    ctx.id,
          status:        'ok',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[auto-heal] context ${ctx.id} failed:`, msg)
        failed.push(ctx.id)

        await supabase.from('tori_activity_log').insert({
          activity_type: 'auto_heal',
          title:         'Auto-heal failed',
          description:   `Failed to re-queue context ${ctx.id}: ${msg}`,
          context_id:    ctx.id,
          status:        'error',
        })
      }

      if (i < candidates.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }

    return new Response(
      JSON.stringify({
        ok:      true,
        healed:  healed.length,
        failed:  failed.length,
        healed_ids: healed,
        failed_ids: failed,
      }),
      { headers: { 'content-type': 'application/json' } },
    )

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[auto-heal-stuck-contexts]', error)
    return new Response(JSON.stringify({ ok: false, error }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
