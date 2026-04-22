'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus } from 'lucide-react'
import type { KBRule } from '@/app/(main)/knowledge-base/knowledge-base-client'
import type { AlertSeverity } from '@/types/database'

interface Props {
  rule:       KBRule | null   // null = new rule
  allDomains: string[]
  allRuleIds: string[]
  onSave:     (data: Partial<KBRule>) => Promise<unknown>
  onClose:    () => void
}

const SEVERITIES: AlertSeverity[] = ['critical', 'high', 'medium', 'low']

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: 'var(--severity-critical)',
  high:     'var(--severity-high)',
  medium:   'var(--severity-medium)',
  low:      'var(--severity-low)',
}

const DOMAIN_DISPLAY: Record<string, string> = {
  fmcsa_dot_compliance:  'FMCSA & DOT Compliance',
  driver_management:     'Driver Management',
  load_operations:       'Load Operations',
  safety_compliance:     'Safety & Compliance',
  vehicle_maintenance:   'Vehicle Maintenance',
  financial_operations:  'Financial Operations',
  hr_personnel:          'HR & Personnel',
  claims_insurance:      'Claims & Insurance',
  dispatch_operations:   'Dispatch Operations',
  customer_relations:    'Customer Relations',
  customer_service:      'Customer Service',
}

function formatDomain(d: string) {
  return DOMAIN_DISPLAY[d] ?? d.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function RuleModal({ rule, allDomains, allRuleIds, onSave, onClose }: Props) {
  const isNew = rule === null

  const [ruleId,          setRuleId]          = useState(rule?.rule_id ?? '')
  const [title,           setTitle]           = useState(rule?.title ?? '')
  const [domain,          setDomain]          = useState(rule?.domain ?? allDomains[0] ?? '')
  const [severity,        setSeverity]        = useState<AlertSeverity>(rule?.severity ?? 'medium')
  const [description,     setDescription]     = useState(rule?.description ?? '')
  const [detectionSigs,   setDetectionSigs]   = useState<string[]>(rule?.detection_signals ?? [])
  const [violationCrit,   setViolationCrit]   = useState(rule?.violation_criteria ?? '')
  const [regSource,       setRegSource]       = useState(rule?.regulatory_source ?? '')
  const [recAction,       setRecAction]       = useState(rule?.recommended_action ?? '')
  const [escalationPath,  setEscalationPath]  = useState(rule?.escalation_path ?? '')
  const [relatedRules,    setRelatedRules]    = useState<string[]>(rule?.related_rules ?? [])
  const [isActive,        setIsActive]        = useState(rule?.is_active ?? true)
  const [saving,          setSaving]          = useState(false)
  const [errors,          setErrors]          = useState<Record<string, string>>({})

  /* Close on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function validate() {
    const errs: Record<string, string> = {}
    if (!ruleId.trim())         errs.ruleId         = 'Required'
    if (!title.trim())          errs.title          = 'Required'
    if (!domain)                errs.domain         = 'Required'
    if (!description.trim())    errs.description    = 'Required'
    if (!violationCrit.trim())  errs.violationCrit  = 'Required'
    if (!recAction.trim())      errs.recAction      = 'Required'
    if (!escalationPath.trim()) errs.escalationPath = 'Required'
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSaving(true)
    const err = await onSave({
      rule_id:            ruleId.trim().toUpperCase(),
      title:              title.trim(),
      domain,
      severity,
      description:        description.trim(),
      detection_signals:  detectionSigs,
      violation_criteria: violationCrit.trim(),
      regulatory_source:  regSource.trim() || null,
      recommended_action: recAction.trim(),
      escalation_path:    escalationPath.trim(),
      related_rules:      relatedRules,
      is_active:          isActive,
      is_template:        rule?.is_template ?? false,
    })
    setSaving(false)
    if (err) console.error(err)
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50"
        style={{
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 620, maxHeight: '88vh',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {isNew ? 'New Rule' : 'Edit Rule'}
            </h2>
            {!isNew && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{rule!.rule_id}</p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Row: Rule ID + Active toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Rule ID" error={errors.ruleId} required>
              <input
                value={ruleId}
                onChange={e => setRuleId(e.target.value)}
                placeholder="HOS-001"
                readOnly={!isNew}
                style={{
                  ...inputStyle,
                  fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em',
                  opacity: !isNew ? 0.6 : 1, cursor: !isNew ? 'default' : 'text',
                }}
              />
            </Field>
            <Field label="Status">
              <button
                type="button"
                onClick={() => setIsActive(v => !v)}
                style={{
                  ...inputStyle,
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  color: isActive ? 'var(--severity-low)' : 'var(--text-muted)',
                  background: isActive ? 'rgba(86,211,100,0.06)' : 'var(--bg-surface)',
                  borderColor: isActive ? 'rgba(86,211,100,0.3)' : 'var(--border-default)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? 'var(--severity-low)' : 'var(--text-muted)', flexShrink: 0 }} />
                {isActive ? 'Active' : 'Inactive'}
              </button>
            </Field>
          </div>

          {/* Title */}
          <Field label="Title" error={errors.title} required>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 11-Hour Driving Limit Exceeded"
              style={inputStyle}
            />
          </Field>

          {/* Row: Domain + Severity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Domain" error={errors.domain} required>
              <select
                value={domain}
                onChange={e => setDomain(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
              >
                {allDomains.map(d => (
                  <option key={d} value={d}>{formatDomain(d)}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity" required>
              <div style={{ display: 'flex', gap: 4 }}>
                {SEVERITIES.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    style={{
                      flex: 1, padding: '6px 4px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', border: 'none', textTransform: 'capitalize',
                      background: severity === s ? `${SEVERITY_COLOR[s]}20` : 'var(--bg-surface)',
                      color: severity === s ? SEVERITY_COLOR[s] : 'var(--text-muted)',
                      outline: severity === s ? `1.5px solid ${SEVERITY_COLOR[s]}` : '1.5px solid var(--border-subtle)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Description */}
          <Field label="Description" error={errors.description} required>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Plain-language explanation of the rule and why it matters…"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
            />
          </Field>

          {/* Detection Signals */}
          <Field label="Detection Signals" hint="Press Enter or comma to add">
            <TagInput values={detectionSigs} onChange={setDetectionSigs} placeholder="e.g. 11 hours, out of hours…" />
          </Field>

          {/* Violation Criteria */}
          <Field label="Violation Criteria" error={errors.violationCrit} required>
            <textarea
              value={violationCrit}
              onChange={e => setViolationCrit(e.target.value)}
              rows={2}
              placeholder="Precise condition that constitutes a violation…"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />
          </Field>

          {/* Recommended Action */}
          <Field label="Recommended Action" error={errors.recAction} required>
            <textarea
              value={recAction}
              onChange={e => setRecAction(e.target.value)}
              rows={2}
              placeholder="What Tori should recommend when this rule is violated…"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />
          </Field>

          {/* Row: Regulatory Source + Escalation Path */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Regulatory Source" hint="CFR citation or URL">
              <input
                value={regSource}
                onChange={e => setRegSource(e.target.value)}
                placeholder="49 CFR §395.3(a)(3)(i)"
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              />
            </Field>
            <Field label="Escalation Path" error={errors.escalationPath} required hint="Separated by →">
              <input
                value={escalationPath}
                onChange={e => setEscalationPath(e.target.value)}
                placeholder="dispatch → safety → operations"
                style={inputStyle}
              />
            </Field>
          </div>

          {/* Related Rules */}
          <Field label="Related Rules" hint="Press Enter or comma to add rule IDs">
            <TagInput
              values={relatedRules}
              onChange={setRelatedRules}
              placeholder="e.g. HOS-002, ELD-001…"
              suggestions={allRuleIds.filter(id => id !== ruleId)}
            />
          </Field>
        </form>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
            disabled={saving}
            style={{
              flex: 2, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: saving ? 'var(--accent-dim)' : 'var(--accent)',
              color: saving ? 'var(--accent)' : 'var(--bg-base)',
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? 'Saving…' : isNew ? <><Plus size={13} /> Create Rule</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* ── Field wrapper ──────────────────────────────────────────────────────── */

function Field({ label, hint, error, required, children }: {
  label:    string
  hint?:    string
  error?:   string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
          {required && <span style={{ color: 'var(--severity-critical)', marginLeft: 3 }}>*</span>}
        </label>
        {hint && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hint}</span>}
      </div>
      {children}
      {error && <span style={{ fontSize: 11, color: 'var(--severity-critical)' }}>{error}</span>}
    </div>
  )
}

/* ── Tag input ──────────────────────────────────────────────────────────── */

function TagInput({ values, onChange, placeholder, suggestions }: {
  values:       string[]
  onChange:     (v: string[]) => void
  placeholder:  string
  suggestions?: string[]
}) {
  const [inputVal, setInputVal] = useState('')
  const [showSugg, setShowSugg] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredSugg = suggestions
    ? suggestions
        .filter(s => s.toLowerCase().includes(inputVal.toLowerCase()) && !values.includes(s))
        .slice(0, 8)
    : []

  function addTag(val: string) {
    const trimmed = val.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInputVal('')
    setShowSugg(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          border: '1px solid var(--border-default)', borderRadius: 8,
          padding: '6px 10px', background: 'var(--bg-surface)',
          display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
          minHeight: 40, cursor: 'text',
        }}
      >
        {values.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
            background: 'var(--accent-dim)', color: 'var(--accent)',
            border: '1px solid rgba(var(--accent-rgb),0.2)',
          }}>
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter(x => x !== v))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, display: 'flex', lineHeight: 1 }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setShowSugg(true) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (inputVal.trim()) addTag(inputVal) }
            if (e.key === 'Backspace' && !inputVal && values.length > 0) onChange(values.slice(0, -1))
          }}
          onBlur={() => { if (inputVal.trim()) addTag(inputVal); setTimeout(() => setShowSugg(false), 150) }}
          onFocus={() => { if (inputVal) setShowSugg(true) }}
          placeholder={values.length === 0 ? placeholder : ''}
          style={{
            flex: 1, minWidth: 100, background: 'transparent', border: 'none',
            outline: 'none', fontSize: 12, color: 'var(--text-primary)',
          }}
        />
      </div>

      {showSugg && filteredSugg.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 2,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 8, overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
        }}>
          {filteredSugg.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => addTag(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '6px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12,
                background: 'transparent', color: 'var(--text-secondary)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Shared input style ─────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
  background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}
