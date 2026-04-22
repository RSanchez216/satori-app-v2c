'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, FileJson, ClipboardPaste, CheckCircle2, AlertCircle, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import type { KBRule } from '@/app/(main)/knowledge-base/knowledge-base-client'
import type { AlertSeverity } from '@/types/database'

const REQUIRED_FIELDS = [
  'rule_id', 'title', 'domain', 'severity', 'description',
  'violation_criteria', 'recommended_action', 'escalation_path',
] as const

const VALID_SEVERITIES: AlertSeverity[] = ['low', 'medium', 'high', 'critical']

interface ParsedRow {
  raw:        Partial<KBRule>
  errors:     string[]
  isDuplicate: boolean
}

interface Props {
  existingRuleIds: Set<string>
  onClose:         () => void
  onImported:      (rules: KBRule[]) => void
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string') {
    if (v.trim().startsWith('[')) {
      try { return JSON.parse(v) } catch { /* fallthrough */ }
    }
    return v.split('|').map(s => s.trim()).filter(Boolean)
  }
  return []
}

function normalizeRow(raw: Record<string, unknown>): Partial<KBRule> {
  return {
    rule_id:            String(raw.rule_id ?? '').trim().toUpperCase(),
    title:              String(raw.title ?? '').trim(),
    domain:             String(raw.domain ?? '').trim(),
    severity:           String(raw.severity ?? '').trim().toLowerCase() as AlertSeverity,
    description:        String(raw.description ?? '').trim(),
    detection_signals:  toArr(raw.detection_signals),
    violation_criteria: String(raw.violation_criteria ?? '').trim(),
    regulatory_source:  String(raw.regulatory_source ?? '').trim() || null,
    recommended_action: String(raw.recommended_action ?? '').trim(),
    escalation_path:    String(raw.escalation_path ?? '').trim(),
    related_rules:      toArr(raw.related_rules),
    is_template:        Boolean(raw.is_template ?? false),
    is_active:          raw.is_active !== false && raw.is_active !== 'false',
  }
}

function validateRow(r: Partial<KBRule>): string[] {
  const errs: string[] = []
  for (const f of REQUIRED_FIELDS) {
    if (!r[f]) errs.push(`Missing ${f}`)
  }
  if (r.severity && !VALID_SEVERITIES.includes(r.severity)) {
    errs.push(`Invalid severity "${r.severity}"`)
  }
  return errs
}

function parseJSON(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array at the top level')
  return parsed
}

function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0])
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = splitCSVLine(line)
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim() ?? '' })
      return obj
    })
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ && line[i + 1] === '"' ? (cur += '"', i++) : (inQ = !inQ) }
    else if (c === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += c
  }
  result.push(cur)
  return result
}

function downloadTemplate() {
  const tpl = [
    {
      rule_id: 'CUSTOM-001', title: 'Example Critical Rule', domain: 'dispatch_operations',
      severity: 'critical', description: 'Describe what this rule monitors and why it matters.',
      detection_signals: ['trigger phrase', 'another signal'],
      violation_criteria: 'The exact condition that constitutes a violation.',
      regulatory_source: '49 CFR §000 or internal SOP reference',
      recommended_action: 'Actionable instruction for dispatch when this fires.',
      escalation_path: 'dispatch → safety', related_rules: [],
    },
    {
      rule_id: 'CUSTOM-002', title: 'Example High Rule', domain: 'driver_management',
      severity: 'high', description: 'Another example — replace all fields with your actual content.',
      detection_signals: ['keyword one', 'phrase two'],
      violation_criteria: 'Precise condition for the second rule.',
      regulatory_source: null,
      recommended_action: 'Recommended response for this situation.',
      escalation_path: 'dispatch → safety → operations', related_rules: ['CUSTOM-001'],
    },
    {
      rule_id: 'CUSTOM-003', title: 'Example Medium Rule', domain: 'safety_compliance',
      severity: 'medium', description: 'A medium-severity example covering a process deviation.',
      detection_signals: ['warning signal'],
      violation_criteria: 'Condition that triggers this medium rule.',
      regulatory_source: null,
      recommended_action: 'Corrective action for this deviation.',
      escalation_path: 'dispatch', related_rules: [],
    },
  ]
  const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'kb-rules-template.json'; a.click()
  URL.revokeObjectURL(url)
}

