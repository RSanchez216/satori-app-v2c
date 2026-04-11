import { createClient } from '@/lib/supabase/server'
import { SituationsClient } from './situations-client'
import { MOCK_SITUATIONS } from './situations-data'
import type { SituationData } from '@/components/situations/SituationCard'
import type { AlertSeverity } from '@/types/database'

export const dynamic = 'force-dynamic'

/** Map a raw topic_thread DB row to the SituationData shape */
function mapThread(row: Record<string, unknown>, kbMap: Map<string, { title: string; expected_outcome: string | null }>): SituationData {
  const kbEntry = row.knowledge_base_entry_id
    ? kbMap.get(row.knowledge_base_entry_id as string)
    : null

  const status = (row.status as string) as SituationData['status']
  const severity = row.severity_peak as AlertSeverity | null

  // Derive active_step from status
  let active_step = 0
  if (status === 'open')       active_step = (row.kb_flagged ? 2 : 1)
  if (status === 'escalated')  active_step = 2
  if (status === 'unresolved') active_step = 3
  if (status === 'resolved')   active_step = 4

  return {
    id:               (row.id as string),
    title:            (row.title as string),
    department:       (row.department as string | null),
    severity_peak:    severity,
    status,
    started_at:       (row.started_at as string | null),
    resolved_at:      (row.resolved_at as string | null),
    synthesis_text:   (row.synthesis_text as string | null),
    message_count:    (row.message_count as number) ?? 0,
    kb_flagged:       !!(row.kb_flagged),
    kb_outcome_met:   (row.kb_outcome_met as boolean | null),
    kb_rule_name:     kbEntry?.title ?? null,
    kb_expected_outcome: kbEntry?.expected_outcome ?? null,
    active_step,
    source_name: (row as Record<string, unknown> & { source?: { name?: string } }).source?.name ?? null,
  }
}

export default async function SituationsPage() {
  const supabase = createClient()

  const { data: threads } = await supabase
    .from('topic_threads')
    .select('*, source:sources(id, name)')
    .order('created_at', { ascending: false })
    .limit(200)

  // Fetch KB entries for flagged threads
  const kbIds = (threads ?? [])
    .map((t) => t.knowledge_base_entry_id)
    .filter(Boolean) as string[]

  const kbMap = new Map<string, { title: string; expected_outcome: string | null }>()
  if (kbIds.length > 0) {
    const { data: kbEntries } = await supabase
      .from('knowledge_base_entries')
      .select('id, title, expected_outcome')
      .in('id', kbIds)

    for (const entry of kbEntries ?? []) {
      kbMap.set(entry.id, { title: entry.title, expected_outcome: entry.expected_outcome })
    }
  }

  const hasRealData = (threads?.length ?? 0) > 0

  const situations: SituationData[] = hasRealData
    ? (threads ?? []).map((t) => mapThread(t as Record<string, unknown>, kbMap))
    : MOCK_SITUATIONS

  return <SituationsClient situations={situations} isMock={!hasRealData} />
}
