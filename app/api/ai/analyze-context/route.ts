import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzeContext } from '@/lib/pipeline/analyze-context'

export const runtime = 'nodejs'

/**
 * POST /api/ai/analyze-context
 * Body: { context_id: string }
 *
 * Runs Claude analysis on a message_context window and writes results back.
 * Creates an alert if alert_worthy. Logs to tori_activity_log.
 *
 * This is a thin HTTP wrapper around lib/pipeline/analyze-context.ts.
 * The webhook uses the pipeline function directly; this route is for
 * manual triggers, retries, and external tooling.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await req.json().catch(() => ({}))
    const contextId = body?.context_id as string | undefined

    if (!contextId) {
      return NextResponse.json({ error: 'context_id required' }, { status: 400 })
    }

    // ── Fetch context ─────────────────────────────────────────────────
    const { data: ctx } = await supabase
      .from('message_contexts')
      .select('id, context_text, message_count, ai_status, source_id')
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

    // ── Run analysis ──────────────────────────────────────────────────
    await analyzeContext(supabase, ctx.id, ctx.context_text, ctx.message_count)

    // ── Return the updated context row ────────────────────────────────
    const { data: updated } = await supabase
      .from('message_contexts')
      .select('id, ai_status, summary, department, severity, topic_name, needs_review, alert_worthy, recommended_action, rationale, entities_json, analyzed_at')
      .eq('id', contextId)
      .single()

    return NextResponse.json({ ok: true, context: updated })

  } catch (err) {
    console.error('[/api/ai/analyze-context] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/ai/analyze-context?context_id=xxx
 *
 * Returns the current analysis state for a context without re-running it.
 */
export async function GET(req: NextRequest) {
  const contextId = req.nextUrl.searchParams.get('context_id')
  if (!contextId) {
    return NextResponse.json({ error: 'context_id query param required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: ctx, error } = await supabase
    .from('message_contexts')
    .select('id, ai_status, summary, department, severity, topic_name, needs_review, alert_worthy, recommended_action, rationale, entities_json, analyzed_at, message_count, context_preview')
    .eq('id', contextId)
    .single()

  if (error || !ctx) {
    return NextResponse.json({ error: 'Context not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, context: ctx })
}