/* ── Main component ─────────────────────────────────────────────────────── */

export function ImportRulesModal({ existingRuleIds, onClose, onImported }: Props) {
  const [tab,      setTab]      = useState<'file' | 'paste'>('file')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [pasteText,setPasteText]= useState('')
  const [rows,     setRows]     = useState<ParsedRow[] | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [importing,setImporting]= useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function processRaw(raws: Record<string, unknown>[]) {
    const seen = new Set<string>()
    const parsed: ParsedRow[] = raws.map(raw => {
      const normalized = normalizeRow(raw)
      const errors     = validateRow(normalized)
      const rid        = normalized.rule_id ?? ''
      const isDuplicate = existingRuleIds.has(rid) || seen.has(rid)
      if (rid) seen.add(rid)
      return { raw: normalized, errors, isDuplicate }
    })
    setRows(parsed)
    setParseErr(null)
  }

  function processText(text: string, ext: string) {
    try {
      const raws = ext === 'csv' ? parseCSV(text) : parseJSON(text)
      if (raws.length === 0) { setParseErr('No rows found in file.'); setRows(null); return }
      processRaw(raws)
    } catch (e) {
      setParseErr(`Parse error: ${e instanceof Error ? e.message : 'Unknown'}`)
      setRows(null)
    }
  }

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'json'
    setFileName(file.name)
    setRows(null); setParseErr(null)
    const reader = new FileReader()
    reader.onload = e => processText(String(e.target?.result ?? ''), ext)
    reader.readAsText(file)
  }, [existingRuleIds]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePasteParse() {
    if (!pasteText.trim()) return
    processText(pasteText.trim(), 'json')
  }

  async function handleImport() {
    if (!rows) return
    const valid  = rows.filter(r => r.errors.length === 0 && !r.isDuplicate)
    const errors = rows.filter(r => r.errors.length > 0)
    const dupes  = rows.filter(r => r.isDuplicate && r.errors.length === 0)

    if (valid.length === 0) {
      toast.error('No valid new rules to import.')
      return
    }

    setImporting(true)
    const supabase = createClient()
    const toInsert = valid.map(r => r.raw)

    const { data, error } = await supabase
      .from('knowledge_base_rules')
      .insert(toInsert)
      .select()

    setImporting(false)

    if (error) {
      toast.error(`Import failed: ${error.message}`)
      return
    }

    const parts: string[] = [`Imported ${valid.length} rule${valid.length !== 1 ? 's' : ''}`]
    if (dupes.length > 0)  parts.push(`skipped ${dupes.length} duplicate${dupes.length !== 1 ? 's' : ''}`)
    if (errors.length > 0) parts.push(`${errors.length} error${errors.length !== 1 ? 's' : ''}`)

    toast.success(parts.join(' · '))
    if (data) onImported(data as KBRule[])
    onClose()
  }

  const validCount = rows?.filter(r => r.errors.length === 0 && !r.isDuplicate).length ?? 0
  const dupeCount  = rows?.filter(r => r.isDuplicate && r.errors.length === 0).length ?? 0
  const errCount   = rows?.filter(r => r.errors.length > 0).length ?? 0
  const preview    = rows?.slice(0, 5) ?? []

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }} onClick={onClose} />

      <div
        className="fixed z-50"
        style={{
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 680, maxHeight: '88vh',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Import Rules</h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Upload a .json or .csv file, or paste a JSON array of rule objects</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              <Download size={12} /> Download Template
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {([['file', FileJson, 'Upload File'], ['paste', ClipboardPaste, 'Paste JSON']] as const).map(([t, Icon, label]) => (
            <button
              key={t}
              onClick={() => { setTab(t); setRows(null); setParseErr(null); setFileName(null) }}
              style={{
                flex: 1, padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--accent-dim)' : 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Upload File tab ── */}
          {tab === 'file' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault(); setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-default)'}`,
                borderRadius: 12, padding: '36px 20px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                background: dragging ? 'var(--accent-dim)' : 'var(--bg-surface)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <Upload size={24} style={{ color: dragging ? 'var(--accent)' : 'var(--text-muted)' }} />
              {fileName ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{fileName}</span>
              ) : (
                <>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Drop a .json or .csv file here
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>or click to browse</span>
                </>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".json,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          {/* ── Paste JSON tab ── */}
          {tab === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={pasteText}
                onChange={e => { setPasteText(e.target.value); setRows(null); setParseErr(null) }}
                placeholder={'[\n  {\n    "rule_id": "CUSTOM-001",\n    "title": "...",\n    ...\n  }\n]'}
                style={{
                  width: '100%', height: 160, padding: '10px 12px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                  borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', outline: 'none',
                  fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handlePasteParse}
                disabled={!pasteText.trim()}
                style={{
                  alignSelf: 'flex-end', padding: '6px 16px', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: pasteText.trim() ? 'var(--accent-dim)' : 'var(--bg-card)',
                  color: pasteText.trim() ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                Parse JSON
              </button>
            </div>
          )}

          {/* ── Parse error ── */}
          {parseErr && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)' }}>
              <AlertCircle size={14} style={{ color: 'var(--severity-critical)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--severity-critical)' }}>{parseErr}</span>
            </div>
          )}

          {/* ── Preview ── */}
          {rows && rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Summary pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''} parsed</span>
                {validCount > 0  && <Pill color="var(--severity-low)"      bg="rgba(86,211,100,0.12)" text={`${validCount} valid`} />}
                {dupeCount > 0   && <Pill color="var(--severity-medium)"   bg="var(--accent-dim)"     text={`${dupeCount} duplicate${dupeCount !== 1 ? 's' : ''}`} />}
                {errCount > 0    && <Pill color="var(--severity-critical)" bg="rgba(248,81,73,0.10)"  text={`${errCount} error${errCount !== 1 ? 's' : ''}`} />}
              </div>

              {/* Preview table */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 90px auto', padding: '6px 12px', background: 'var(--bg-surface)', gap: 8 }}>
                  {['Rule ID', 'Title', 'Domain', 'Severity', 'Status'].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>
                {preview.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid', gridTemplateColumns: '90px 1fr 120px 90px auto',
                      padding: '8px 12px', gap: 8, alignItems: 'center',
                      borderTop: '1px solid var(--border-subtle)',
                      background: row.errors.length > 0 ? 'rgba(248,81,73,0.04)' : row.isDuplicate ? 'rgba(62,207,207,0.03)' : 'var(--bg-card)',
                    }}
                  >
                    <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {row.raw.rule_id || '—'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.raw.title || '—'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.raw.domain || '—'}
                    </span>
                    <span>
                      {row.raw.severity && VALID_SEVERITIES.includes(row.raw.severity)
                        ? <SeverityBadge severity={row.raw.severity} />
                        : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.raw.severity || '—'}</span>
                      }
                    </span>
                    <span>
                      {row.errors.length > 0
                        ? <span title={row.errors.join(', ')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--severity-critical)', cursor: 'help' }}>
                            <AlertCircle size={12} /> Error
                          </span>
                        : row.isDuplicate
                          ? <span style={{ fontSize: 11, color: 'var(--severity-medium)', fontWeight: 600 }}>Duplicate</span>
                          : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--severity-low)', fontWeight: 600 }}>
                              <CheckCircle2 size={12} /> Valid
                            </span>
                      }
                    </span>
                  </div>
                ))}
                {rows.length > 5 && (
                  <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-muted)' }}>
                    + {rows.length - 5} more rows not shown
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || validCount === 0}
            style={{
              flex: 2, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: validCount > 0 && !importing ? 'var(--accent)' : 'var(--bg-card)',
              color: validCount > 0 && !importing ? 'var(--bg-base)' : 'var(--text-muted)',
              border: 'none', cursor: validCount > 0 && !importing ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {importing
              ? <><Loader2 size={13} className="animate-spin" /> Importing…</>
              : `Import ${validCount > 0 ? validCount : ''} Valid Rule${validCount !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: bg }}>
      {text}
    </span>
  )
}
