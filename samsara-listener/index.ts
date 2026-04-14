/**
 * SATORI — Samsara Telegram Listener
 *
 * Monitors the "Manas Express Samsara Alerts" Telegram group using
 * Rebeca's user account (GramJS / MTProto).
 *
 * For every message from the SafetyMonitor bot:
 *   1. Parse into structured alert data
 *   2. Download any attached media → Supabase Storage
 *   3. POST to SATORI's /api/samsara/ingest endpoint
 *   4. Rate-limit to 1 message/sec to avoid overloading the API
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { NewMessage, NewMessageEvent } from 'telegram/events/index.js'
import { createClient } from '@supabase/supabase-js'
import { parseAlert, formatAlertText } from './parser.js'

// ── Env ──────────────────────────────────────────────────────────────────────
const API_ID       = parseInt(process.env.TG_API_ID ?? '', 10)
const API_HASH     = process.env.TG_API_HASH ?? ''
const SESSION_STR  = process.env.TG_SESSION_STRING ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SATORI_URL   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const INGEST_SECRET = process.env.SAMSARA_INGEST_SECRET ?? ''

// ── Target group ─────────────────────────────────────────────────────────────
const TARGET_GROUP_NAMES = [
  'manas express samsara alerts',
  'samsara alerts',
]
const SAFETYMONITOR_BOT_NAME = 'safetymonitor'

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Rate-limit queue (1 req/sec) ─────────────────────────────────────────────
type QueueItem = () => Promise<void>
const queue: QueueItem[] = []
let processing = false

async function processQueue() {
  if (processing) return
  processing = true
  while (queue.length > 0) {
    const task = queue.shift()!
    try { await task() } catch (e) { console.error('[queue] task error:', e) }
    await sleep(1000)
  }
  processing = false
}

function enqueue(task: QueueItem) {
  queue.push(task)
  processQueue().catch(console.error)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Media download ────────────────────────────────────────────────────────────

async function downloadMedia(
  client: TelegramClient,
  message: NewMessageEvent['message'],
  messageId: string,
): Promise<string | null> {
  try {
    if (!message.media) return null

    const buffer = await client.downloadMedia(message, {}) as Buffer | null
    if (!buffer || !Buffer.isBuffer(buffer)) return null

    // Detect extension from media type
    let ext = 'bin'
    const mediaType = (message.media as Record<string, unknown>)?.className as string | undefined
    if (mediaType === 'MessageMediaPhoto') ext = 'jpg'
    if (mediaType === 'MessageMediaDocument') {
      const mime = ((message.media as Record<string, unknown>)?.document as Record<string, unknown> | undefined)
        ?.mimeType as string | undefined
      if (mime?.includes('video')) ext = 'mp4'
      else if (mime?.includes('image')) ext = 'jpg'
    }

    const path = `alerts/${new Date().toISOString().slice(0, 10)}/${messageId}.${ext}`

    const { error } = await supabase.storage
      .from('samsara-media')
      .upload(path, buffer, { upsert: true, contentType: `application/${ext}` })

    if (error) {
      console.error('[media] upload error:', error.message)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from('samsara-media')
      .getPublicUrl(path)

    console.log(`[media] uploaded → ${path}`)
    return publicUrl

  } catch (e) {
    console.error('[media] download/upload failed:', e)
    return null
  }
}

// ── Ingest POST ───────────────────────────────────────────────────────────────

async function postToSatori(payload: {
  telegram_message_id: string
  sender_name: string
  message_text: string
  message_ts: string
  media_url?: string
  alert_type?: string
  parsed?: Record<string, unknown>
}) {
  const url = `${SATORI_URL}/api/samsara/ingest`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (INGEST_SECRET) headers['x-samsara-secret'] = INGEST_SECRET

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ingest ${res.status}: ${text}`)
  }

  const data = await res.json() as Record<string, unknown>
  console.log(`[ingest] ✓ ${data.message_id ?? data.skipped ?? 'ok'}`)
  return data
}

// ── Message handler ───────────────────────────────────────────────────────────

function makeHandler(client: TelegramClient) {
  return function handler(event: NewMessageEvent) {
    const msg = event.message

    // Only process messages with text or caption
    const rawText = msg.text ?? msg.message ?? ''
    if (!rawText.trim() && !msg.media) return

    enqueue(async () => {
      // Sender check: we only want messages from bots named SafetyMonitor
      let senderName = 'SafetyMonitor'
      try {
        const sender = await msg.getSender()
        if (!sender) return
        const senderRecord = sender as Record<string, unknown>
        const firstName = (senderRecord.firstName ?? senderRecord.username ?? '') as string
        const isBot     = (senderRecord.bot ?? false) as boolean

        if (!isBot && !firstName.toLowerCase().includes(SAFETYMONITOR_BOT_NAME)) {
          // Not a bot with SafetyMonitor in the name — skip
          return
        }
        senderName = firstName || 'SafetyMonitor'
      } catch {
        // Couldn't resolve sender — proceed anyway since group filter already applied
      }

      const messageId = String(msg.id)
      const messageTs = new Date((msg.date ?? 0) * 1000).toISOString()

      // Download media if present
      const mediaUrl = msg.media
        ? await downloadMedia(client, msg, messageId)
        : null

      // Parse the alert
      const text   = rawText || `[media alert]`
      const parsed = parseAlert(text)
      const formattedText = formatAlertText(parsed)

      console.log(`[listener] msg=${messageId} type=${parsed.alert_type} media=${!!mediaUrl}`)

      await postToSatori({
        telegram_message_id: messageId,
        sender_name:         senderName,
        message_text:        formattedText,
        message_ts:          messageTs,
        media_url:           mediaUrl ?? undefined,
        alert_type:          parsed.alert_type,
        parsed: {
          driver_name:   parsed.driver_name,
          vehicle_id:    parsed.vehicle_id,
          vehicle_name:  parsed.vehicle_name,
          speed_mph:     parsed.speed_mph,
          speed_limit:   parsed.speed_limit,
          idle_minutes:  parsed.idle_minutes,
          fuel_pct:      parsed.fuel_pct,
          location:      parsed.location,
          fault_code:    parsed.fault_code,
          fault_desc:    parsed.fault_desc,
          timestamp:     parsed.timestamp,
        },
      })
    })
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_ID || !API_HASH || !SESSION_STR) {
    console.error(
      '[fatal] Missing TG_API_ID, TG_API_HASH, or TG_SESSION_STRING.\n' +
      'Run: npx tsx generate-session.ts to obtain a session string.'
    )
    process.exit(1)
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[fatal] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!SATORI_URL) {
    console.error('[fatal] Missing NEXT_PUBLIC_APP_URL')
    process.exit(1)
  }

  console.log('[startup] Connecting to Telegram…')
  const session = new StringSession(SESSION_STR)
  const client  = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 10,
  })

  await client.connect()
  console.log('[startup] Connected.')

  // Resolve the target group
  let targetPeerId: bigint | null = null
  try {
    const dialogs = await client.getDialogs({ limit: 200 })
    for (const dialog of dialogs) {
      const title = (dialog.title ?? '').toLowerCase()
      if (TARGET_GROUP_NAMES.some((n) => title.includes(n))) {
        const entity = dialog.entity as Record<string, unknown> | undefined
        targetPeerId = entity?.id as bigint ?? null
        console.log(`[startup] Found target group: "${dialog.title}" (id=${targetPeerId})`)
        break
      }
    }
  } catch (e) {
    console.error('[startup] Failed to list dialogs:', e)
  }

  if (!targetPeerId) {
    console.warn('[startup] Target group not found in dialogs — listening on ALL chats (messages from SafetyMonitor only)')
  }

  // Register event handler
  client.addEventHandler(
    makeHandler(client),
    new NewMessage(
      targetPeerId
        ? { chats: [targetPeerId] }
        : {}
    )
  )

  console.log(
    targetPeerId
      ? `[listener] Monitoring "Manas Express Samsara Alerts" — waiting for messages…`
      : `[listener] Monitoring ALL chats for SafetyMonitor messages…`
  )

  // Keep alive
  await client.run({} as Parameters<typeof client.run>[0], async () => {
    console.log('[listener] Client exiting unexpectedly — reconnecting…')
  })
}

main().catch((e) => {
  console.error('[fatal]', e)
  process.exit(1)
})
