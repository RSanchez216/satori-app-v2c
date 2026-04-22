'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen } from 'lucide-react'

interface Props { onClose: () => void }

export function HelpDrawer({ onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(1px)' }} onClick={onClose} />

      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col"
        style={{
          width: 440,
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-dim)', border: '1px solid rgba(var(--accent-rgb),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Knowledge Base Guide</h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>How Tori uses rules to enforce your operations</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            <Section title="What is the Knowledge Base?">
              <p>The Knowledge Base is a library of operational rules that Tori uses to evaluate every message it processes in real time. When a conversation matches a rule's detection signals and violation criteria, Tori flags it as a situation, assigns the configured severity, and surfaces the recommended action to the right team.</p>
              <p style={{ marginTop: 8 }}>Rules are organized by domain (e.g. FMCSA &amp; DOT Compliance, Driver Management, Dispatch Operations) and are applied continuously across all connected Telegram groups, email inboxes, and voice channels.</p>
            </Section>

            <Section title="Active vs Inactive Rules">
              <ul>
                <li><strong style={{ color: 'var(--severity-low)' }}>Active</strong> — Tori evaluates this rule against every incoming message. Detection signals are checked first for speed, then the full violation criteria is applied.</li>
                <li style={{ marginTop: 6 }}><strong style={{ color: 'var(--text-muted)' }}>Inactive</strong> — The rule is stored in the Knowledge Base but skipped during analysis. Use this to temporarily pause enforcement without losing the rule. Reactivation is instant.</li>
              </ul>
            </Section>

            <Section title="Severity Levels">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SeverityRow color="var(--severity-critical)" label="Critical" desc="Immediate safety or legal risk. Tori always surfaces these with a red flag and highest escalation priority. Examples: HOS violations, unlicensed drivers, dangerous cargo mishandling." />
                <SeverityRow color="var(--severity-high)"     label="High"     desc="Significant compliance or operational risk requiring prompt action. Examples: late check-ins, load discrepancies, ELD malfunctions." />
                <SeverityRow color="var(--severity-medium)"   label="Medium"   desc="Process deviations that should be addressed but aren't immediately dangerous. Examples: missing documentation, communication delays." />
                <SeverityRow color="var(--severity-low)"      label="Low"      desc="Minor policy reminders or best-practice guidance. Examples: pre-trip checklist reminders, fuel receipt requests." />
              </div>
            </Section>

            <Section title="Writing a Good Rule">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Tip label="Detection Signals">
                  Short phrases or keywords that indicate the rule might apply. Use natural language — the way drivers and dispatchers actually speak ("out of hours", "no break", "can I push it", "stuck at dock"). More signals means better recall. Tori uses these for fast initial screening before evaluating the full criteria.
                </Tip>
                <Tip label="Violation Criteria">
                  The precise condition that constitutes a violation. Be specific and unambiguous — this is what Tori uses to decide whether to flag. Avoid vague language. Good: "Cumulative driving time exceeds 11 hours without a 10-hour rest." Bad: "Driver is tired."
                </Tip>
                <Tip label="Escalation Path">
                  Who gets notified when the rule fires, in order. Chain departments with →: <code style={{ fontSize: 11, background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>dispatch → safety → operations</code>. Each step is notified in sequence based on response time.
                </Tip>
                <Tip label="Recommended Action">
                  What Tori should tell the dispatcher or safety manager to do. Keep it specific and actionable — "Route driver to nearest truck stop and log stop location" is better than "Handle it."
                </Tip>
              </div>
            </Section>

            <Section title="Test Rule (Coming Soon)">
              <p>The Test Rule feature will let you run any rule against your last 100 processed messages to preview which ones would have triggered it — without affecting your live inbox or creating any alerts. This makes it easy to tune detection signals and violation criteria before activating a new rule.</p>
            </Section>

            <Section title="Bulk Import">
              <p>Use the <strong style={{ color: 'var(--text-primary)' }}>Import Rules</strong> button to upload a <code style={{ fontSize: 11, background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>.json</code> or <code style={{ fontSize: 11, background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>.csv</code> file containing multiple rules at once.</p>
              <p style={{ marginTop: 6 }}>Each rule must include: <strong style={{ color: 'var(--text-secondary)' }}>rule_id, title, domain, severity, description, violation_criteria, recommended_action,</strong> and <strong style={{ color: 'var(--text-secondary)' }}>escalation_path</strong>. Download the JSON template from the import modal for the exact expected format.</p>
              <p style={{ marginTop: 6 }}>Rules with <strong>duplicate rule_ids</strong> already in the database are skipped to protect existing rules. Use the Edit button to update existing rules individually.</p>
            </Section>

          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        {title}
      </h3>
      <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </div>
  )
}

function SeverityRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, marginTop: 2,
        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        color, background: `${color}18`,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</span>
    </div>
  )
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', overflow: 'hidden' }}>
      <div style={{ padding: '5px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{children}</div>
    </div>
  )
}
