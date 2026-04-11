import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzeContext } from '@/lib/pipeline/analyze-context'

export const runtime = 'nodejs'

/**
 * POST /api/analyze
 * Body: { context_id: string }
 *
 * Manually trigger AI analysis on any context.
 * Used by the inbox "Re-analyze" button and cron jobs.
 *
 * Also handles:
 * POST /api/analyze  (no body) → analyzes all pending contexts
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await req.json().catch(() => ({}))
    const contextId = body?.context_id as string | undefined

    if (contextId) {
      // ── Single context ───────────────────────────────────────────
      const { data: ctx } = await supabase
        .from('message_contexts')
        .select('id, context_text, message_count, ai_status')
        .eq('id', contextId)
        .single()

      if (!ctx) {
        return NextResponse.json({ error: 'Context not found' }, { status: 404 })
      }
      if (!ctx.context_text) {
        return NextResponse.json({ error: 'Context has no text to analyze' }, { status: 400 })
      }
      if (ctx.ai_status === 'processing') {
        return NextResponse.json({ message: 'Already processing' })
      }

      await analyzeContext(supabase, ctx.id, ctx.context_text, ctx.message_count)
      return NextResponse.json({ ok: true, analyzed: 1 })

    } else {
      // ── Batch: all pending contexts with 3+ messages ─────────────
      const { data: pending } = await supabase
        .from('message_contexts')
        .select('id, context_text, message_count')
        .eq('ai_status', 'pending')
        .eq('build_status', 'ready')
        .gte('message_count', 3)
        .order('created_at', { ascending: true })
        .limit(20)

      if (!pending?.length) {
        return NextResponse.json({ ok: true, analyzed: 0 })
      }

      // Process sequentially to avoid API rate limits
      let count = 0
      for (const ctx of pending) {
        if (!ctx.context_text) continue
        await analyzeContext(supabase, ctx.id, ctx.context_text, ctx.message_count)
        count++
      }

      return NextResponse.json({ ok: true, analyzed: count })
    }

  } catch (err) {
    console.error('[/api/analyze] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

/** GET — analyze all pending (handy to trigger from browser during dev) */
export async function GET() {
  const supabase = createAdminClient()

  const { data: pending } = await supabase
    .from('message_contexts')
    .select('id, context_text, message_count')
    .eq('ai_status', 'pending')
    .eq('build_status', 'ready')
    .gte('message_count', 1)
    .order('created_at', { ascending: true })
    .limit(10)

  if (!pending?.length) {
    return NextResponse.json({ ok: true, message: 'No pending contexts', analyzed: 0 })
  }

  let count = 0
  for (const ctx of pending) {
    if (!ctx.context_text) continue
    await analyzeContext(supabase, ctx.id, ctx.context_text, ctx.message_count)
    count++
  }

  return NextResponse.json({ ok: true, analyzed: count })
}
