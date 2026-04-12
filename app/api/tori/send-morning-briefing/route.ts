import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * POST /api/tori/send-morning-briefing
 * Stub — morning briefing edge function coming soon.
 */
export async function POST() {
  return NextResponse.json({
    ok:   true,
    note: 'Morning briefing edge function coming soon. No message was sent.',
  })
}
