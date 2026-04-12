import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * POST /api/tori/briefings/[id]/send
 * Immediately triggers the tori-evening-briefing edge function for a specific briefing.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
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
      body: JSON.stringify({ briefing_id: params.id }),
    })

    const data = await res.json().catch(() => ({
      ok: false,
      error: `Non-JSON response (HTTP ${res.status})`,
    }))

    if (!res.ok || !data.ok) {
      console.error(`[/api/tori/briefings/${params.id}/send] edge fn error:`, data)
      return NextResponse.json(
        { ok: false, error: data.error ?? `Edge function returned ${res.status}` },
        { status: 502 },
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[/api/tori/briefings/send] unhandled:`, error)
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
}
