import { createClient } from '@/lib/supabase/server'
import { KnowledgeBaseClient, type KBRule } from './knowledge-base-client'

export const dynamic = 'force-dynamic'

function getChicagoMidnightISO(): string {
  const now           = new Date()
  const chicagoDate   = new Intl.DateTimeFormat('sv', { timeZone: 'America/Chicago' }).format(now)
  // Find midnight Chicago in UTC by trying CDT (UTC-5) and CST (UTC-6) offsets
  for (const offsetH of [5, 6]) {
    const candidate = new Date(`${chicagoDate}T${String(offsetH).padStart(2, '0')}:00:00Z`)
    const check     = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(candidate)
    if (check === '00:00' || check === '24:00') return candidate.toISOString()
  }
  return `${chicagoDate}T06:00:00Z`
}

export default async function KnowledgeBasePage() {
  const supabase = createClient()

  const [{ data: rules }, { count: violationsToday }] = await Promise.all([
    supabase
      .from('knowledge_base_rules')
      .select('*')
      .order('domain',  { ascending: true })
      .order('rule_id', { ascending: true }),

    supabase
      .from('kb_violations')
      .select('id', { count: 'exact', head: true })
      .gte('detected_at', getChicagoMidnightISO()),
  ])

  return (
    <KnowledgeBaseClient
      initialRules={(rules ?? []) as KBRule[]}
      violationsToday={violationsToday ?? 0}
    />
  )
}
