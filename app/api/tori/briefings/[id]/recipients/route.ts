import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/** POST /api/tori/briefings/[id]/recipients — add a recipient */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { channel, target, label } = await req.json()

    if (!channel || !target?.trim()) {
      return NextResponse.json({ error: 'channel and target required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('briefing_recipients')
      .insert({
        briefing_id: params.id,
        channel,
        target: target.trim(),
        label:  label?.trim() || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, recipient: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
