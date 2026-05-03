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

// v2 only allows watchlist for new briefings. alert_digest / drill_in
// are reserved for Phases 6 / 8.
const ALLOWED_NEW_TYPES = new Set(['watchlist'])

function validateScope(briefing_type: string, scope: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    return { ok: false, reason: 'scope must be a JSON object' }
  }
  if (briefing_type === 'watchlist') {
    const s = scope as Record<string, unknown>
    if (s.source_type !== 'samsara') {
      return { ok: false, reason: 'watchlist scope must equal {"source_type":"samsara"}' }
    }
  }
  return { ok: true }
}

/** POST /api/tori/briefings — create briefing + initial recipients */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, description, frequency, weekly_day, send_time,
      topics, departments, min_severity, recipients = [],
      briefing_type, scope, is_default,
    } = body

    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

    // Default new rows to 'watchlist' (the only v1-enabled archetype).
    const t = (briefing_type as string | undefined) ?? 'watchlist'
    if (!ALLOWED_NEW_TYPES.has(t)) {
      return NextResponse.json({ error: `briefing_type '${t}' not allowed for new briefings in v1` }, { status: 400 })
    }
    const s = scope ?? (t === 'watchlist' ? { source_type: 'samsara' } : {})
    const v = validateScope(t, s)
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 })

    const supabase = createAdminClient()

    // Mutual exclusivity for is_default — clear other defaults before insert.
    // The DB partial unique index would otherwise reject the insert.
    if (is_default === true) {
      await supabase.from('briefings').update({ is_default: false }).eq('is_default', true)
    }

    const { data: briefing, error: bErr } = await supabase
      .from('briefings')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        frequency:   frequency   ?? 'daily',
        weekly_day:  weekly_day  ?? null,
        send_time:   send_time   ?? '18:00',
        topics:      topics      ?? ['all'],         // legacy NOT-NULL; ignored by watchlist handler
        departments: departments ?? [],
        min_severity: min_severity ?? 'low',
        briefing_type: t,
        scope:        s,
        is_default:   is_default === true,
        ...(body.is_enabled !== undefined ? { is_enabled: body.is_enabled } : {}),
      })
      .select()
      .single()

    if (bErr || !briefing) return NextResponse.json({ error: bErr?.message ?? 'Insert failed' }, { status: 500 })

    if (recipients.length > 0) {
      await supabase.from('briefing_recipients').insert(
        recipients.map((r: { channel: string; target: string; label?: string; send_voice?: boolean }) => ({
          briefing_id: briefing.id,
          channel: r.channel,
          target:  r.target,
          label:   r.label ?? null,
          is_active: true,
          send_voice: r.channel === 'telegram' ? !!r.send_voice : false,
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
