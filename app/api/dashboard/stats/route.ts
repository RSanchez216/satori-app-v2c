import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Returns the UTC ISO string for midnight in Chicago time (handles DST). */
function getChicagoMidnightISO(): string {
  const now = new Date()
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = now.getTime() - chicagoNow.getTime()
  const midnight = new Date(chicagoNow.getFullYear(), chicagoNow.getMonth(), chicagoNow.getDate())
  return new Date(midnight.getTime() + offsetMs).toISOString()
}

const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const fromParam = searchParams.get('from')
    const toParam   = searchParams.get('to')

    const supabase = createAdminClient()
    const from = fromParam ?? getChicagoMidnightISO()
    const to   = toParam   ?? null   // null = no upper bound (live "today" view)

    const [
      { data: openContextsRaw },
      { count: resolvedTodayCount },
      { data: openAlertsRaw },
      { data: recentAlertsRaw },
      { data: activeSourcesRaw },
      { data: toriActivityRaw },
      { count: kbRulesCount },
      { data: messagesTodayRaw },
      { count: contextsTodayCount },
      { count: activeTopicsCount },
      violationsSummaryResult,
      topRulesResult,
    ] = await Promise.all([
      (() => {
        let q = supabase
          .from('message_contexts')
          .select('id, summary, context_preview, department, severity, source_id, started_at, created_at, ai_status, build_status, source:sources(id, name, type)')
          .eq('build_status', 'ready')
          .neq('ai_status', 'failed')
          .gte('created_at', from)
          .order('created_at', { ascending: false })
          .limit(20)
        if (to) q = q.lt('created_at', to)
        return q
      })(),

      (() => {
        let q = supabase
          .from('message_contexts')
          .select('id', { count: 'exact', head: true })
          .eq('ai_status', 'resolved' as string)
          .gte('updated_at', from)
        if (to) q = q.lt('updated_at', to)
        return q
      })(),

      (() => {
        let q = supabase
          .from('alerts')
          .select('id, severity, is_kb_violation')
          .eq('status', 'open')
          .gte('created_at', from)
        if (to) q = q.lt('created_at', to)
        return q
      })(),

      (() => {
        let q = supabase
          .from('alerts')
          .select('*, source:sources(id, name, type)')
          .eq('status', 'open')
          .gte('created_at', from)
          .order('created_at', { ascending: false })
          .limit(5)
        if (to) q = q.lt('created_at', to)
        return q
      })(),

      supabase
        .from('sources')
        .select('*')
        .eq('is_active', true),

      (() => {
        let q = supabase
          .from('tori_activity_log')
          .select('*')
          .gte('created_at', from)
          .order('created_at', { ascending: false })
          .limit(5)
        if (to) q = q.lt('created_at', to)
        return q
      })(),

      supabase
        .from('knowledge_base_rules')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),

      (() => {
        let q = supabase
          .from('messages')
          .select('source_id')
          .gte('created_at', from)
        if (to) q = q.lt('created_at', to)
        return q
      })(),

      (() => {
        let q = supabase
          .from('message_contexts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', from)
        if (to) q = q.lt('created_at', to)
        return q
      })(),

      supabase
        .from('ai_topics')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),

      supabase.rpc('get_violations_summary', { p_start: from, p_end: to ?? new Date().toISOString() }).single(),
      supabase.rpc('get_top_violated_rules', { p_start: from, p_end: to ?? new Date().toISOString(), p_limit: 10 }),
    ])

    // Sort open contexts by severity desc, then started_at desc, take top 5
    const openContexts = (openContextsRaw ?? [])
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

    const activeSources = (activeSourcesRaw ?? []).map((src) => ({
      ...src,
      messagesCount: msgCountBySource[src.id] ?? 0,
    }))

    const summaryRaw = violationsSummaryResult.data as unknown as Record<string, number> | null
    const violationsToday = summaryRaw ? {
      total:    Number(summaryRaw.total          ?? 0),
      critical: Number(summaryRaw.critical       ?? 0),
      high:     Number(summaryRaw.high           ?? 0),
      medium:   Number(summaryRaw.medium         ?? 0),
      low:      Number(summaryRaw.low            ?? 0),
      previous: Number(summaryRaw.total_previous ?? 0),
    } : null
    if (violationsSummaryResult.error) console.error('[dashboard/stats] violations_summary:', violationsSummaryResult.error)

    const topViolatedRules = (topRulesResult.data ?? []).map((r: Record<string, unknown>) => ({
      ruleId:   r.rule_id  as string,
      title:    r.title    as string,
      domain:   r.domain   as string,
      severity: r.severity as string,
      count:    Number(r.violation_count ?? 0),
    }))
    if (topRulesResult.error) console.error('[dashboard/stats] top_rules:', topRulesResult.error)

    return NextResponse.json({
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
      recentAlerts: recentAlertsRaw ?? [],
      toriActivity: toriActivityRaw ?? [],
      activeSources,
      brainStatus: {
        kbRulesActive:  kbRulesCount    ?? 0,
        messagesCount:  messagesTodayRaw?.length ?? 0,
        contextsBuilt:  contextsTodayCount ?? 0,
        topicsTracked:  activeTopicsCount  ?? 0,
      },
      violationsToday,
      topViolatedRules,
    })
  } catch (err) {
    console.error('[dashboard/stats]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
