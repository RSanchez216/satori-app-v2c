'use client'

import Link from 'next/link'
import { format, formatDistanceToNow, intervalToDuration } from 'date-fns'
import {
  MessageSquare, Clock, Bot, Eye, ArrowUpRight,
  CheckCircle2, Building2,
} from 'lucide-react'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { ResolutionTimeline } from '@/components/situations/ResolutionTimeline'
import { KBViolationBanner } from '@/components/situations/KBViolationBanner'
import type { AlertSeverity } from '@/types/database'

export interface SituationData {
  id: string
  title: string
  department: string | null
  severity_peak: AlertSeverity | null
  status: 'open' | 'resolved' | 'escalated' | 'unresolved' | 'pending'
  started_at: string | null
  resolved_at: string | null
  /** Legacy field — same as summary */
  synthesis_text: string | null
  summary?: string | null
  message_count: number
  kb_flagged: boolean
  kb_outcome_met: boolean | null
  kb_rule_name?: string | null
  kb_expected_outcome?: string | null
  kb_overdue_text?: string | null
  /** 0=Detected, 1=Tori Alerted, 2=Escalated, 3=Response, 4=Resolved */
  active_step?: number
  source_name?: string | null
  // Fields from context_inbox
  primary_sender?: string | null
  recommended_action?: string | null
  rationale?: string | null
  entities?: Record<string, unknown> | null
  context_text?: string | null
  context_preview?: string | null
  alert_worthy?: boolean
}

export function resolveTitle(s: SituationData): string {
  // 1. Dedicated title field only — never use summary/synthesis_text here
  if (s.title && s.title.trim() && s.title.trim() !== 'Unnamed Situation') return s.title.trim()

  // 2. context_preview truncated to ~60 chars
  if (s.context_preview?.trim()) {
    const p = s.context_preview.trim()
    return p.length > 60 ? p.slice(0, 60).trimEnd() + '…' : p
  }

  // 3. source name + date
  if (s.source_name) {
    const date = s.started_at ? ` · ${format(new Date(s.started_at), 'MMM d')}` : ''
    return `${s.source_name}${date}`
  }

  return 'Unnamed Situation'
}

const BORDER_COLOR: Record<string, string> = {
  critical:   'var(--severity-critical)',
  high:       'var(--severity-high)',
  kb:         'var(--kb-purple)',
  medium:     'var(--severity-medium)',
  low:        'var(--severity-low)',
  resolved:   'var(--border-default)',
  default:    'var(--border-default)',
}

const BG_TINT: Record<string, string> = {
  critical: 'rgba(248,81,73,0.03)',
  high:     'rgba(227,179,65,0.03)',
  kb:       'rgba(179,146,240,0.03)',
  default:  'transparent',
}

function cardStyle(s: SituationData): { border: string; bg: string } {
  if (s.kb_flagged && s.status !== 'resolved') {
    return { border: BORDER_COLOR.kb, bg: BG_TINT.kb }
  }
  if (s.severity_peak === 'critical') return { border: BORDER_COLOR.critical, bg: BG_TINT.critical }
  if (s.severity_peak === 'high')     return { border: BORDER_COLOR.high, bg: BG_TINT.high }
  if (s.status === 'resolved')        return { border: BORDER_COLOR.resolved, bg: BG_TINT.default }
  return { border: BORDER_COLOR.medium, bg: BG_TINT.default }
}

function durationText(startedAt: string | null, resolvedAt: string | null): string {
  if (!startedAt) return ''
  const end = resolvedAt ? new Date(resolvedAt) : new Date()
  const dur = intervalToDuration({ start: new Date(startedAt), end })
  if ((dur.days ?? 0) > 0) return `${dur.days}d ${dur.hours ?? 0}h`
  if ((dur.hours ?? 0) > 0) return `${dur.hours}h ${dur.minutes ?? 0}m`
  return `${dur.minutes ?? 0}m`
}

interface Props {
  situation: SituationData
  onEscalate?:    (id: string) => void
  onViewThread?:  (situation: SituationData) => void
}

