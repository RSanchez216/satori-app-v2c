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

export async function GET() {
  try {
    const supabase = createAdminClient()
    const todayMidnight = getChicagoMidnightISO()

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
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('knowledge_base_entries')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),

      supabase
        .from('messages')
        .select('source_id')
        .gte('created_at', todayMidnight),

      supabase
        .from('message_contexts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayMidnight),

      supabase
        .from('ai_topics')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
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

    return NextResponse.json({
      stats: {
        openSituations,
        resolvedToday: resolvedTodayCount ?? 0,
        healthScore,
        kbViolations,
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
    })
  } catch (err) {
    console.error('[dashboard/stats]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
