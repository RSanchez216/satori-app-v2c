import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * GET /api/sources/pending
 *
 * Returns auto-detected sources that haven't been activated yet.
 * Used by the topbar bell to show the notification badge count.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: sources, error } = await supabase
      .from('sources')
      .select('id, name, type, external_id, telegram_group_name, telegram_group_id, detected_at, created_at')
      .eq('is_active', false)
      .eq('auto_detected', true)
      .order('detected_at', { ascending: false })

    if (error) {
      console.error('[/api/sources/pending] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: sources?.length ?? 0, sources: sources ?? [] })
  } catch (err) {
    console.error('[/api/sources/pending] unhandled:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
