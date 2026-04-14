import { createClient } from '@/lib/supabase/server'
import { SourcesClient } from './sources-client'
import type { Source, Department } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function SourcesPage() {
  const supabase = createClient()

  const [
    { data: sources },
    { data: departments },
    { data: msgCounts },
    { data: ctxCounts },
    { data: lastMsgs },
  ] = await Promise.all([
    supabase.from('sources').select('*').order('created_at', { ascending: false }),
    supabase.from('departments').select('*').order('display_order', { ascending: true }),
    supabase.from('messages').select('source_id'),
    supabase.from('message_contexts').select('source_id'),
    supabase.from('messages').select('source_id, message_ts').order('message_ts', { ascending: false }),
  ])

  const messageCountMap: Record<string, number> = {}
  const contextCountMap: Record<string, number> = {}
  const lastMessageMap: Record<string, string>  = {}

  for (const m of msgCounts ?? []) {
    if (m.source_id) messageCountMap[m.source_id] = (messageCountMap[m.source_id] ?? 0) + 1
  }
  for (const c of ctxCounts ?? []) {
    if (c.source_id) contextCountMap[c.source_id] = (contextCountMap[c.source_id] ?? 0) + 1
  }
  for (const m of lastMsgs ?? []) {
    if (m.source_id && !lastMessageMap[m.source_id] && m.message_ts) {
      lastMessageMap[m.source_id] = m.message_ts
    }
  }

  return (
    <SourcesClient
      initialSources={(sources ?? []) as Source[]}
      initialDepartments={(departments ?? []) as Department[]}
      messageCountMap={messageCountMap}
      contextCountMap={contextCountMap}
      lastMessageMap={lastMessageMap}
    />
  )
}
