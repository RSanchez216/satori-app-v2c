import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedMessage } from './types'

/**
 * Groups a message into a message_context window.
 *
 * Strategy: 2-hour buckets per chat per day.
 * Context key format: `{telegram_chat_id}:{YYYY-MM-DD}:{bucket}`
 * where bucket = Math.floor(hour / 2)  →  0,1,2,...,11
 *
 * Returns the context id.
 */
export async function groupMessageIntoContext(
  supabase: SupabaseClient,
  msg: NormalizedMessage,
  savedMessageId: string,
): Promise<string> {
  const ts     = new Date(msg.message_ts)
  const date   = ts.toISOString().slice(0, 10)              // YYYY-MM-DD
  const bucket = Math.floor(ts.getUTCHours() / 2)
  const key    = `${msg.telegram_chat_id}:${date}:${bucket}`

  // Look for an existing open context with the same key
  const { data: existing } = await supabase
    .from('message_contexts')
    .select('id, message_count, context_text, primary_sender')
    .eq('context_key', key)
    .eq('source_id', msg.source_id)
    .single()

  const senderLine  = `${msg.sender_name}: ${msg.message_text}`
  const preview     = msg.message_text.slice(0, 140)

  if (existing) {
    // Append to existing context
    const newText  = `${existing.context_text ?? ''}\n${senderLine}`.trim()
    const newCount = (existing.message_count ?? 0) + 1

    await supabase
      .from('message_contexts')
      .update({
        context_text:    newText,
        context_preview: preview,
        message_count:   newCount,
        ended_at:        msg.message_ts,
        updated_at:      new Date().toISOString(),
        // Reset AI status to pending so it re-analyzes with new content
        ai_status: 'pending',
        build_status: 'ready',
      })
      .eq('id', existing.id)

    // Link message to this context
    await supabase
      .from('messages')
      .update({ context_id: existing.id })
      .eq('id', savedMessageId)

    return existing.id
  } else {
    // Create new context
    const { data: created } = await supabase
      .from('message_contexts')
      .insert({
        source_id:       msg.source_id,
        telegram_chat_id: msg.telegram_chat_id,
        context_key:     key,
        started_at:      msg.message_ts,
        ended_at:        msg.message_ts,
        message_count:   1,
        primary_sender:  msg.sender_name,
        context_text:    senderLine,
        context_preview: preview,
        build_status:    'ready',
        ai_status:       'pending',
      })
      .select('id')
      .single()

    if (created) {
      await supabase
        .from('messages')
        .update({ context_id: created.id })
        .eq('id', savedMessageId)
    }

    return created?.id ?? ''
  }
}
