import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * GET /api/telegram/test
 *
 * Health check for the entire Telegram pipeline.
 * Returns:
 *   - bot_configured: whether TELEGRAM_BOT_TOKEN is set
 *   - webhook: status from Telegram's getWebhookInfo API
 *   - sources: number of active sources in DB
 *   - messages_total: total messages received
 *   - messages_unread: unread messages
 *   - contexts_pending: contexts waiting for AI analysis
 *   - alerts_open: open alerts
 */
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const supabase = createAdminClient()

  // ── Telegram webhook info ─────────────────────────────────────────
  let webhookInfo: Record<string, unknown> | null = null
  let webhookError: string | null = null

  if (token) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
      const json = await res.json()
      if (json.ok) {
        webhookInfo = json.result
      } else {
        webhookError = json.description ?? 'Telegram API error'
      }
    } catch (err) {
      webhookError = err instanceof Error ? err.message : 'Network error'
    }
  }

  // ── Database stats (parallel) ─────────────────────────────────────
  const [
    sourcesRes,
    messagesRes,
    unreadRes,
    pendingCtxRes,
    alertsRes,
  ] = await Promise.all([
    supabase.from('sources').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('unread', true),
    supabase.from('message_contexts').select('id', { count: 'exact', head: true }).eq('ai_status', 'pending'),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    bot_configured: !!token,
    webhook_secret_configured: !!process.env.TELEGRAM_WEBHOOK_SECRET,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    webhook: webhookInfo
      ? {
          url: webhookInfo.url,
          has_custom_certificate: webhookInfo.has_custom_certificate,
          pending_update_count: webhookInfo.pending_update_count,
          last_error_date: webhookInfo.last_error_date,
          last_error_message: webhookInfo.last_error_message,
          max_connections: webhookInfo.max_connections,
        }
      : { error: webhookError ?? 'TELEGRAM_BOT_TOKEN not set' },
    db: {
      sources_active:    sourcesRes.count ?? 0,
      messages_total:    messagesRes.count ?? 0,
      messages_unread:   unreadRes.count ?? 0,
      contexts_pending:  pendingCtxRes.count ?? 0,
      alerts_open:       alertsRes.count ?? 0,
    },
  })
}
