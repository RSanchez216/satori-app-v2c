import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/** POST /api/tori/briefings/[id]/recipients — add a recipient */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { channel, target, label, send_voice, is_active } = await req.json()

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
        is_active: is_active !== undefined ? !!is_active : true,
        send_voice: channel === 'telegram' ? !!send_voice : false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, recipient: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** PATCH /api/tori/briefings/[id]/recipients — update an existing recipient
 *  (e.g. toggle send_voice). Body: { recipient_id, ...partial } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json()
    const { recipient_id, send_voice, is_active, label, target } = body
    if (!recipient_id) {
      return NextResponse.json({ error: 'recipient_id required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const updates: Record<string, unknown> = {}
    if (send_voice !== undefined) updates.send_voice = !!send_voice
    if (is_active  !== undefined) updates.is_active  = !!is_active
    if (label      !== undefined) updates.label      = label?.trim() || null
    if (target     !== undefined) updates.target     = String(target).trim()

    const { data, error } = await supabase
      .from('briefing_recipients')
      .update(updates)
      .eq('id', recipient_id)
      .eq('briefing_id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, recipient: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
