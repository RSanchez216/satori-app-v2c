import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { groupMessageIntoContext } from '@/lib/pipeline/group-context'
import { analyzeContext, shouldAnalyze } from '@/lib/pipeline/analyze-context'
import type { TelegramUpdate, NormalizedMessage } from '@/lib/pipeline/types'

export const runtime = 'nodejs'

/**
 * POST /api/telegram/webhook
 *
 * Telegram sends every message here. We:
 *  1. Validate the secret token (optional)
 *  2. Extract & normalize the message
 *  3. Look up the source by chat_id
 *  4. Save to `messages`
 *  5. Group into a `message_context` window
 *  6. Trigger AI analysis if the context is ready
 *  7. Return 200 immediately (Telegram requires a fast response)
 */
export async function POST(req: NextRequest) {
  try {
    // ── 1. Optional secret validation ──────────────────────────────
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret) {
      const header = req.headers.get('x-telegram-bot-api-secret-token')
      if (header !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // ── 2. Parse update ────────────────────────────────────────────
    const update: TelegramUpdate = await req.json()
    const tgMsg = update.message ?? update.channel_post

    // Ignore non-text updates (stickers, polls, etc.)
    if (!tgMsg) {
      return NextResponse.json({ ok: true })
    }

    const text = tgMsg.text ?? tgMsg.caption ?? ''
    if (!text.trim()) {
      return NextResponse.json({ ok: true })
    }

    // ── 3. Build normalized message ────────────────────────────────
    const chatId  = String(tgMsg.chat.id)
    const senderName = tgMsg.from
      ? [tgMsg.from.first_name, tgMsg.from.last_name].filter(Boolean).join(' ')
      : tgMsg.chat.title ?? 'Unknown'

    const messageTs = new Date(tgMsg.date * 1000).toISOString()

    const supabase = createAdminClient()

    // ── 4. Find source by external_id (chat_id) ─────────────────────
    const { data: source } = await supabase
      .from('sources')
      .select('id, is_active, muted')
      .eq('external_id', chatId)
      .eq('type', 'telegram')
      .single()

    if (!source) {
      // No source registered for this chat — ignore silently
      console.log(`[webhook] No source found for chat_id=${chatId}`)
      return NextResponse.json({ ok: true })
    }

    if (!source.is_active) {
      return NextResponse.json({ ok: true })
    }

    // ── 5. Save message ─────────────────────────────────────────────
    const { data: savedMsg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        source_id:           source.id,
        sender_name:         senderName,
        message_text:        text.trim(),
        message_ts:          messageTs,
        telegram_chat_id:    chatId,
        telegram_message_id: String(tgMsg.message_id),
        status:              'processed',
        unread:              true,
        ai_status:           'pending',
      })
      .select('id')
      .single()

    if (msgErr || !savedMsg) {
      console.error('[webhook] Failed to save message:', msgErr)
      return NextResponse.json({ ok: true })  // Still return 200 to Telegram
    }

    // ── 6. Group into context ──────────────────────────────────────
    const norm: NormalizedMessage = {
      source_id:           source.id,
      sender_name:         senderName,
      message_text:        text.trim(),
      message_ts:          messageTs,
      telegram_chat_id:    chatId,
      telegram_message_id: String(tgMsg.message_id),
    }

    const contextId = await groupMessageIntoContext(supabase, norm, savedMsg.id)

    // ── 7. Respond 200 to Telegram immediately ─────────────────────
    // Then trigger analysis asynchronously (fire-and-forget)
    if (contextId && !source.muted) {
      // Fetch updated context to check if analysis should run
      const { data: ctx } = await supabase
        .from('message_contexts')
        .select('message_count, started_at, ai_status')
        .eq('id', contextId)
        .single()

      if (ctx && ctx.ai_status !== 'processing' && shouldAnalyze(ctx.message_count, ctx.started_at)) {
        // Re-fetch full context text for analysis
        const { data: fullCtx } = await supabase
          .from('message_contexts')
          .select('context_text, message_count')
          .eq('id', contextId)
          .single()

        if (fullCtx?.context_text) {
          // Fire-and-forget — don't await so Telegram gets 200 immediately
          analyzeContext(supabase, contextId, fullCtx.context_text, fullCtx.message_count)
            .catch((err) => console.error('[webhook] analyzeContext error:', err))
        }
      }
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[webhook] Unhandled error:', err)
    // Always return 200 to prevent Telegram from disabling the webhook
    return NextResponse.json({ ok: true })
  }
}

/** GET — health check so you can verify the endpoint is reachable */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'SATORI Telegram Webhook',
    timestamp: new Date().toISOString(),
  })
}
