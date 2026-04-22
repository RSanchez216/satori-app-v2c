import { createClient } from '@/lib/supabase/server'
import { KnowledgeBaseClient, type KBRule } from './knowledge-base-client'

export const dynamic = 'force-dynamic'

export default async function KnowledgeBasePage() {
  const supabase = createClient()

  const { data: rules } = await supabase
    .from('knowledge_base_rules')
    .select('*')
    .order('domain',   { ascending: true })
    .order('rule_id',  { ascending: true })

  return <KnowledgeBaseClient initialRules={(rules ?? []) as KBRule[]} />
}
