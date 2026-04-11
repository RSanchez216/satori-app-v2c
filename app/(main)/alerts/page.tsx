import { createClient } from '@/lib/supabase/server'
import { AlertsClient } from './alerts-client'
import type { Alert, Source, KnowledgeBaseEntry } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function AlertsPage() {
  const supabase = createClient()

  const { data: alerts } = await supabase
    .from('alerts')
    .select('*, source:sources(id, name, type), knowledge_base_entry:knowledge_base_entries(id, title)')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <AlertsClient
      initialAlerts={(alerts ?? []) as (Alert & { source?: Source; knowledge_base_entry?: KnowledgeBaseEntry })[]}
    />
  )
}
