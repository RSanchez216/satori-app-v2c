import { createClient } from '@/lib/supabase/server'
import { SituationsClient } from './situations-client'
import type { SituationData } from '@/components/situations/SituationCard'
import type { AlertSeverity } from '@/types/database'

export const dynamic = 'force-dynamic'

const SEV_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

function deriveStatus(aiStatus: string, alertWorthy: boolean): 'open' | 'resolved' | 'pending' {
  if (aiStatus === 'resolved') return 'resolved'
  if (alertWorthy) return 'open'
  return 'pending'
}

function deriveActiveStep(aiStatus: string, alertWorthy: boolean, kbFlagged: boolean): number {
  if (aiStatus === 'resolved') return 4
  if (kbFlagged) return 2
  if (alertWorthy) return 1
  return 0
}

export default async function SituationsPage() {
  const supabase = createClient()

  const [
    { data: contexts },
    { count: activeSourceCount },
  ] = await Promise.all([
    supabase
      .from('message_contexts')
      .select(`
        id, source_id, started_at, ended_at, message_count, primary_sender,
        context_preview, context_text, build_status, ai_status,
        summary, department, severity, topic_id, topic_name,
        needs_review, alert_worthy, recommended_action, rationale,
        entities_json, analyzed_at, created_at, updated_at,
        source:sources(id, name, type)
      `)
      .eq('build_status', 'ready')
      .neq('ai_status', 'failed')
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('sources')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
  ])

  const valid = (contexts ?? []).filter((c) =>
    ['done', 'resolved', 'pending'].includes(c.ai_status as string)
  )

  // Fetch KB violation alerts for these contexts
  const contextIds = valid.map((c) => c.id)
  let kbAlerts: Array<{
    context_id: string
    knowledge_base_entry: { id: string; title: string; expected_outcome: string | null } | null
  }> = []

  if (contextIds.length > 0) {
    const { data } = await supabase
      .from('alerts')
      .select('context_id, knowledge_base_entry:knowledge_base_entries(id, title, expected_outcome)')
      .in('context_id', contextIds)
      .eq('is_kb_violation', true)
    // Supabase returns the FK join as an array; normalise to single object
    kbAlerts = ((data ?? []) as unknown[]).map((row) => {
      const r = row as Record<string, unknown>
      const kbe = Array.isArray(r.knowledge_base_entry)
        ? (r.knowledge_base_entry[0] ?? null)
        : (r.knowledge_base_entry ?? null)
      return { context_id: r.context_id as string, knowledge_base_entry: kbe as typeof kbAlerts[number]['knowledge_base_entry'] }
    })
  }

  const kbMap = new Map<string, typeof kbAlerts[number]>()
  for (const a of kbAlerts) {
    if (a.context_id && !kbMap.has(a.context_id)) kbMap.set(a.context_id, a)
  }

  // Map to SituationData
  const situations: SituationData[] = valid.map((ctx) => {
    const kbAlert   = kbMap.get(ctx.id) ?? null
    const kbFlagged = !!kbAlert
    const status    = deriveStatus(ctx.ai_status as string, ctx.alert_worthy as boolean)
    const resolvedAt = status === 'resolved' ? (ctx.updated_at as string) : null

    const rawTitle = (ctx.topic_name as string | null) ?? (ctx.summary as string | null) ?? ''
    const title    = rawTitle.length > 70 ? rawTitle.slice(0, 67) + '…' : rawTitle || 'Unnamed Situation'

    return {
      id:                  ctx.id as string,
      title,
      summary:             ctx.summary as string | null,
      department:          ctx.department as string | null,
      severity_peak:       ctx.severity as AlertSeverity | null,
      status,
      started_at:          (ctx.started_at ?? ctx.created_at) as string | null,
      resolved_at:         resolvedAt,
      synthesis_text:      ctx.summary as string | null,
      source_name:         (ctx.source as { name?: string } | null)?.name ?? null,
      message_count:       (ctx.message_count as number) ?? 0,
      primary_sender:      ctx.primary_sender as string | null,
      kb_flagged:          kbFlagged,
      kb_outcome_met:      null,
      kb_rule_name:        kbAlert?.knowledge_base_entry?.title ?? null,
      kb_expected_outcome: kbAlert?.knowledge_base_entry?.expected_outcome ?? null,
      recommended_action:  ctx.recommended_action as string | null,
      rationale:           ctx.rationale as string | null,
      entities:            ctx.entities_json as Record<string, unknown> | null,
      context_text:        ctx.context_text as string | null,
      context_preview:     ctx.context_preview as string | null,
      active_step:         deriveActiveStep(ctx.ai_status as string, ctx.alert_worthy as boolean, kbFlagged),
    }
  })

  // Sort: open critical/high first, then by started_at desc
  situations.sort((a, b) => {
    if (a.status !== 'resolved' && b.status === 'resolved') return -1
    if (a.status === 'resolved' && b.status !== 'resolved') return 1
    const sd = (SEV_ORDER[b.severity_peak ?? ''] ?? 0) - (SEV_ORDER[a.severity_peak ?? ''] ?? 0)
    if (sd !== 0) return sd
    return new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime()
  })

  const departments = Array.from(new Set(situations.map((s) => s.department).filter(Boolean))) as string[]

  return (
    <SituationsClient
      situations={situations}
      departments={departments}
      activeSourceCount={activeSourceCount ?? 0}
    />
  )
}
