import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextAnalysis } from './types'

interface KBCandidate {
  rule_id:            string
  title:              string
  violation_criteria: string
  detection_signals:  string[] | null
}

interface KBMatch {
  rule_id:         string
  matched_signals: string[]
  rationale:       string
}

interface SourceEntry {
  context_id:  string
  source_name: string | null
  reported_at: string
}

/** Builds a stable daily dedupe key from an alert title, e.g. "engine-breakdown:2026-04-14" */
function buildDedupeKey(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  // Use Chicago (CT) date so overnight alerts don't split across two keys
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2') // MM/DD/YYYY → YYYY-MM-DD
  return `${slug}:${date}`
}

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

async function matchKBRules(
  supabase: SupabaseClient,
  contextId: string,
  contextText: string,
): Promise<void> {
  const { data: rules } = await supabase
    .from('knowledge_base_rules')
    .select('rule_id, title, violation_criteria, detection_signals')
    .eq('is_active', true)

  if (!rules || rules.length === 0) return

  const lower = contextText.toLowerCase()

  const candidates: KBCandidate[] = (rules as KBCandidate[]).filter(r =>
    (r.detection_signals ?? []).some(sig => lower.includes(sig.toLowerCase()))
  )

  if (candidates.length === 0) return

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const rulesJson = candidates.map(r => ({
    rule_id:            r.rule_id,
    title:              r.title,
    violation_criteria: r.violation_criteria,
    detection_signals:  r.detection_signals,
  }))

  const prompt = `You are evaluating whether a trucking operations conversation violates any compliance rules.

CONVERSATION:
${contextText.slice(0, 3000)}

RULES TO EVALUATE:
${JSON.stringify(rulesJson, null, 2)}

For each rule whose violation_criteria is CLEARLY MET by the conversation, output a JSON array entry.
Do NOT flag rules based on detection signals alone — the full violation_criteria must be satisfied.

Output a JSON array (empty [] if no violations):
[{ "rule_id": "exact rule_id", "matched_signals": ["signals that appeared"], "rationale": "1 sentence why criteria is met" }]

Output ONLY the JSON array.`

  const res = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  })

  const raw     = res.content[0].type === 'text' ? res.content[0].text : '[]'
  const cleaned = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()

  let matches: KBMatch[]
  try {
    matches = JSON.parse(cleaned)
    if (!Array.isArray(matches)) return
  } catch { return }

  if (matches.length === 0) return

  const validIds = new Set(candidates.map(c => c.rule_id))
  const valid    = matches.filter(m => m.rule_id && validIds.has(m.rule_id))
  if (valid.length === 0) return

  await supabase.from('kb_violations').upsert(
    valid.map(m => ({
      context_id:      contextId,
      rule_id:         m.rule_id,
      matched_signals: m.matched_signals ?? [],
      rationale:       m.rationale ?? null,
      detected_at:     new Date().toISOString(),
    })),
    { onConflict: 'context_id,rule_id', ignoreDuplicates: true },
  )

  await supabase.from('tori_activity_log').insert({
    activity_type: 'kb_match',
    title:         `KB violations detected: ${valid.length} rule${valid.length > 1 ? 's' : ''}`,
    description:   valid.map(m => m.rule_id).join(', '),
    status:        'done',
    context_id:    contextId,
  })
}

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

    // If alert-worthy, upsert the alert (dedup by dedupe_key)
    if (analysis.alert_worthy && analysis.severity) {
      const title     = analysis.topic_name ?? analysis.summary.slice(0, 80)
      const dedupeKey = buildDedupeKey(title)

      // Fetch source name for sources_json tracking
      const { data: ctxRow } = await supabase
        .from('message_contexts')
        .select('source:sources(name)')
        .eq('id', contextId)
        .single()
      const sourceName = (ctxRow?.source as { name?: string } | null)?.name ?? null

      // Check if an alert with this dedupe_key already exists today
      const { data: existing } = await supabase
        .from('alerts')
        .select('id, mention_count, sources_json, description')
        .eq('dedupe_key', dedupeKey)
        .single()

      if (existing) {
        // Merge: increment mention_count, append source, update description
        const prevSources = (existing.sources_json as SourceEntry[] | null) ?? []
        const alreadyListed = prevSources.some((s) => s.context_id === contextId)
        const newSources: SourceEntry[] = alreadyListed
          ? prevSources
          : [...prevSources, { context_id: contextId, source_name: sourceName, reported_at: new Date().toISOString() }]

        await supabase
          .from('alerts')
          .update({
            mention_count: (existing.mention_count ?? 1) + (alreadyListed ? 0 : 1),
            sources_json:  newSources,
            description:   newSources.length > 1
              ? `Reported by ${newSources.length} sources. ${analysis.summary}`
              : existing.description,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        // New alert
        const initialSources: SourceEntry[] = [
          { context_id: contextId, source_name: sourceName, reported_at: new Date().toISOString() },
        ]
        await supabase.from('alerts').insert({
          context_id:   contextId,
          title,
          description:  analysis.summary,
          severity:     analysis.severity,
          department:   analysis.department,
          status:       'open',
          is_kb_violation: false,
          dedupe_key:   dedupeKey,
          mention_count: 1,
          sources_json: initialSources,
          updated_at:   new Date().toISOString(),
        })
      }
    }

    // Log Tori activity
    await supabase.from('tori_activity_log').insert({
      activity_type: 'synthesis',
      title:         `Analyzed: ${analysis.topic_name ?? 'Context window'}`,
      description:   analysis.summary,
      status:        'done',
      context_id:    contextId,
    })

    // KB rule matching — additive, non-fatal
    try {
      await matchKBRules(supabase, contextId, contextText)
    } catch (kbErr) {
      console.error('[analyzeContext] KB matching failed (non-fatal):', kbErr)
    }

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
