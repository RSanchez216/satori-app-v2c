import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/** GET /api/tori/briefings — list all briefings with recipients */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('briefings')
      .select('*, briefing_recipients(*)')
      .order('created_at')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, briefings: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** POST /api/tori/briefings — create briefing + initial recipients */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, description, frequency, weekly_day, send_time,
      topics, departments, min_severity, recipients = [],
    } = body

    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: briefing, error: bErr } = await supabase
      .from('briefings')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        frequency:   frequency   ?? 'daily',
        weekly_day:  weekly_day  ?? null,
        send_time:   send_time   ?? '18:00',
        topics:      topics      ?? ['all'],
        departments: departments ?? [],
        min_severity: min_severity ?? 'low',
      })
      .select()
      .single()

    if (bErr || !briefing) return NextResponse.json({ error: bErr?.message ?? 'Insert failed' }, { status: 500 })

    if (recipients.length > 0) {
      await supabase.from('briefing_recipients').insert(
        recipients.map((r: { channel: string; target: string; label?: string }) => ({
          briefing_id: briefing.id,
          channel: r.channel,
          target:  r.target,
          label:   r.label ?? null,
          is_active: true,
        })),
      )
    }

    const { data: full } = await supabase
      .from('briefings')
      .select('*, briefing_recipients(*)')
      .eq('id', briefing.id)
      .single()

    return NextResponse.json({ ok: true, briefing: full }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
