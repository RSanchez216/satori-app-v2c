import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// v2 template archetypes the schema accepts. Phase 2 only allows the
// 'watchlist' archetype to be selected via the modal; 'alert_digest' /
// 'drill_in' are reserved for Phases 6 / 8 and rejected here at the API
// boundary so a misbehaving client can't sneak them through.
const ALLOWED_TYPES_NEW   = new Set(['watchlist'])
const ALLOWED_TYPES_EXIST = new Set(['legacy', 'watchlist'])

function validateScopeForType(briefing_type: string, scope: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    return { ok: false, reason: 'scope must be a JSON object' }
  }
  if (briefing_type === 'watchlist') {
    const s = scope as Record<string, unknown>
    if (s.source_type !== 'samsara') {
      return { ok: false, reason: 'watchlist scope must equal {"source_type":"samsara"}' }
    }
  }
  // legacy accepts any object; alert_digest / drill_in not reachable in v1.
  return { ok: true }
}

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
      briefing_type, scope, is_default,
    } = body

    const supabase = createAdminClient()

    // v2 validation. Existing legacy rows can stay legacy; promoting a
    // legacy row to watchlist mid-life is blocked here (the modal also
    // locks the selector but defense in depth is cheap).
    if (briefing_type !== undefined) {
      if (!ALLOWED_TYPES_EXIST.has(briefing_type)) {
        return NextResponse.json({ error: `briefing_type '${briefing_type}' not allowed in v1` }, { status: 400 })
      }
      const { data: existing } = await supabase
        .from('briefings').select('briefing_type').eq('id', id).maybeSingle()
      if (existing && existing.briefing_type !== briefing_type) {
        return NextResponse.json(
          { error: 'Changing briefing_type on an existing row is not allowed in v1' },
          { status: 400 },
        )
      }
    }
    if (scope !== undefined) {
      const t = (briefing_type as string | undefined) ?? null
      if (t !== null) {
        const v = validateScopeForType(t, scope)
        if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 })
      }
    }

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
    if (briefing_type !== undefined) updates.briefing_type = briefing_type
    if (scope        !== undefined) updates.scope        = scope
    if (is_default   !== undefined) updates.is_default   = !!is_default

    // Mutual exclusivity for is_default: clear previous default first.
    // The DB partial unique index would otherwise reject the update if
    // another row already had is_default=TRUE.
    if (updates.is_default === true) {
      await supabase.from('briefings').update({ is_default: false }).neq('id', id).eq('is_default', true)
    }

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
