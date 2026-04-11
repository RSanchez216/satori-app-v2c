import type { SituationData } from '@/components/situations/SituationCard'
import type { AlertSeverity } from '@/types/database'

/** Three rich mock situations shown when the DB has no data yet */
export const MOCK_SITUATIONS: SituationData[] = [
  {
    id: 'mock-1',
    title: 'Driver Ramos — Engine Issue on I-55',
    department: 'Dispatch',
    severity_peak: 'critical' as AlertSeverity,
    status: 'open',
    started_at: new Date(Date.now() - 33 * 60 * 1000).toISOString(),
    resolved_at: null,
    synthesis_text:
      'Driver reported visible smoke from engine near mile marker 187. Pulled over safely. No dispatcher response for 33 minutes. Tori escalated to safety manager James at 9:12 AM.',
    message_count: 14,
    kb_flagged: false,
    kb_outcome_met: null,
    active_step: 2,
    source_name: 'Dispatch Telegram',
  },
  {
    id: 'mock-2',
    title: 'Greenline Freight — $3,200 Payment Overdue',
    department: 'Accounting',
    severity_peak: 'high' as AlertSeverity,
    status: 'open',
    started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: null,
    synthesis_text:
      'Broker payment 5 days late with no response to 3 follow-ups. Accounting was not looped in within the required 48-hour window, violating the Broker Payment Dispute KB rule.',
    message_count: 8,
    kb_flagged: true,
    kb_outcome_met: null,
    kb_rule_name: 'Broker Payment Dispute',
    kb_expected_outcome:
      'Accounting must be notified within 48 hours of a missed payment. Escalation to management if unresolved after 72 hours.',
    kb_overdue_text: 'Overdue by 3 days.',
    active_step: 2,
    source_name: 'Accounting Telegram',
  },
  {
    id: 'mock-3',
    title: 'Load #4821 — Detention Pay Dispute',
    department: 'Dispatch',
    severity_peak: 'medium' as AlertSeverity,
    status: 'resolved',
    started_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 4.2 * 60 * 60 * 1000).toISOString(),
    synthesis_text:
      'Broker refused detention pay for Load #4821. Dispatcher Maria sent timestamped proof of 3-hour delay. Broker approved $420 payment at 8:02 AM. Resolved in 48 minutes.',
    message_count: 22,
    kb_flagged: false,
    kb_outcome_met: true,
    active_step: 4,
    source_name: 'Dispatch Telegram',
  },
]
