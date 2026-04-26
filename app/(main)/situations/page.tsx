import { createClient } from '@/lib/supabase/server'
import { SituationsClient } from './situations-client'
import type { SituationData, KBViolationChip } from '@/components/situations/SituationCard'
import type { AlertSeverity } from '@/types/database'

export const dynamic = 'force-dynamic'

const SEV_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

/** UTC ISO string for midnight in Chicago time (handles DST). Matches Dashboard. */
function getChicagoMidnightISO(): string {
  const now = new Date()
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = now.getTime() - chicagoNow.getTime()
  const midnight = new Date(chicagoNow.getFullYear(), chicagoNow.getMonth(), chicagoNow.getDate())
  return new Date(midnight.getTime() + offsetMs).toISOString()
}

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
  const todayMidnight = getChicagoMidnightISO()

  // Page is scoped to today CT, matching how Dashboard KPIs count.
  // (Date range selector is a follow-up ticket.)
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
      .gte('created_at', todayMidnight)
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

  // Fetch KB violations from the new pipeline (kb_violations + knowledge_base_rules)
  // and group per context for chip rendering + KB Flagged count.
  const contextIds = valid.map((c) => c.id)
  type KBViolationRow = {
    context_id: string
    rule_id:    string
    knowledge_base_rules: { title: string; severity: string } | null
  }

  const kbByContext = new Map<string, KBViolationChip[]>()

  if (contextIds.length > 0) {
    const { data: kbRows } = await supabase
      .from('kb_violations')
      .select('context_id, rule_id, knowledge_base_rules(title, severity)')
      .in('context_id', contextIds)

    // Supabase returns the FK join as an object on a single FK, but as an array
    // through the type system; normalise to a single object.
    const rows: KBViolationRow[] = ((kbRows ?? []) as unknown[]).map((row) => {
      const r = row as Record<string, unknown>
      const rule = Array.isArray(r.knowledge_base_rules)
        ? (r.knowledge_base_rules[0] ?? null)
        : (r.knowledge_base_rules ?? null)
      return {
        context_id: r.context_id as string,
        rule_id:    r.rule_id as string,
        knowledge_base_rules: rule as KBViolationRow['knowledge_base_rules'],
      }
    })

    for (const row of rows) {
      const chip: KBViolationChip = {
        rule_id:  row.rule_id,
        title:    row.knowledge_base_rules?.title ?? row.rule_id,
        severity: (row.knowledge_base_rules?.severity ?? 'low') as AlertSeverity,
      }
      const list = kbByContext.get(row.context_id) ?? []
      list.push(chip)
      kbByContext.set(row.context_id, list)
    }

    // Sort each context's chips by severity desc, then title asc
    Array.from(kbByContext.keys()).forEach((cid) => {
      const list = kbByContext.get(cid)!
      list.sort((a: KBViolationChip, b: KBViolationChip) => {
        const sd = (SEV_ORDER[b.severity] ?? 0) - (SEV_ORDER[a.severity] ?? 0)
        if (sd !== 0) return sd
        return a.title.localeCompare(b.title)
      })
    })
  }

  // Map to SituationData
  const situations: SituationData[] = valid.map((ctx) => {
    const kbViolations = kbByContext.get(ctx.id as string) ?? []
    const kbFlagged    = kbViolations.length > 0
    const status       = deriveStatus(ctx.ai_status as string, ctx.alert_worthy as boolean)
    const resolvedAt   = status === 'resolved' ? (ctx.updated_at as string) : null

    const rawTitle = (ctx.topic_name as string | null) ?? (ctx.summary as string | null) ?? ''
    const title    = rawTitle.length > 70 ? rawTitle.slice(0, 67) + '…' : rawTitle || 'Unnamed Situation'

    // Top-violation derived fields kept for the existing KBViolationBanner
    const topViolation = kbViolations[0] ?? null

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
      kb_rule_name:        topViolation?.title ?? null,
      kb_expected_outcome: null,
      kb_violations:       kbViolations,
      kb_violation_count:  kbViolations.length,
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
