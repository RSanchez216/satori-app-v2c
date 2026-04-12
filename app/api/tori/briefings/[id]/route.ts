import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/** PUT /api/tori/briefings/[id] — update briefing settings */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params
    const body = await req.json()
    const {
      name, description, is_enabled, frequency, weekly_day,
      send_time, topics, departments, min_severity,
    } = body

    const supabase = createAdminClient()

    const updates: Record<string, unknown> = {}
    if (name         !== undefined) updates.name         = name.trim()
    if (description  !== undefined) updates.description  = description?.trim() || null
    if (is_enabled   !== undefined) updates.is_enabled   = is_enabled
    if (frequency    !== undefined) updates.frequency    = frequency
    if (weekly_day   !== undefined) updates.weekly_day   = weekly_day
    if (send_time    !== undefined) updates.send_time    = send_time
    if (topics       !== undefined) updates.topics       = topics
    if (departments  !== undefined) updates.departments  = departments
    if (min_severity !== undefined) updates.min_severity = min_severity

    const { data, error } = await supabase
      .from('briefings')
      .update(updates)
      .eq('id', id)
      .select('*, briefing_recipients(*)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, briefing: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** DELETE /api/tori/briefings/[id] — hard delete (cascades to recipients) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('briefings')
      .delete()
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
