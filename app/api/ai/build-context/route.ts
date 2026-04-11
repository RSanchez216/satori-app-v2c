import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { groupMessageIntoContext } from '@/lib/pipeline/group-context'
import type { NormalizedMessage } from '@/lib/pipeline/types'

export const runtime = 'nodejs'

/**
 * POST /api/ai/build-context
 * Body: { source_id: string }
 *
 * Groups recent unprocessed messages from a source into 2-hour context windows.
 * Useful to call manually or on a cron to catch any messages that weren't
 * grouped at ingest time.
 *
 * GET /api/ai/build-context
 * Processes ALL sources with unprocessed messages.
 */
export async function POST(req: NextRequest) {
  try {
    const { source_id } = await req.json()
    if (!source_id) {
      return NextResponse.json({ error: 'source_id required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const count = await processSourceMessages(supabase, source_id)

    return NextResponse.json({ ok: true, contexts_created: count })

  } catch (err) {
    console.error('[/api/ai/build-context] POST error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()

    // Find all sources that have messages with no context_id yet
    const { data: sourceIds } = await supabase
      .from('messages')
      .select('source_id')
      .is('context_id', null)
      .not('source_id', 'is', null)
      .limit(200)

    if (!sourceIds?.length) {
      return NextResponse.json({ ok: true, message: 'Nothing to process', contexts_created: 0 })
    }

    // Deduplicate source IDs
    const unique = [...new Set(sourceIds.map((r) => r.source_id as string))]

    let total = 0
    for (const sid of unique) {
      total += await processSourceMessages(supabase, sid)
    }

    return NextResponse.json({ ok: true, sources_processed: unique.length, contexts_created: total })

  } catch (err) {
    console.error('[/api/ai/build-context] GET error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

/**
 * Groups all context-less messages for a given source into context windows.
 * Returns the number of new context rows created.
 */
async function processSourceMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  source_id: string,
): Promise<number> {
  // Fetch last 20 messages with no context assigned
  const { data: messages } = await supabase
    .from('messages')
    .select('id, source_id, sender_name, message_text, message_ts, telegram_chat_id, telegram_message_id')
    .eq('source_id', source_id)
    .is('context_id', null)
    .not('message_text', 'is', null)
    .order('message_ts', { ascending: true })
    .limit(20)

  if (!messages?.length) return 0

  // Track which context IDs we create (to count new ones)
  const seenContextIds = new Set<string>()

  for (const msg of messages) {
    if (!msg.telegram_chat_id) continue

    const norm: NormalizedMessage = {
      source_id:           msg.source_id,
      sender_name:         msg.sender_name ?? 'Unknown',
      message_text:        msg.message_text,
      message_ts:          msg.message_ts,
      telegram_chat_id:    msg.telegram_chat_id,
      telegram_message_id: msg.telegram_message_id ?? '',
    }

    const contextId = await groupMessageIntoContext(supabase, norm, msg.id)
    if (contextId) seenContextIds.add(contextId)
  }

  console.log(`[build-context] source=${source_id} touched ${seenContextIds.size} contexts for ${messages.length} messages`)
  return seenContextIds.size
}
