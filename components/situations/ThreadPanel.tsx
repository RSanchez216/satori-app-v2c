'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Clock, MessageSquare, User, MapPin, Truck, Package, Bot, ArrowUpRight, ShieldAlert, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { createClient } from '@/lib/supabase/client'
import { resolveTitle } from './SituationCard'
import type { SituationData } from './SituationCard'

interface KBViolationRow {
  rule_id:         string
  matched_signals: string[]
  rationale:       string | null
  knowledge_base_rules: {
    title:    string
    severity: string
  } | null
}

interface Props {
  situation: SituationData
  onClose:   () => void
}

export function ThreadPanel({ situation: s, onClose }: Props) {
  const [kbViolations, setKbViolations] = useState<KBViolationRow[] | null>(null)
  const [kbLoading,    setKbLoading]    = useState(true)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch KB violations for this context
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('kb_violations')
      .select('rule_id, matched_signals, rationale, knowledge_base_rules(title, severity)')
      .eq('context_id', s.id)
      .then(({ data }) => {
        setKbViolations((data as unknown as KBViolationRow[]) ?? [])
        setKbLoading(false)
      })
  }, [s.id])

  const entities = s.entities ?? {}
  const entityEntries = Object.entries(entities).filter(([, v]) => v !== null && v !== undefined && v !== '')

  const startedFmt  = s.started_at  ? format(new Date(s.started_at),  'MMM d, yyyy h:mm a') : null
  const endedFmt    = s.resolved_at ? format(new Date(s.resolved_at), 'MMM d, yyyy h:mm a') : null

  // Icon map for common entity keys
  const entityIcon = (key: string) => {
    const k = key.toLowerCase()
    if (k.includes('driver') || k.includes('user') || k.includes('sender')) return <User size={11} />
    if (k.includes('unit') || k.includes('truck') || k.includes('vehicle')) return <Truck size={11} />
    if (k.includes('load') || k.includes('shipment') || k.includes('order')) return <Package size={11} />
    if (k.includes('location') || k.includes('address') || k.includes('city')) return <MapPin size={11} />
    return null
  }

  // Format context_text as readable lines
  const lines = (s.context_text ?? s.context_preview ?? '').split('\n').filter(Boolean)

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col"
        style={{
          width: 480,
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {s.severity_peak && <SeverityBadge severity={s.severity_peak} />}
                {s.kb_flagged && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, color: 'var(--kb-purple)', background: 'var(--kb-purple-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    KB Flagged
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{resolveTitle(s)}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {s.department && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.department}</span>
                )}
                {s.source_name && (
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{s.source_name}</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <MessageSquare size={10} /> {s.message_count} messages
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>

          {/* Timestamp range */}
          {startedFmt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
              <Clock size={11} />
              <span>Started {startedFmt}</span>
              {endedFmt && <><span>→</span><span style={{ color: 'var(--severity-low)' }}>Resolved {endedFmt}</span></>}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Entities */}
          <Section title="Detected Entities">
            {entityEntries.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {entityEntries.map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', fontSize: 11 }}>
                    <span style={{ color: 'var(--accent)', display: 'flex' }}>{entityIcon(key)}</span>
                    <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(val)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Placeholder />
            )}
          </Section>

          {/* AI Summary */}
          {(s.synthesis_text || s.summary) && (
            <Section title="AI Summary" icon={<Bot size={12} style={{ color: 'var(--accent)' }} />}>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {s.synthesis_text ?? s.summary}
              </p>
            </Section>
          )}

          {/* Recommended Action */}
          <Section title="Recommended Action" accent>
            {s.recommended_action ? (
              <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 500 }}>
                {s.recommended_action}
              </p>
            ) : (
              <Placeholder />
            )}
          </Section>

          {/* Rationale */}
          <Section title="Tori's Rationale">
            {s.rationale ? (
              <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                {s.rationale}
              </p>
            ) : (
              <Placeholder />
            )}
          </Section>

          {/* KB Violations (new table) */}
          {(kbLoading || (kbViolations && kbViolations.length > 0)) && (
            <Section
              title={kbLoading ? 'KB Violations' : `KB Violations (${kbViolations!.length})`}
              icon={<ShieldAlert size={11} style={{ color: 'var(--severity-critical)' }} />}
              danger
            >
              {kbLoading ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
                </span>
              ) : (kbViolations ?? []).map(v => (
                <div key={v.rule_id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(179,146,240,0.12)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                    <a
                      href={`/knowledge-base?rule_id=${v.rule_id}`}
                      style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: 'var(--kb-purple)', textDecoration: 'none' }}
                    >
                      {v.rule_id}
                    </a>
                    {v.knowledge_base_rules?.title && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{v.knowledge_base_rules.title}</span>
                    )}
                    {v.knowledge_base_rules?.severity && (
                      <SeverityBadge severity={v.knowledge_base_rules.severity as 'critical' | 'high' | 'medium' | 'low'} />
                    )}
                  </div>
                  {(v.matched_signals ?? []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                      {v.matched_signals.map((sig, i) => (
                        <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                          {sig}
                        </span>
                      ))}
                    </div>
                  )}
                  {v.rationale && (
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>{v.rationale}</p>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Thread / Message Log */}
          <Section title="Message Thread">
            {lines.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {lines.map((line, i) => {
                  const isHeader = /^\[|\d{1,2}:\d{2}/.test(line) || line.startsWith('---')
                  return (
                    <div
                      key={i}
                      style={{
                        fontSize: isHeader ? 10 : 12,
                        color: isHeader ? 'var(--text-muted)' : 'var(--text-secondary)',
                        fontWeight: isHeader ? 700 : 400,
                        fontFamily: isHeader ? undefined : 'inherit',
                        padding: isHeader ? '6px 0 2px' : '2px 0',
                        borderTop: isHeader && i > 0 ? '1px solid var(--border-subtle)' : 'none',
                        letterSpacing: isHeader ? '0.04em' : 0,
                        textTransform: isHeader ? 'uppercase' : 'none',
                        lineHeight: 1.5,
                      }}
                    >
                      {line}
                    </div>
                  )
                })}
              </div>
            ) : (
              <Placeholder text="Full thread not yet available for this context." />
            )}
          </Section>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexShrink: 0 }}>
          {s.kb_flagged && (
            <button
              className="btn-purple text-[12px] py-1.5"
              style={{ flex: 1 }}
            >
              <ArrowUpRight size={12} /> Escalate
            </button>
          )}
          <a href="/briefing" style={{ flex: 1 }}>
            <button className="btn-accent text-[12px] py-1.5 w-full">
              <Bot size={12} /> Ask Tori
            </button>
          </a>
          <button className="btn-ghost text-[12px] py-1.5" onClick={onClose} style={{ flex: 1 }}>
            Close
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* ── Section helper ─────────────────────────────────────────────────────── */
function Section({ title, icon, accent, danger, children }: {
  title: string
  icon?: React.ReactNode
  accent?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  const borderColor = danger ? 'var(--kb-purple)' : accent ? 'var(--accent)' : 'var(--border-subtle)'
  const bg          = danger ? 'rgba(179,146,240,0.06)' : accent ? 'rgba(62,207,207,0.04)' : 'var(--bg-card)'

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${borderColor}`, background: bg }}>
      <div style={{ padding: '8px 14px 6px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, color: danger ? 'var(--kb-purple)' : accent ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '10px 14px' }}>{children}</div>
    </div>
  )
}

function Placeholder({ text = 'No data available.' }: { text?: string }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>{text}</p>
  )
}
