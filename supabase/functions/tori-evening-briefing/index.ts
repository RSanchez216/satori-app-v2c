// Supabase Edge Function: tori-evening-briefing
// Generates and sends Tori's evening operational briefing to a Telegram group.
// Invoke via POST /functions/v1/tori-evening-briefing
// or schedule via run-scheduled-reports.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY      = Deno.env.get('ANTHROPIC_API_KEY')!
const TELEGRAM_BOT_TOKEN     = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ─── Chicago time helpers ─────────────────────────────────────────────────────

/** Returns { start, end } as ISO UTC strings bracketing the Chicago calendar day, plus chicagoDate (YYYY-MM-DD). */
function getChicagoDayRange(): { start: string; end: string; chicagoDate: string } {
  const now = new Date()

  // Today's date in Chicago — en-CA gives YYYY-MM-DD format directly
  const chicagoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
  }).format(now)

  // Find the UTC instant that equals midnight Chicago time.
  // Chicago is UTC-6 (CST, Nov–Mar) or UTC-5 (CDT, Mar–Nov).
  // Test both offsets and pick the one where Chicago's local hour reads 0.
  for (const offsetH of [5, 6]) {
    const candidate = new Date(`${chicagoDate}T${String(offsetH).padStart(2, '0')}:00:00Z`)
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: '2-digit',
        hour12: false,
      }).formatToParts(candidate).find(p => p.type === 'hour')?.value ?? '99',
      10,
    )
    if (localHour === 0) {
      const end = new Date(candidate.getTime() + 24 * 60 * 60 * 1000)
      return { start: candidate.toISOString(), end: end.toISOString(), chicagoDate }
    }
  }

  // Fallback: assume CST (UTC-6)
  const start = new Date(`${chicagoDate}T06:00:00Z`)
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 86_400_000).toISOString(),
    chicagoDate,
  }
}

/** Returns current Chicago time as "6:00 PM" */
function getChicagoTimeLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date())
}

/** Formats "2026-04-12" → "Sunday, April 12" */
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  // Use noon UTC to avoid any DST ambiguity
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

interface BriefingData {
  dateLabel: string
  chicagoNow: string
  msgCount: number
  totalAlertsToday: number
  severityCounts: { critical: number; high: number; medium: number; low: number }
  topAlerts: Array<{ title: string; severity: string; department: string | null }>
  contexts: Array<{
    primary_sender: string | null
    context_preview: string | null
    summary: string | null
    severity: string | null
    department: string | null
    recommended_action: string | null
  }>
  openAlertsCount: number
}

