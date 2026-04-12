import { createClient } from '@/lib/supabase/server'
import { SourcesClient } from './sources-client'
import type { Source } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function SourcesPage() {
  const supabase = createClient()

  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false })

  // Get message counts per source
  const { data: msgCounts } = await supabase
    .from('messages')
    .select('source_id')

  // Get context counts per source
  const { data: ctxCounts } = await supabase
    .from('message_contexts')
    .select('source_id')

  // Get last message timestamp per source
  const { data: lastMsgs } = await supabase
    .from('messages')
    .select('source_id, message_ts')
    .order('message_ts', { ascending: false })

  const messageCountMap: Record<string, number> = {}
  const contextCountMap: Record<string, number> = {}
  const lastMessageMap: Record<string, string> = {}

  for (const m of msgCounts ?? []) {
    if (m.source_id) messageCountMap[m.source_id] = (messageCountMap[m.source_id] ?? 0) + 1
  }
  for (const c of ctxCounts ?? []) {
    if (c.source_id) contextCountMap[c.source_id] = (contextCountMap[c.source_id] ?? 0) + 1
  }
  // first occurrence per source_id is the latest (ordered desc)
  for (const m of lastMsgs ?? []) {
    if (m.source_id && !lastMessageMap[m.source_id] && m.message_ts) {
      lastMessageMap[m.source_id] = m.message_ts
    }
  }

  return (
    <SourcesClient
      initialSources={(sources ?? []) as Source[]}
      messageCountMap={messageCountMap}
      contextCountMap={contextCountMap}
      lastMessageMap={lastMessageMap}
    />
  )
}
