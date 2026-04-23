import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './dashboard-client'
import type { MessageContext, Alert, Source, ToriActivityLog } from '@/types/database'

export const dynamic = 'force-dynamic'

/** Returns the UTC ISO string for midnight in Chicago time (handles DST). */
function getChicagoMidnightISO(): string {
  const now = new Date()
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = now.getTime() - chicagoNow.getTime()
  const midnight = new Date(chicagoNow.getFullYear(), chicagoNow.getMonth(), chicagoNow.getDate())
  return new Date(midnight.getTime() + offsetMs).toISOString()
}

const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

export type ViolationsSummary = {
  total:    number
  critical: number
  high:     number
  medium:   number
  low:      number
  previous: number
}

export type TopRule = {
  ruleId:   string
  title:    string
  domain:   string
  severity: 'critical' | 'high' | 'medium' | 'low'
  count:    number
}

async function getDashboardData() {
  const supabase = createClient()
  const todayMidnight = getChicagoMidnightISO()
  const nowISO        = new Date().toISOString()

  const [
    { data: openContextsRaw },
    { count: resolvedTodayCount },
    { data: openAlertsRaw },
    { data: recentAlertsRaw },
    { data: activeSourcesRaw },
    { data: toriActivityRaw },
    { count: kbRulesActive },
    { data: messagesTodayRaw },
    { count: contextsTodayCount },
    { data: lastMessageRow },
  ] = await Promise.all([
    supabase
      .from('message_contexts')
      .select('id, summary, context_preview, department, severity, source_id, started_at, created_at, ai_status, build_status, source:sources(id, name, type)')
      .eq('build_status', 'ready')
      .neq('ai_status', 'failed')
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('message_contexts')
      .select('id', { count: 'exact', head: true })
      .eq('ai_status', 'resolved' as string)
      .gte('updated_at', todayMidnight),

    supabase
      .from('alerts')
      .select('id, severity, is_kb_violation')
      .eq('status', 'open'),

    supabase
      .from('alerts')
      .select('*, source:sources(id, name, type)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('sources')
      .select('*')
      .eq('is_active', true),

    supabase
      .from('tori_activity_log')
      .select('*')
      .gte('created_at', todayMidnight)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('knowledge_base_rules')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),

    supabase
      .from('messages')
      .select('source_id')
      .gte('created_at', todayMidnight),

    supabase
      .from('message_contexts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayMidnight),

    supabase
      .from('messages')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // KB tile RPCs — non-fatal, graceful degradation. Initial SSR uses Today;
  // client re-fetches via /api/dashboard/stats when the range changes.
  const [violationsSummaryResult, topRulesResult] = await Promise.allSettled([
    supabase.rpc('get_violations_summary', { p_start: todayMidnight, p_end: nowISO }).single(),
    supabase.rpc('get_top_violated_rules', { p_start: todayMidnight, p_end: nowISO, p_limit: 10 }),
  ])

  const violationsSummaryRaw = violationsSummaryResult.status === 'fulfilled'
    ? (violationsSummaryResult.value.data as unknown as Record<string, number> | null)
    : null
  if (violationsSummaryResult.status === 'fulfilled' && violationsSummaryResult.value.error) {
    console.error('[dashboard] get_violations_summary:', violationsSummaryResult.value.error)
  }

  const topRulesRaw = topRulesResult.status === 'fulfilled'
    ? (topRulesResult.value.data as unknown as Record<string, unknown>[] | null)
    : null
  if (topRulesResult.status === 'fulfilled' && topRulesResult.value.error) {
    console.error('[dashboard] get_top_violated_rules:', topRulesResult.value.error)
  }

  const violationsToday: ViolationsSummary | null = violationsSummaryRaw ? {
    total:    Number(violationsSummaryRaw.total          ?? 0),
    critical: Number(violationsSummaryRaw.critical       ?? 0),
    high:     Number(violationsSummaryRaw.high           ?? 0),
    medium:   Number(violationsSummaryRaw.medium         ?? 0),
    low:      Number(violationsSummaryRaw.low            ?? 0),
    previous: Number(violationsSummaryRaw.total_previous ?? 0),
  } : null

  const topViolatedRules: TopRule[] = (topRulesRaw ?? []).map(r => ({
    ruleId:   r.rule_id   as string,
    title:    r.title     as string,
    domain:   r.domain    as string,
    severity: r.severity  as TopRule['severity'],
    count:    Number(r.violation_count ?? 0),
  }))

  // Sort by severity desc, then started_at desc, take top 5
  const openContexts = ((openContextsRaw ?? []) as unknown as (MessageContext & { source?: Source })[])
    .sort((a, b) => {
      const sd = (severityOrder[b.severity as string] ?? 0) - (severityOrder[a.severity as string] ?? 0)
      if (sd !== 0) return sd
      return new Date(b.started_at ?? b.created_at).getTime() - new Date(a.started_at ?? a.created_at).getTime()
    })
    .slice(0, 5)

  // Health score
  const openAlerts = openAlertsRaw ?? []
  const criticalCount = openAlerts.filter((a) => a.severity === 'critical').length
  const highCount     = openAlerts.filter((a) => a.severity === 'high').length
  const mediumCount   = openAlerts.filter((a) => a.severity === 'medium').length
  const kbViolations  = openAlerts.filter((a) => a.is_kb_violation).length
  const healthScore   = Math.max(0, 100 - criticalCount * 25 - highCount * 10 - mediumCount * 3)
  const openSituations = openContexts.length

  // Tori banner
  let toriBannerMessage: string
  if (criticalCount > 0) {
    toriBannerMessage = `Critical: ${criticalCount} critical alert${criticalCount !== 1 ? 's' : ''} require immediate attention. Review flagged situations now.`
  } else if (openSituations > 0) {
    toriBannerMessage = `You have ${openSituations} open situation${openSituations !== 1 ? 's' : ''}${kbViolations > 0 ? ` and ${kbViolations} KB violation${kbViolations !== 1 ? 's' : ''}` : ''} requiring attention. I've analyzed all incoming communications and flagged the items that need your review.`
  } else {
    toriBannerMessage = 'All systems nominal — no open situations or compliance flags. Connect your first source below to start monitoring your fleet communications.'
  }

  // Per-source message count today
  const msgCountBySource: Record<string, number> = {}
  for (const msg of messagesTodayRaw ?? []) {
    if (msg.source_id) {
      msgCountBySource[msg.source_id] = (msgCountBySource[msg.source_id] ?? 0) + 1
    }
  }

  return {
    stats: {
      openSituations,
      resolvedToday: resolvedTodayCount ?? 0,
      healthScore,
      kbViolations,
      criticalAlerts: criticalCount,
      highAlerts:     highCount,
      mediumAlerts:   mediumCount,
    },
    toriBannerMessage,
    openContexts,
    recentAlerts: (recentAlertsRaw ?? []) as (Alert & { source?: Source })[],
    toriActivity: (toriActivityRaw ?? []) as ToriActivityLog[],
    activeSources: (activeSourcesRaw ?? []).map((src) => ({
      ...(src as Source),
      messagesCount: msgCountBySource[src.id] ?? 0,
    })),
    brainStatus: {
      kbRulesActive:  kbRulesActive ?? 0,
      messagesToday:  messagesTodayRaw?.length ?? 0,
      contextsToday:  contextsTodayCount ?? 0,
      lastActivityAt: (lastMessageRow as { created_at: string } | null)?.created_at ?? null,
    },
    violationsToday,
    topViolatedRules,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardClient {...data} />
}
