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

  const messageCountMap: Record<string, number> = {}
  const contextCountMap: Record<string, number> = {}

  for (const m of msgCounts ?? []) {
    if (m.source_id) messageCountMap[m.source_id] = (messageCountMap[m.source_id] ?? 0) + 1
  }
  for (const c of ctxCounts ?? []) {
    if (c.source_id) contextCountMap[c.source_id] = (contextCountMap[c.source_id] ?? 0) + 1
  }

  return (
    <SourcesClient
      initialSources={(sources ?? []) as Source[]}
      messageCountMap={messageCountMap}
      contextCountMap={contextCountMap}
    />
  )
}