function buildPrompt(d: BriefingData): string {
  const alertsBlock = d.topAlerts.length > 0
    ? d.topAlerts.map(a =>
        `  • ${a.title} (${a.severity.toUpperCase()} — ${a.department ?? 'General'})`
      ).join('\n')
    : '  None.'

  const ctxBlock = d.contexts.length > 0
    ? d.contexts.map((c, i) => {
        const sev = c.severity?.toUpperCase() ?? 'UNKNOWN'
        const dept = c.department ?? 'General'
        const body = c.summary ?? c.context_preview ?? 'No summary available.'
        const action = c.recommended_action ? `\n     Action: ${c.recommended_action}` : ''
        return `  ${i + 1}. [${sev} | ${dept}] ${body}${action}`
      }).join('\n')
    : '  No analyzed situations today — quiet operational day.'

  return `You are Tori, SATORI's AI operations intelligence assistant for a trucking company. \
Generate an evening briefing Telegram message for the operations team.

OPERATIONAL DATA FOR ${d.dateLabel.toUpperCase()}:
- Messages monitored today: ${d.msgCount}
- Alerts generated today: ${d.totalAlertsToday} \
(critical: ${d.severityCounts.critical}, high: ${d.severityCounts.high}, \
medium: ${d.severityCounts.medium}, low: ${d.severityCounts.low})
- Total open alerts (all time): ${d.openAlertsCount}

TOP CRITICAL / HIGH ALERTS TODAY:
${alertsBlock}

ANALYZED SITUATIONS TODAY (most important first):
${ctxBlock}

INSTRUCTIONS:
Write a Telegram message using plain text with emojis. NO markdown bold, italic, or formatting codes — \
Telegram will display them literally.

Required structure (in this order):
1. Header: "🌆 Evening Briefing — ${d.dateLabel}"
2. One-line quick stats: messages monitored + total alerts today
3. If any critical/high alerts: call each one out by name and department
4. Key situations: summarize the 2–3 most operationally important from the data above. \
Be specific — use real details from the summaries, not generic statements.
5. Open items: note how many alerts are still open and need attention
6. Closing: one actionable observation or recommendation from Tori — \
make it specific to today's data, not a generic reminder
7. Footer: "— Tori · ${d.chicagoNow} CT"

VOICE: You are professional, warm, direct, and perceptive. Speak like a sharp operations \
manager who knows the business — specific and confident, not robotic or vague. \
If it was genuinely quiet, say so plainly and note what you're watching for tomorrow.

Keep the total message under 3500 characters.`
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // 1. Load tori_settings
    const { data: settings, error: settingsErr } = await supabase
      .from('tori_settings')
      .select('*')
      .single()

    if (settingsErr) throw new Error(`Could not load tori_settings: ${settingsErr.message}`)

    const chatId = settings?.briefing_telegram_chat_id
    if (!chatId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'briefing_telegram_chat_id not configured in tori_settings' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    if (settings?.briefing_enabled === false) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Evening briefings are disabled in tori_settings' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    // 2. Compute today's Chicago date range
    const { start, end, chicagoDate } = getChicagoDayRange()
    const dateLabel  = formatDateLabel(chicagoDate)
    const chicagoNow = getChicagoTimeLabel()

    // 3. Pull all data in parallel
    const [
      topAlertsRes,
      allAlertSeveritiesRes,
      openAlertCountRes,
      contextsRes,
      msgCountRes,
    ] = await Promise.all([
      // Top 5 critical/high alerts created today
      supabase
        .from('alerts')
        .select('title, severity, department, created_at')
        .in('severity', ['critical', 'high'])
        .gte('created_at', start)
        .lt('created_at', end)
        .order('severity', { ascending: true })   // 'critical' < 'high' alphabetically ✓
        .order('created_at', { ascending: false })
        .limit(5),

      // All alert severities today (for counts)
      supabase
        .from('alerts')
        .select('severity')
        .gte('created_at', start)
        .lt('created_at', end),

      // Total open alerts across all time
      supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),

      // Analyzed contexts created today (up to 10)
      supabase
        .from('message_contexts')
        .select('primary_sender, context_preview, summary, severity, department, recommended_action')
        .eq('ai_status', 'done')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .limit(10),

      // Total messages ingested today
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start)
        .lt('created_at', end),
    ])

    const topAlerts     = topAlertsRes.data ?? []
    const allSeverities = allAlertSeveritiesRes.data ?? []
    const openCount     = openAlertCountRes.count ?? 0
    const contexts      = contextsRes.data ?? []
    const msgCount      = msgCountRes.count ?? 0

    // Tally alert severities
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const a of allSeverities) {
      const s = a.severity as keyof typeof severityCounts
      if (s in severityCounts) severityCounts[s]++
    }
    const totalAlertsToday = allSeverities.length

    // 4. Build prompt and call Claude
    const prompt = buildPrompt({
      dateLabel,
      chicagoNow,
      msgCount,
      totalAlertsToday,
      severityCounts,
      topAlerts,
      contexts,
      openAlertsCount: openCount,
    })

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      throw new Error(`Anthropic API error ${aiRes.status}: ${errText}`)
    }

    const aiJson = await aiRes.json()
    const message: string = aiJson.content?.[0]?.text?.trim()
    if (!message) throw new Error('Empty response from Anthropic')

    // Enforce Telegram 4096 char hard limit (our prompt targets 3500 but be safe)
    const finalMessage = message.length > 4000 ? message.slice(0, 3997) + '…' : message

    // 5. Send via Telegram
    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: finalMessage,
        }),
      },
    )

    const tgJson = await tgRes.json()
    if (!tgJson.ok) {
      throw new Error(`Telegram API error: ${JSON.stringify(tgJson)}`)
    }

    // 6. Log success
    await supabase.from('tori_activity_log').insert({
      activity_type: 'evening_briefing',
      title: `Evening Briefing — ${dateLabel}`,
      description: `Sent to chat ${chatId}. ${msgCount} messages, ${totalAlertsToday} alerts today, ${contexts.length} situations analyzed.`,
      status: 'sent',
    })

    return new Response(
      JSON.stringify({
        ok: true,
        telegram_sent: true,
        chat_id: chatId,
        message_preview: finalMessage.slice(0, 200),
        alerts_today: totalAlertsToday,
        contexts_analyzed: contexts.length,
      }),
      { headers: { 'content-type': 'application/json' } },
    )

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[tori-evening-briefing] Error:', error)

    // Log failure (fire-and-forget, don't let log failure mask the original error)
    supabase.from('tori_activity_log').insert({
      activity_type: 'evening_briefing_error',
      title: 'Evening Briefing Failed',
      description: error,
      status: 'failed',
    }).then(() => {}).catch(() => {})

    return new Response(
      JSON.stringify({ ok: false, error }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
})
