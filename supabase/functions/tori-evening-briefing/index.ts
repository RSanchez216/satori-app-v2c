// @ts-nocheck
// Supabase Edge Function: tori-evening-briefing
// Generates and delivers a Tori operational briefing.
//
// NEW: accepts { briefing_id } in the request body to use the
// multi-briefing architecture (briefings + briefing_recipients tables).
// Falls back to tori_settings for backward compatibility if no briefing_id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY       = Deno.env.get('ANTHROPIC_API_KEY')!
const TELEGRAM_BOT_TOKEN      = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY           = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL               = Deno.env.get('REPORTS_FROM_EMAIL') ?? 'info@satoriknows.com'

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical']

function severitiesAtOrAbove(min: string): string[] {
  const idx = SEVERITY_ORDER.indexOf(min)
  return idx === -1 ? SEVERITY_ORDER : SEVERITY_ORDER.slice(idx)
}

// Topic label → DB department name mapping
function topicsToDepts(topics: string[]): string[] {
  const MAP: Record<string, string> = {
    dispatch: 'Dispatch', safety: 'Safety', fleet: 'Fleet',
    hr: 'HR', accounting: 'Accounting', compliance: 'Compliance',
    maintenance: 'Maintenance', customer: 'Customer', driver: 'Driver',
    finance: 'Finance',
  }
  return topics.map(t => MAP[t.toLowerCase()] ?? t)
}

// ─── Chicago time helpers ─────────────────────────────────────────────────────

function getDayRange(tz = 'America/Chicago'): { start: string; end: string; date: string } {
  const now  = new Date()
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)

  for (const offsetH of [4, 5, 6, 7]) {
    const candidate = new Date(`${date}T${String(offsetH).padStart(2, '0')}:00:00Z`)
    const localH = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
        .formatToParts(candidate).find(p => p.type === 'hour')?.value ?? '99', 10,
    )
    if (localH === 0) {
      const end = new Date(candidate.getTime() + 86_400_000)
      return { start: candidate.toISOString(), end: end.toISOString(), date }
    }
  }

  const start = new Date(`${date}T06:00:00Z`)
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString(), date }
}

function getTimeLabel(tz = 'America/Chicago'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date())
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

interface BriefingData {
  briefingName: string
  dateLabel:    string
  timeLabel:    string
  msgCount:     number
  totalAlerts:  number
  severityCounts: { critical: number; high: number; medium: number; low: number }
  topAlerts:    Array<{ title: string; severity: string; department: string | null }>
  contexts:     Array<{
    summary: string | null; context_preview: string | null
    severity: string | null; department: string | null; recommended_action: string | null
  }>
  openCount:    number
}

function buildPrompt(d: BriefingData): string {
  const alertsBlock = d.topAlerts.length > 0
    ? d.topAlerts.map(a => `  • ${a.title} (${a.severity.toUpperCase()} — ${a.department ?? 'General'})`).join('\n')
    : '  None.'

  const ctxBlock = d.contexts.length > 0
    ? d.contexts.map((c, i) => {
        const body   = c.summary ?? c.context_preview ?? 'No summary.'
        const action = c.recommended_action ? `\n     Action: ${c.recommended_action}` : ''
        return `  ${i + 1}. [${(c.severity ?? 'unknown').toUpperCase()} | ${c.department ?? 'General'}] ${body}${action}`
      }).join('\n')
    : '  No analyzed situations — quiet operational day.'

  return `You are Tori, SATORI's AI operations intelligence assistant for a trucking company.\
 Generate the "${d.briefingName}" briefing message for the operations team.

OPERATIONAL DATA FOR ${d.dateLabel.toUpperCase()}:
- Messages monitored: ${d.msgCount}
- Alerts today: ${d.totalAlerts} \
(critical: ${d.severityCounts.critical}, high: ${d.severityCounts.high}, \
medium: ${d.severityCounts.medium}, low: ${d.severityCounts.low})
- Total open alerts (all time): ${d.openCount}

TOP CRITICAL / HIGH ALERTS:
${alertsBlock}

ANALYZED SITUATIONS:
${ctxBlock}

INSTRUCTIONS:
Write a Telegram message using plain text with emojis (NO markdown bold/italic).

Structure:
1. Header: "🌆 ${d.briefingName} — ${d.dateLabel}"
2. Quick stats line
3. Call out critical/high alerts by name if any
4. 2–3 key situations with specific details
5. Open items note
6. One specific, actionable closing observation
7. Footer: "— Tori · ${d.timeLabel} CT"

VOICE: Professional, warm, direct. Speak like a sharp ops manager — specific, not generic.
If quiet, say so and note what you're watching. Under 3500 characters total.`
}

// ─── Email HTML template ──────────────────────────────────────────────────────

