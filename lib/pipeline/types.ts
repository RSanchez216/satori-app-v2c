/** Shape of a Telegram Update object (subset we care about) */
export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  channel_post?: TelegramMessage
}

export interface TelegramMessage {
  message_id: number
  from?: {
    id: number
    first_name: string
    last_name?: string
    username?: string
    is_bot?: boolean
  }
  chat: {
    id: number
    title?: string
    type: 'private' | 'group' | 'supergroup' | 'channel'
  }
  date: number            // Unix timestamp
  text?: string
  caption?: string        // for photos/files with caption
}

/** Normalized message we pass through our pipeline */
export interface NormalizedMessage {
  source_id: string
  sender_name: string
  message_text: string
  message_ts: string       // ISO string
  telegram_chat_id: string
  telegram_message_id: string
}

/** Analysis result returned by Claude */
export interface ContextAnalysis {
  summary: string
  department: string | null
  severity: 'low' | 'medium' | 'high' | 'critical' | null
  topic_name: string | null
  needs_review: boolean
  alert_worthy: boolean
  recommended_action: string | null
  rationale: string | null
  entities: {
    driver?: string
    unit?: string
    load?: string
    broker?: string
    location?: string
  }
}
