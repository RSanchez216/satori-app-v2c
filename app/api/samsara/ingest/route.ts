import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { groupMessageIntoContext } from '@/lib/pipeline/group-context'
import { analyzeContext, shouldAnalyze } from '@/lib/pipeline/analyze-context'

export const runtime = 'nodejs'

/**
 * POST /api/samsara/ingest
 *
 * Called by the GramJS samsara-listener service for every SafetyMonitor
 * message received in "Manas Express Samsara Alerts".
 *
 * Body shape:
 * {
 *   telegram_message_id: string       // unique Telegram message ID for dedup
 *   sender_name:         string       // e.g. "SafetyMonitor"
 *   message_text:        string       // full formatted alert text
 *   message_ts:          string       // ISO timestamp
 *   media_url?:          string       // Supabase Storage public URL if media was attached
 *   alert_type?:         string       // parsed alert type (speeding, engine_idle, …)
 *   parsed?:             Record<string, unknown>  // structured parsed data
 * }
 */

const INGEST_SECRET = process.env.SAMSARA_INGEST_SECRET ?? ''

export async function POST(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────
    if (INGEST_SECRET) {
      const auth = req.headers.get('x-samsara-secret')
      if (auth !== INGEST_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await req.json()
    const {
      telegram_message_id,
      sender_name,
      message_text,
      message_ts,
      media_url,
      alert_type,
      parsed,
    } = body as {
      telegram_message_id: string
      sender_name:         string
      message_text:        string
      message_ts:          string
      media_url?:          string
      alert_type?:         string
      parsed?:             Record<string, unknown>
    }

    if (!telegram_message_id || !message_text || !message_ts) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── Find the Samsara source ───────────────────────────────────────
    const { data: source } = await supabase
      .from('sources')
      .select('id, is_active, muted')
      .eq('external_id', 'samsara_manas_express')
      .single()

    if (!source) {
      console.error('[samsara/ingest] Samsara source not found — run migration 20260414_samsara.sql')
      return NextResponse.json({ error: 'Source not configured' }, { status: 503 })
    }

    if (!source.is_active) {
      return NextResponse.json({ ok: true, skipped: 'source_inactive' })
    }

    if (source.muted) {
      return NextResponse.json({ ok: true, skipped: 'source_muted' })
    }

    // ── Dedup by telegram_message_id ─────────────────────────────────
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('telegram_message_id', telegram_message_id)
      .eq('source_id', source.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ ok: true, skipped: 'duplicate' })
    }

    // ── Build enriched message text ───────────────────────────────────
    // Prepend media URL as a reference line if present
    const fullText = media_url
      ? `${message_text}\n[media: ${media_url}]`
      : message_text

    // ── Insert message ───────────────────────────────────────────────
    const { data: savedMsg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        source_id:           source.id,
        sender_name:         sender_name ?? 'SafetyMonitor',
        message_text:        fullText,
        message_ts:          message_ts,
        telegram_message_id: telegram_message_id,
        status:              'processed',
        unread:              true,
        ai_status:           'pending',
      })
      .select('id')
      .single()

    if (msgErr || !savedMsg) {
      console.error('[samsara/ingest] Failed to save message:', msgErr)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    console.log(`[samsara/ingest] Saved message ${savedMsg.id} (type=${alert_type ?? 'unknown'})`)

    // ── Group into context & trigger analysis ─────────────────────────
    const norm = {
      source_id:           source.id,
      sender_name:         sender_name ?? 'SafetyMonitor',
      message_text:        fullText,
      message_ts:          message_ts,
      telegram_message_id: telegram_message_id,
    }

    const contextId = await groupMessageIntoContext(supabase, norm, savedMsg.id)

    if (contextId) {
      const { data: ctx } = await supabase
        .from('message_contexts')
        .select('message_count, started_at, ai_status')
        .eq('id', contextId)
        .single()

      if (ctx && ctx.ai_status !== 'processing' && shouldAnalyze(ctx.message_count, ctx.started_at)) {
        const { data: fullCtx } = await supabase
          .from('message_contexts')
          .select('context_text, message_count')
          .eq('id', contextId)
          .single()

        if (fullCtx?.context_text) {
          analyzeContext(supabase, contextId, fullCtx.context_text, fullCtx.message_count)
            .catch((err) => console.error('[samsara/ingest] analyzeContext error:', err))
        }
      }
    }

    return NextResponse.json({ ok: true, message_id: savedMsg.id })

  } catch (err) {
    console.error('[samsara/ingest] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/** GET — health check */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'SATORI Samsara Ingest',
    timestamp: new Date().toISOString(),
  })
}
