import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/** DELETE /api/tori/briefings/[id]/recipients/[recipientId] — remove a recipient */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; recipientId: string } },
) {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('briefing_recipients')
      .delete()
      .eq('id', params.recipientId)
      .eq('briefing_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
