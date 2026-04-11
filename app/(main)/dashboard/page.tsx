import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './dashboard-client'
import type { TopicThread, Alert, Source, ToriActivityLog } from '@/types/database'

export const dynamic = 'force-dynamic'

async function getDashboardData() {
  const supabase = createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    { data: openThreads },
    { data: resolvedToday },
    { data: kbViolations },
    { data: recentAlerts },
    { data: sources },
    { data: toriActivity },
    { data: activeKbRules },
    { data: pendingTopics },
    { count: threadsToday },
  ] = await Promise.all([
    supabase
      .from('topic_threads')
      .select('*, source:sources(name, type)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('topic_threads')
      .select('id')
      .eq('status', 'resolved')
      .gte('resolved_at', today.toISOString()),
    supabase
      .from('alerts')
      .select('id')
      .eq('is_kb_violation', true)
      .eq('status', 'open'),
    supabase
      .from('alerts')
      .select('*, source:sources(name, type)')
      .in('status', ['open', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('sources')
      .select('*')
      .eq('is_active', true),
    supabase
      .from('tori_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('knowledge_base_entries')
      .select('id')
      .eq('is_active', true),
    supabase
      .from('ai_topics')
      .select('id')
      .eq('is_suggested', true)
      .eq('is_active', false),
    supabase
      .from('topic_threads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString()),
  ])

  const openCount = openThreads?.length ?? 0
  const resolvedCount = resolvedToday?.length ?? 0
  const kbCount = kbViolations?.length ?? 0
  const activeCount = sources?.length ?? 0

  // Health score: starts at 100, deducted for open situations and KB violations
  const healthScore = Math.max(
    0,
    100 - openCount * 5 - kbCount * 10
  )

  return {
    stats: {
      openSituations: openCount,
      resolvedToday: resolvedCount,
      healthScore,
      kbViolations: kbCount,
    },
    openThreads: (openThreads ?? []) as (TopicThread & { source?: Source })[],
    recentAlerts: (recentAlerts ?? []) as Alert[],
    sources: (sources ?? []) as Source[],
    toriActivity: (toriActivity ?? []) as ToriActivityLog[],
    brainStatus: {
      kbRulesActive: activeKbRules?.length ?? 0,
      threadsToday: threadsToday ?? 0,
      aiSuggestionsPending: pendingTopics?.length ?? 0,
    },
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardClient {...data} />
}
