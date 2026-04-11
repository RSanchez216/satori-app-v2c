import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const CLASSIFY_SYSTEM = `You are SATORI, an AI operations intelligence system for trucking and logistics companies.
Analyze this message from an operational Telegram group and classify it.

Return ONLY a valid JSON object with these exact fields:
{
  "department": one of ["Dispatch", "Safety", "Accounting", "Fleet", "HR", "Compliance", "Customer", "Other"],
  "severity": one of ["low", "medium", "high", "critical"],
  "summary": "brief 1-sentence summary of what this message is about",
  "topic_name": "short operational topic label (e.g. Driver Issue, Payment Dispute, Safety Incident)",
  "needs_review": boolean,
  "alert_worthy": boolean,
  "recommended_action": "short actionable next step" or null,
  "rationale": "one sentence explaining your classification"
}

Severity guide:
- critical: safety risk, accident, breakdown, driver in danger, major compliance violation
- high: revenue impact, significant delay, unresolved dispute
- medium: minor delay, needs follow-up, potential issue developing
- low: routine update, informational, no action needed

Output ONLY the JSON object. No markdown, no explanation.`

/**
 * POST /api/ai/classify
 * Body: { message_id: string }
 *
 * Classifies a single message using Claude, using surrounding messages as context.
 */
export async function POST(req: NextRequest) {
  try {
    const { message_id } = await req.json()
    if (!message_id) {
      return NextResponse.json({ error: 'message_id required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── Fetch the target message ──────────────────────────────────────
    const { data: msg, error: msgErr } = await supabase
      .from('messages')
      .select('id, source_id, sender_name, message_text, message_ts, telegram_chat_id, ai_status')
      .eq('id', message_id)
      .single()

    if (msgErr || !msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    if (msg.ai_status === 'processing') {
      return NextResponse.json({ message: 'Already processing' })
    }
    if (!msg.message_text) {
      return NextResponse.json({ error: 'Message has no text' }, { status: 400 })
    }

    // Mark as processing
    await supabase
      .from('messages')
      .update({ ai_status: 'processing' })
      .eq('id', message_id)

    // ── Fetch last 10 messages from the same chat for context ─────────
    const { data: recent } = await supabase
      .from('messages')
      .select('sender_name, message_text, message_ts')
      .eq('telegram_chat_id', msg.telegram_chat_id)
      .neq('id', message_id)
      .order('message_ts', { ascending: false })
      .limit(10)

    const contextLines = (recent ?? [])
      .reverse()
      .map((m) => `${m.sender_name}: ${m.message_text}`)
      .join('\n')

    const userPrompt = contextLines
      ? `Context (recent messages):\n${contextLines}\n\nMessage to classify:\nSender: ${msg.sender_name}\nText: ${msg.message_text}\n\nClassify this message.`
      : `Message to classify:\nSender: ${msg.sender_name}\nText: ${msg.message_text}\n\nClassify this message.`

    // ── Call Claude ───────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = rawText.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()

    let classification: {
      department: string
      severity: string
      summary: string
      topic_name: string
      needs_review: boolean
      alert_worthy: boolean
      recommended_action: string | null
      rationale: string
    }

    try {
      classification = JSON.parse(cleaned)
    } catch {
      console.error('[classify] Invalid JSON from Claude:', rawText.slice(0, 200))
      await supabase
        .from('messages')
        .update({ ai_status: 'failed' })
        .eq('id', message_id)
      return NextResponse.json({ error: 'Claude returned invalid JSON' }, { status: 500 })
    }

    // ── Update message ────────────────────────────────────────────────
    await supabase
      .from('messages')
      .update({ ai_status: 'done' })
      .eq('id', message_id)

    console.log('[classify] done:', message_id, classification.topic_name, classification.severity)

    return NextResponse.json({ ok: true, message_id, classification })

  } catch (err) {
    console.error('[/api/ai/classify] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
