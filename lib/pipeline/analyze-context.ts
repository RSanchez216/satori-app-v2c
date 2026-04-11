import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextAnalysis } from './types'

const SYSTEM_PROMPT = `You are SATORI's intelligence engine — an AI analyst for a trucking operations company.

Your job is to analyze a window of Telegram messages from an operational group chat and extract structured intelligence.

The company operates trucks, manages drivers, coordinates dispatchers, handles brokers/freight, and monitors compliance.

For each context window you receive, output a JSON object with exactly these fields:

{
  "summary": "2-3 sentence plain-English summary of what happened in this conversation",
  "department": one of ["Dispatch", "Safety", "Accounting", "Maintenance", "HR", "Compliance", "Fleet"] or null,
  "severity": one of ["low", "medium", "high", "critical"] or null,
  "topic_name": "Short topic label (e.g. 'Engine Breakdown', 'Detention Pay Dispute', 'Driver Late')" or null,
  "needs_review": true if a human manager should review this, false otherwise,
  "alert_worthy": true if this requires immediate attention or action, false otherwise,
  "recommended_action": "1 sentence — what should happen next" or null,
  "rationale": "1 sentence — why you assigned this severity/alert status" or null,
  "entities": {
    "driver": "driver name if mentioned" or null,
    "unit": "truck/unit number if mentioned" or null,
    "load": "load/shipment number if mentioned" or null,
    "broker": "broker/company name if mentioned" or null,
    "location": "city, highway, or location if mentioned" or null
  }
}

Severity guide:
- critical: safety risk, accident, breakdown, driver in danger, major compliance violation
- high: revenue impact, significant delay, unresolved dispute, KB rule likely violated
- medium: minor delay, needs follow-up, potential issue developing
- low: routine updates, informational, no action needed

Output ONLY the JSON object. No markdown, no explanation.`

export async function analyzeContext(
  supabase: SupabaseClient,
  contextId: string,
  contextText: string,
  messageCount: number,
): Promise<void> {
  // Mark as processing
  await supabase
    .from('message_contexts')
    .update({ ai_status: 'processing' })
    .eq('id', contextId)

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',   // Fast + cheap for routine analysis
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analyze this Telegram conversation window (${messageCount} messages):\n\n${contextText}`,
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    let analysis: ContextAnalysis
    try {
      // Strip markdown code fences if present
      const cleaned = rawText.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
      analysis = JSON.parse(cleaned)
    } catch {
      throw new Error(`Claude returned invalid JSON: ${rawText.slice(0, 200)}`)
    }

    // Write analysis back to the context row
    await supabase
      .from('message_contexts')
      .update({
        ai_status:          'done',
        summary:            analysis.summary,
        department:         analysis.department,
        severity:           analysis.severity,
        topic_name:         analysis.topic_name,
        needs_review:       analysis.needs_review,
        alert_worthy:       analysis.alert_worthy,
        recommended_action: analysis.recommended_action,
        rationale:          analysis.rationale,
        entities_json:      analysis.entities,
        analyzed_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', contextId)

    // If alert-worthy, create an alert
    if (analysis.alert_worthy && analysis.severity) {
      await supabase.from('alerts').insert({
        context_id:  contextId,
        title:       analysis.topic_name ?? analysis.summary.slice(0, 80),
        description: analysis.summary,
        severity:    analysis.severity,
        department:  analysis.department,
        status:      'open',
        is_kb_violation: false,
      })
    }

    // Log Tori activity
    await supabase.from('tori_activity_log').insert({
      activity_type: 'synthesis',
      title:         `Analyzed: ${analysis.topic_name ?? 'Context window'}`,
      description:   analysis.summary,
      status:        'done',
      context_id:    contextId,
    })

  } catch (err) {
    console.error('[analyzeContext] error:', err)
    await supabase
      .from('message_contexts')
      .update({ ai_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', contextId)
  }
}

/**
 * Decide whether a context is ready for analysis.
 * Trigger when: 5+ messages OR context started > 10 min ago.
 */
export function shouldAnalyze(messageCount: number, startedAt: string): boolean {
  if (messageCount >= 5) return true
  const ageMs = Date.now() - new Date(startedAt).getTime()
  return ageMs > 10 * 60 * 1000   // 10 minutes
}
