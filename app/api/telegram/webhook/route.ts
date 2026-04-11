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
 *  4a. If NO source exists → auto-detect: insert inactive source record, return 200
 *  4b. If source is inactive → still auto-detected/pending, return 200
 *  5. Save to `messages`
 *  6. Group into a `message_context` window
 *  7. Trigger AI analysis if the context is ready
 *  8. Return 200 immediately (Telegram requires a fast response)
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

    if (!tgMsg) return NextResponse.json({ ok: true })

    const text = tgMsg.text ?? tgMsg.caption ?? ''
    if (!text.trim()) return NextResponse.json({ ok: true })

    const chatId    = String(tgMsg.chat.id)
    const groupName = tgMsg.chat.title ?? null
    const chatType  = tgMsg.chat.type  // 'private' | 'group' | 'supergroup' | 'channel'

    const senderName = tgMsg.from
      ? [tgMsg.from.first_name, tgMsg.from.last_name].filter(Boolean).join(' ')
      : groupName ?? 'Unknown'

    const messageTs = new Date(tgMsg.date * 1000).toISOString()

    const supabase = createAdminClient()

    // ── 3. Find source by external_id (any is_active status) ────────
    const { data: source } = await supabase
      .from('sources')
      .select('id, is_active, muted, auto_detected')
      .eq('external_id', chatId)
      .eq('type', 'telegram')
      .single()

    // ── 4a. No source at all → auto-detect ──────────────────────────
    if (!source) {
      // Only auto-detect actual groups/channels, not private DMs
      if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
        const { error: insertErr } = await supabase.from('sources').insert({
          name:                groupName ?? `Telegram Group ${chatId}`,
          type:                'telegram',
          external_id:         chatId,
          telegram_group_id:   tgMsg.chat.id,
          telegram_group_name: groupName,
          is_active:           false,
          muted:               false,
          auto_detected:       true,
          detected_at:         new Date().toISOString(),
        })

        if (insertErr) {
          // Could be a race condition duplicate — that's fine, log and move on
          console.log(`[webhook] auto-detect insert skipped for chat_id=${chatId}:`, insertErr.code)
        } else {
          console.log(`[webhook] Auto-detected new group: ${groupName} (${chatId})`)
        }
      } else {
        console.log(`[webhook] No source found for chat_id=${chatId}, type=${chatType} — ignoring`)
      }

      return NextResponse.json({ ok: true })
    }

    // ── 4b. Source exists but not active (pending activation) ────────
    if (!source.is_active) {
      console.log(`[webhook] Source ${source.id} is inactive (pending) — ignoring message`)
      return NextResponse.json({ ok: true })
    }

    // ── 4c. Source is muted ──────────────────────────────────────────
    if (source.muted) {
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
      return NextResponse.json({ ok: true })
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

    // ── 7. Fire-and-forget analysis ────────────────────────────────
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
            .catch((err) => console.error('[webhook] analyzeContext error:', err))
        }
      }
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[webhook] Unhandled error:', err)
    return NextResponse.json({ ok: true })
  }
}

/** GET — health check */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'SATORI Telegram Webhook',
    timestamp: new Date().toISOString(),
  })
}