export function SituationCard({ situation: s, onEscalate, onViewThread }: Props) {
  const style = cardStyle(s)
  const isResolved = s.status === 'resolved'
  const activeStep = s.active_step ?? (isResolved ? 4 : s.kb_flagged ? 2 : 1)

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200 group"
      style={{
        background: `linear-gradient(180deg, ${style.bg} 0%, var(--bg-card) 100%)`,
        border: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${style.border}`,
        opacity: isResolved ? 0.82 : 1,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 6px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)'
        el.style.borderColor = isResolved
          ? 'var(--border-default)'
          : s.kb_flagged
          ? 'rgba(179,146,240,0.5)'
          : 'var(--border-default)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = ''
        el.style.borderColor = ''
      }}
    >
      {/* ── Card header ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Left: severity + title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {s.severity_peak && (
                <SeverityBadge severity={s.severity_peak} />
              )}
              {s.kb_flagged && s.status !== 'resolved' && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide"
                  style={{ color: 'var(--kb-purple)', background: 'var(--kb-purple-dim)' }}
                >
                  KB Flagged
                </span>
              )}
              {isResolved && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                  style={{ color: 'var(--severity-low)', background: 'rgba(86,211,100,0.1)' }}
                >
                  <CheckCircle2 size={10} /> Resolved
                </span>
              )}
              {s.kb_outcome_met === true && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md"
                  style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
                >
                  KB Met ✓
                </span>
              )}
            </div>

            <h3
              className="text-[15px] font-bold leading-snug mb-1"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
            >
              {resolveTitle(s)}
            </h3>

            {/* Meta row */}
            <div className="flex items-center gap-3 flex-wrap">
              {s.department && (
                <span
                  className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Building2 size={10} />
                  {s.department}
                </span>
              )}
              {s.source_name && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  {s.source_name}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <Clock size={10} />
                {s.started_at
                  ? isResolved
                    ? formatDistanceToNow(new Date(s.started_at), { addSuffix: true })
                    : `Open ${durationText(s.started_at, null)}`
                  : '—'}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <MessageSquare size={10} />
                {s.message_count} msg{s.message_count !== 1 ? 's' : ''}
              </span>
              {isResolved && s.resolved_at && s.started_at && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: 'var(--severity-low)' }}
                >
                  Resolved in {durationText(s.started_at, s.resolved_at)}
                </span>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            {isResolved ? (
              <button
                className="btn-ghost text-[12px] py-1.5 px-3"
                onClick={() => onViewThread?.(s)}
              >
                <Eye size={12} />
                View Details
              </button>
            ) : (
              <>
                <button
                  className="btn-ghost text-[12px] py-1.5 px-3"
                  onClick={() => onViewThread?.(s)}
                >
                  <Eye size={12} />
                  View Thread
                </button>
                {s.kb_flagged ? (
                  <button
                    className="btn-purple text-[12px] py-1.5 px-3"
                    onClick={() => onEscalate?.(s.id)}
                  >
                    <ArrowUpRight size={12} />
                    Escalate
                  </button>
                ) : (
                  <Link href="/briefing">
                    <button className="btn-accent text-[12px] py-1.5 px-3">
                      <Bot size={12} />
                      Ask Tori
                    </button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Synthesis text ── */}
        {s.synthesis_text && (
          <p
            className="text-[13px] leading-relaxed mt-2.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {s.synthesis_text}
          </p>
        )}

        {/* ── KB Violation Banner ── */}
        {s.kb_flagged && s.kb_rule_name && s.status !== 'resolved' && (
          <div className="mt-3">
            <KBViolationBanner
              ruleName={s.kb_rule_name}
              expectedOutcome={s.kb_expected_outcome}
              overdueText={s.kb_overdue_text}
              onEscalate={() => onEscalate?.(s.id)}
            />
          </div>
        )}
      </div>

      {/* ── Resolution Timeline ── */}
      <div
        className="px-5 py-3 mt-1"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <div className="pb-5">
          <ResolutionTimeline activeStep={activeStep} />
        </div>
      </div>
    </div>
  )
}
