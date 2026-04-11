import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * POST /api/sources/dismiss
 * Body: { source_id: string }
 *
 * Deletes an auto-detected source the user doesn't want to monitor.
 */
export async function POST(req: NextRequest) {
  try {
    const { source_id } = await req.json()

    if (!source_id) {
      return NextResponse.json({ error: 'source_id required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('sources')
      .delete()
      .eq('id', source_id)
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
