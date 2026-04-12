import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * POST /api/tori/send-briefing
 * Triggers the tori-evening-briefing Supabase edge function immediately.
 */
export async function POST() {
  try {
    const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const fnUrl            = `${supabaseUrl}/functions/v1/tori-evening-briefing`

    const res = await fetch(fnUrl, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type':  'application/json',
      },
    })

    const data = await res.json().catch(() => ({ ok: false, error: 'Non-JSON response from edge function' }))

    if (!res.ok || !data.ok) {
      console.error('[/api/tori/send-briefing] edge function error:', data)
      return NextResponse.json(
        { ok: false, error: data.error ?? `Edge function returned ${res.status}` },
        { status: 502 },
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[/api/tori/send-briefing] unhandled:', error)
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
}
