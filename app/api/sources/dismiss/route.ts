import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * POST /api/sources/dismiss
 * Body: { source_id: string } | { source_ids: string[] }
 *
 * Marks auto-detected source(s) as dismissed by setting dismissed_at = now().
 * Does NOT delete — excluded from notification queries via dismissed_at IS NULL filter.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const ids: string[] = body.source_ids ?? (body.source_id ? [body.source_id] : [])

    if (ids.length === 0) {
      return NextResponse.json({ error: 'source_id or source_ids required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('sources')
      .update({ dismissed_at: new Date().toISOString() })
      .in('id', ids)
      .eq('auto_detected', true)   // safety: only dismiss auto-detected ones

    if (error) {
      console.error('[/api/sources/dismiss] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/sources/dismiss] unhandled:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
