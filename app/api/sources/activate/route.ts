import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * POST /api/sources/activate
 * Body: { source_id: string, display_name: string }
 *
 * Activates an auto-detected source and optionally renames it.
 */
export async function POST(req: NextRequest) {
  try {
    const { source_id, display_name } = await req.json()

    if (!source_id) {
      return NextResponse.json({ error: 'source_id required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: source, error } = await supabase
      .from('sources')
      .update({
        is_active: true,
        ...(display_name ? { name: display_name.trim() } : {}),
      })
      .eq('id', source_id)
      .select()
      .single()

    if (error || !source) {
      console.error('[/api/sources/activate] error:', error)
      return NextResponse.json({ error: error?.message ?? 'Source not found' }, { status: 500 })
    }

    console.log('[sources/activate] activated:', source.id, source.name)
    return NextResponse.json({ ok: true, source })
  } catch (err) {
    console.error('[/api/sources/activate] unhandled:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