function buildEmailHtml(message: string, briefingName: string, dateLabel: string): string {
  const escaped = message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html><html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080d14;font-family:Inter,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080d14;">
<tr><td align="center" style="padding:32px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td align="center" style="padding-bottom:24px;">
    <span style="font-size:18px;font-weight:800;letter-spacing:0.28em;color:#3ecfcf;text-transform:uppercase;">SATORI</span>
  </td></tr>
  <tr><td style="background:#0d1117;border:1px solid #1e2530;border-radius:12px;padding:28px 32px;">
    <p style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#4a5a6a;margin:0 0 6px;">${briefingName}</p>
    <h1 style="font-size:20px;font-weight:800;color:#e6edf3;margin:0 0 18px;">${dateLabel}</h1>
    <div style="height:1px;background:#1e2530;margin-bottom:18px;"></div>
    <div style="font-size:14px;line-height:1.85;color:#c8d8e8;">${escaped}</div>
  </td></tr>
  <tr><td style="padding-top:18px;text-align:center;">
    <p style="font-size:11px;color:#2a3545;margin:0;">Sent by Tori · SATORI Operations Intelligence</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// ─── Delivery helpers ─────────────────────────────────────────────────────────

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.length > 4000 ? text.slice(0, 3997) + '…' : text }),
  })
  return (await r.json()).ok === true
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) { console.warn('RESEND_API_KEY not set'); return false }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Tori <${FROM_EMAIL}>`, to: [to], subject, html }),
  })
  return r.ok
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let briefingId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    briefingId = body?.briefing_id ?? null
  } catch { /* no body */ }

  try {
    // ── NEW PATH: use briefings table ─────────────────────────────────────────
    if (briefingId) {
      const { data: briefing, error: bErr } = await supabase
        .from('briefings').select('*').eq('id', briefingId).single()

      if (bErr || !briefing) throw new Error(`Briefing ${briefingId} not found`)
      if (!briefing.is_enabled) {
        return new Response(JSON.stringify({ ok: false, error: 'Briefing is disabled' }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const { data: recipients } = await supabase
        .from('briefing_recipients')
        .select('*')
        .eq('briefing_id', briefingId)
        .eq('is_active', true)

      if (!recipients?.length) throw new Error('No active recipients configured for this briefing')

      const { start, end, date } = getDayRange(briefing.timezone ?? 'America/Chicago')
      const dateLabel = formatDateLabel(date)
      const timeLabel = getTimeLabel(briefing.timezone ?? 'America/Chicago')

      // Build severity and topic filters
      const allowedSeverities = severitiesAtOrAbove(briefing.min_severity ?? 'low')
      const filterByDept      = !briefing.topics?.includes('all') && briefing.topics?.length > 0
      const allowedDepts      = filterByDept ? topicsToDepts(briefing.topics) : []

      // Fetch data in parallel
      const [topAlertsRes, allAlertsRes, openRes, ctxRes, msgRes] = await Promise.all([
        supabase.from('alerts').select('title,severity,department')
          .in('severity', ['critical', 'high'])
          .gte('created_at', start).lt('created_at', end)
          .order('severity').order('created_at', { ascending: false }).limit(5),

        supabase.from('alerts').select('severity')
          .gte('created_at', start).lt('created_at', end),

        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'open'),

        (() => {
          let q = supabase.from('message_contexts')
            .select('summary,context_preview,severity,department,recommended_action')
            .eq('ai_status', 'done').gte('created_at', start).lt('created_at', end)
            .in('severity', allowedSeverities)
            .order('created_at', { ascending: false }).limit(10)
          if (filterByDept) q = q.in('department', allowedDepts)
          return q
        })(),

        supabase.from('messages').select('id', { count: 'exact', head: true })
          .gte('created_at', start).lt('created_at', end),
      ])

      const topAlerts = topAlertsRes.data ?? []
      const allAlerts = allAlertsRes.data ?? []
      const openCount = openRes.count ?? 0
      const contexts  = ctxRes.data ?? []
      const msgCount  = msgRes.count ?? 0

      const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
      for (const a of allAlerts) {
        const s = a.severity as keyof typeof severityCounts
        if (s in severityCounts) severityCounts[s]++
      }

      const prompt = buildPrompt({
        briefingName: briefing.name,
        dateLabel, timeLabel, msgCount,
        totalAlerts: allAlerts.length,
        severityCounts, topAlerts, contexts, openCount,
      })

      // Generate message
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (!aiRes.ok) throw new Error(`Anthropic error ${aiRes.status}: ${await aiRes.text()}`)
      const aiJson = await aiRes.json()
      const message: string = aiJson.content?.[0]?.text?.trim()
      if (!message) throw new Error('Empty Anthropic response')

      // Deliver to each recipient
      let succeeded = 0
      const sentTo: string[] = []
      for (const r of recipients) {
        let ok = false
        if (r.channel === 'telegram') {
          ok = await sendTelegram(r.target, message)
        } else if (r.channel === 'email') {
          const subject = `${briefing.name} — ${dateLabel}`
          const html    = buildEmailHtml(message, briefing.name, dateLabel)
          ok = await sendEmail(r.target, subject, html)
        }
        if (ok) { succeeded++; sentTo.push(`${r.channel}:${r.target}`) }
      }

      const status = succeeded === 0 ? 'error' : succeeded < recipients.length ? 'partial' : 'success'

      // Log to briefing_history
      await supabase.from('briefing_history').insert({
        briefing_id:          briefingId,
        status,
        recipients_attempted: recipients.length,
        recipients_succeeded: succeeded,
        message_preview:      message.slice(0, 200),
      })

      return new Response(JSON.stringify({
        ok: status !== 'error',
        briefing_id: briefingId,
        briefing_name: briefing.name,
        status,
        sent_to: sentTo,
        recipients_attempted: recipients.length,
        recipients_succeeded: succeeded,
        message_preview: message.slice(0, 200),
        alerts_today: allAlerts.length,
        contexts_analyzed: contexts.length,
      }), { headers: { 'content-type': 'application/json' } })
    }

    // ── LEGACY PATH: use tori_settings single row ─────────────────────────────
    const { data: settings, error: sErr } = await supabase
      .from('tori_settings').select('*').single()

    if (sErr) throw new Error(`Could not load tori_settings: ${sErr.message}`)

    const chatId = settings?.briefing_telegram_chat_id
    if (!chatId) return new Response(JSON.stringify({ ok: false, error: 'No chat ID in tori_settings' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
    if (settings?.briefing_enabled === false) return new Response(JSON.stringify({ ok: false, error: 'Briefings disabled' }), {
      headers: { 'content-type': 'application/json' },
    })

    const { start, end, date } = getDayRange()
    const dateLabel = formatDateLabel(date)
    const timeLabel = getTimeLabel()

    const [topAlertsRes, allAlertsRes, openRes, ctxRes, msgRes] = await Promise.all([
      supabase.from('alerts').select('title,severity,department').in('severity', ['critical', 'high'])
        .gte('created_at', start).lt('created_at', end).order('severity').limit(5),
      supabase.from('alerts').select('severity').gte('created_at', start).lt('created_at', end),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('message_contexts').select('summary,context_preview,severity,department,recommended_action')
        .eq('ai_status', 'done').gte('created_at', start).lt('created_at', end).limit(10),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end),
    ])

    const topAlerts = topAlertsRes.data ?? []
    const allAlerts = allAlertsRes.data ?? []
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const a of allAlerts) {
      const s = a.severity as keyof typeof severityCounts
      if (s in severityCounts) severityCounts[s]++
    }

    const prompt = buildPrompt({
      briefingName: 'Evening Briefing',
      dateLabel, timeLabel,
      msgCount:    msgRes.count ?? 0,
      totalAlerts: allAlerts.length,
      severityCounts, topAlerts,
      contexts:    ctxRes.data ?? [],
      openCount:   openRes.count ?? 0,
    })

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!aiRes.ok) throw new Error(`Anthropic error: ${aiRes.status}`)
    const aiJson = await aiRes.json()
    const message: string = aiJson.content?.[0]?.text?.trim()
    if (!message) throw new Error('Empty Anthropic response')

    await sendTelegram(chatId, message)

    await supabase.from('tori_activity_log').insert({
      activity_type: 'evening_briefing',
      title: `Evening Briefing — ${dateLabel}`,
      description: `Sent to ${chatId}. ${msgRes.count ?? 0} messages, ${allAlerts.length} alerts.`,
      status: 'sent',
    })

    return new Response(JSON.stringify({
      ok: true, telegram_sent: true, chat_id: chatId,
      message_preview: message.slice(0, 200),
      alerts_today: allAlerts.length,
      contexts_analyzed: (ctxRes.data ?? []).length,
    }), { headers: { 'content-type': 'application/json' } })

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[tori-evening-briefing]', error)

    // Log failure
    const failPayload = briefingId
      ? { briefing_id: briefingId, status: 'error', recipients_attempted: 0, recipients_succeeded: 0, error_message: error }
      : { activity_type: 'evening_briefing_error', title: 'Evening Briefing Failed', description: error, status: 'failed' }

    const table = briefingId ? 'briefing_history' : 'tori_activity_log'
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      .from(table).insert(failPayload).then(() => {}).catch(() => {})

    return new Response(JSON.stringify({ ok: false, error }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
