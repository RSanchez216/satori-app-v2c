export type SourceType = 'telegram' | 'email' | 'phone'
export type MessageStatus = 'pending' | 'processed' | 'failed'
export type AiStatus = 'pending' | 'processing' | 'done' | 'failed'
export type ThreadStatus = 'open' | 'resolved' | 'escalated' | 'unresolved'
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed'
export type ActivityType =
  | 'call_outbound' | 'call_inbound' | 'telegram_sent' | 'email_sent'
  | 'kb_flagged' | 'synthesis' | 'alert'
  | 'evening_briefing' | 'morning_briefing' | 'evening_briefing_error'
export type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom'
export type DeliveryChannel = 'telegram' | 'email' | 'voice'
export type DeliveryStatus = 'pending' | 'sent' | 'failed'
export type BuildStatus = 'building' | 'ready' | 'failed'

export interface Source {
  id: string
  name: string
  type: SourceType
  external_id: string | null
  is_active: boolean
  muted: boolean
  created_at: string
  auto_detected: boolean
  detected_at: string | null
  telegram_group_name: string | null
  telegram_group_id: number | null
}

export interface Message {
  id: string
  source_id: string | null
  sender_name: string | null
  message_text: string | null
  message_ts: string | null
  telegram_chat_id: string | null
  telegram_message_id: string | null
  language_code: string | null
  created_at: string
  status: MessageStatus
  unread: boolean
  ai_status: AiStatus
  topic_id: string | null
  topic_confidence: number | null
  context_id: string | null
  context_processed_at: string | null
}

export interface MessageContext {
  id: string
  source_id: string | null
  telegram_chat_id: string | null
  context_key: string | null
  started_at: string | null
  ended_at: string | null
  message_count: number
  primary_sender: string | null
  context_text: string | null
  context_preview: string | null
  build_status: BuildStatus
  ai_status: AiStatus
  summary: string | null
  department: string | null
  severity: AlertSeverity | null
  topic_id: string | null
  topic_name: string | null
  confidence: number | null
  needs_review: boolean
  alert_worthy: boolean
  recommended_action: string | null
  rationale: string | null
  entities_json: Record<string, unknown> | null
  analyzed_at: string | null
  created_at: string
  updated_at: string
  source?: Source
}

export interface TopicThread {
  id: string
  source_id: string | null
  topic_id: string | null
  title: string
  thread_date: string | null
  status: ThreadStatus
  started_at: string | null
  resolved_at: string | null
  resolution_summary: string | null
  context_ids: string[] | null
  message_count: number
  severity_peak: AlertSeverity | null
  department: string | null
  knowledge_base_entry_id: string | null
  kb_outcome_met: boolean | null
  kb_flagged: boolean
  synthesis_text: string | null
  created_at: string
  updated_at: string
}

export interface AiTopic {
  id: string
  name: string
  description: string | null
  keywords: string[] | null
  department: string | null
  is_active: boolean
  is_suggested: boolean
  suggested_reason: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeBaseEntry {
  id: string
  title: string
  situation_description: string | null
  trigger_keywords: string[] | null
  trigger_topic_ids: string[] | null
  expected_outcome: string | null
  expected_outcome_window_hours: number | null
  severity_if_unmet: AlertSeverity | null
  department: string | null
  is_active: boolean
  example_situation: string | null
  triggered_count: number
  met_count: number
  violated_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Alert {
  id: string
  context_id: string | null
  thread_id: string | null
  source_id: string | null
  topic_id: string | null
  kb_entry_id: string | null
  title: string
  description: string | null
  severity: AlertSeverity
  department: string | null
  status: AlertStatus
  is_kb_violation: boolean
  created_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  source?: Source
  knowledge_base_entry?: KnowledgeBaseEntry
}

export interface ToriActivityLog {
  id: string
  activity_type: ActivityType
  title: string
  description: string | null
  target_user: string | null
  status: string | null
  context_id: string | null
  thread_id: string | null
  alert_id: string | null
  created_at: string
}

export interface Report {
  id: string
  type: ReportType
  title: string
  date_from: string | null
  date_to: string | null
  content_json: Record<string, unknown> | null
  created_at: string
}

export interface ReportDelivery {
  id: string
  report_id: string | null
  channel: DeliveryChannel
  status: DeliveryStatus
  sent_at: string | null
  error_message: string | null
  created_at: string
}

export interface ToriSettings {
  id: string
  briefing_telegram_chat_id: string | null
  briefing_time: string
  briefing_enabled: boolean
  email_briefing_enabled: boolean
  briefing_email: string | null
  morning_enabled: boolean
  morning_time: string
  updated_at: string
}

export interface Briefing {
  id: string
  name: string
  description: string | null
  is_enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  weekly_day: number | null
  send_time: string
  timezone: string
  topics: string[]
  departments: string[]
  min_severity: string
  created_at: string
  updated_at: string
}

export interface BriefingRecipient {
  id: string
  briefing_id: string
  channel: 'telegram' | 'email'
  target: string
  label: string | null
  is_active: boolean
}

export interface BriefingHistory {
  id: string
  briefing_id: string | null
  sent_at: string
  status: 'success' | 'partial' | 'error'
  recipients_attempted: number
  recipients_succeeded: number
  message_preview: string | null
  error_message: string | null
  briefings?: { name: string } | null
}

export type BriefingWithRecipients = Briefing & { briefing_recipients: BriefingRecipient[] }

export interface DashboardStats {
  openSituations: number
  resolvedToday: number
  healthScore: number
  kbViolations: number
}
