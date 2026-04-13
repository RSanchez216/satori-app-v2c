import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * GET /api/notifications
 * Returns pending auto-detected sources + recent critical/high alerts.
 * Used by the topbar bell.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [{ data: sources, error: srcErr }, { data: alerts, error: alertErr }] = await Promise.all([
      supabase
        .from('sources')
        .select('id, name, external_id, telegram_group_name, telegram_group_id, detected_at, created_at')
        .eq('is_active', false)
        .eq('auto_detected', true)
        .is('dismissed_at', null)
        .order('detected_at', { ascending: false }),

      supabase
        .from('alerts')
        .select('id, title, severity, created_at, source:sources(name)')
        .eq('status', 'open')
        .in('severity', ['critical', 'high'])
        .gte('created_at', cutoff24h)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    if (srcErr)   console.error('[/api/notifications] sources error:', srcErr)
    if (alertErr) console.error('[/api/notifications] alerts error:', alertErr)

    return NextResponse.json({
      pendingSources: sources ?? [],
      alerts:         alerts  ?? [],
    })
  } catch (err) {
    console.error('[/api/notifications] unhandled:', err)
    return NextResponse.json({ pendingSources: [], alerts: [] }, { status: 500 })
  }
}
