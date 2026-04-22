'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, ToggleLeft, ToggleRight, Pencil, Trash2, ArrowRight, FlaskConical } from 'lucide-react'
import { format } from 'date-fns'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import type { KBRule } from '@/app/(main)/knowledge-base/knowledge-base-client'

interface Props {
  rule:           KBRule
  allRules:       KBRule[]
  onClose:        () => void
  onEdit:         (r: KBRule) => void
  onToggleActive: (r: KBRule) => void
  onDelete:       (ruleId: string) => void
  onViewRelated:  (ruleId: string) => void
}

export function RulePanel({ rule, allRules, onClose, onEdit, onToggleActive, onDelete, onViewRelated }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const escSteps = rule.escalation_path.split('→').map(s => s.trim()).filter(Boolean)
  const createdFmt = rule.created_at ? format(new Date(rule.created_at), 'MMM d, yyyy') : null
  const updatedFmt = rule.updated_at  ? format(new Date(rule.updated_at),  'MMM d, yyyy h:mm a') : null

  const relatedRules = (rule.related_rules ?? [])
    .map(id => allRules.find(r => r.rule_id === id))
    .filter(Boolean) as KBRule[]

  const isExternalUrl = rule.regulatory_source?.startsWith('http')

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
          width: 520,
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <SeverityBadge severity={rule.severity} />
                <span style={{
                  fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                  color: 'var(--text-muted)', letterSpacing: '0.04em',
                }}>
                  {rule.rule_id}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                  background: rule.is_active ? 'rgba(86,211,100,0.12)' : 'var(--bg-card)',
                  color: rule.is_active ? 'var(--severity-low)' : 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {rule.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {rule.title}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {rule.domain.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Description */}
          <PanelSection title="Description">
            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
              {rule.description}
            </p>
          </PanelSection>

          {/* Detection Signals */}
          {(rule.detection_signals?.length ?? 0) > 0 && (
            <PanelSection title="Detection Signals">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {rule.detection_signals!.map((sig, i) => (
                  <span key={i} style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                    background: 'var(--bg-card)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    {sig}
                  </span>
                ))}
              </div>
            </PanelSection>
          )}

          {/* Violation Criteria */}
          <PanelSection title="Violation Criteria">
            <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)', margin: 0 }}>
              {rule.violation_criteria}
            </p>
          </PanelSection>

          {/* Recommended Action */}
          <PanelSection title="Recommended Action" accent>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>
              {rule.recommended_action}
            </p>
          </PanelSection>

          {/* Escalation Path */}
          <PanelSection title="Escalation Path">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {escSteps.map((step, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: 'var(--bg-card)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                  }}>
                    {step}
                  </span>
                  {i < escSteps.length - 1 && (
                    <ArrowRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                </span>
              ))}
            </div>
          </PanelSection>

          {/* Regulatory Source */}
          {rule.regulatory_source && (
            <PanelSection title="Regulatory Source">
              {isExternalUrl ? (
                <a
                  href={rule.regulatory_source}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                >
                  {rule.regulatory_source}
                  <ExternalLink size={11} />
                </a>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace', margin: 0, lineHeight: 1.6 }}>
                  {rule.regulatory_source}
                </p>
              )}
            </PanelSection>
          )}

          {/* Related Rules */}
          {relatedRules.length > 0 && (
            <PanelSection title={`Related Rules (${relatedRules.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {relatedRules.map(r => (
                  <button
                    key={r.rule_id}
                    onClick={() => onViewRelated(r.rule_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: 'var(--bg-card)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
                  >
                    <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{r.rule_id}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>·</span>
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  </button>
                ))}
                {/* IDs with no matching rule */}
                {(rule.related_rules ?? [])
                  .filter(id => !allRules.find(r => r.rule_id === id))
                  .map(id => (
                    <span key={id} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
                      background: 'var(--bg-card)', color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}>
                      {id}
                    </span>
                  ))
                }
              </div>
            </PanelSection>
          )}

          {/* Audit info */}
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', paddingTop: 4 }}>
            {createdFmt && <span>Created {createdFmt}</span>}
            {updatedFmt && <span>Updated {updatedFmt}</span>}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => onEdit(rule)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--accent-dim)', color: 'var(--accent)',
              border: '1px solid rgba(var(--accent-rgb),0.25)', cursor: 'pointer',
            }}
          >
            <Pencil size={12} /> Edit Rule
          </button>

          <button
            onClick={() => onToggleActive(rule)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
              color: rule.is_active ? 'var(--severity-high)' : 'var(--severity-low)',
            }}
          >
            {rule.is_active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
            {rule.is_active ? 'Deactivate' : 'Activate'}
          </button>

          <button
            title="Test Rule (coming soon)"
            disabled
            style={{
              width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '7px 0', borderRadius: 8, fontSize: 12,
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', cursor: 'not-allowed', opacity: 0.5,
            }}
          >
            <FlaskConical size={13} />
          </button>

          <button
            onClick={() => onDelete(rule.rule_id)}
            style={{
              width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '7px 0', borderRadius: 8, fontSize: 12,
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--severity-critical)', cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,81,73,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(248,81,73,0.3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)' }}
          >
            <Trash2 size={13} />
          </button>

          <button
            onClick={onClose}
            style={{
              width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '7px 0', borderRadius: 8, fontSize: 12,
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* ── Section helper ─────────────────────────────────────────────────────── */

function PanelSection({ title, accent, children }: {
  title:    string
  accent?:  boolean
  children: React.ReactNode
}) {
  const borderColor = accent ? 'var(--accent)' : 'var(--border-subtle)'
  const bg          = accent ? 'rgba(62,207,207,0.04)' : 'var(--bg-card)'

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${borderColor}`, background: bg }}>
      <div style={{
        padding: '7px 14px 6px',
        borderBottom: `1px solid ${borderColor}`,
        display: 'flex', alignItems: 'center',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
          color: accent ? 'var(--accent)' : 'var(--text-muted)',
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '10px 14px' }}>{children}</div>
    </div>
  )
}
