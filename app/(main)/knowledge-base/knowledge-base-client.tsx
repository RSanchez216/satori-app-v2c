'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Plus, Upload, ChevronDown, X, BookOpen,
  Shield, Activity, AlertCircle, Pencil, Eye,
  ToggleLeft, ToggleRight, Filter, HelpCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { Tip } from '@/components/ui/Tip'
import { RulePanel } from '@/components/knowledge-base/RulePanel'
import { RuleModal } from '@/components/knowledge-base/RuleModal'
import { ImportRulesModal } from '@/components/knowledge-base/ImportRulesModal'
import { HelpDrawer } from '@/components/knowledge-base/HelpDrawer'
import type { AlertSeverity } from '@/types/database'

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface KBRule {
  rule_id:            string
  title:              string
  domain:             string
  severity:           AlertSeverity
  description:        string
  detection_signals:  string[] | null
  violation_criteria: string
  regulatory_source:  string | null
  recommended_action: string
  escalation_path:    string
  related_rules:      string[] | null
  is_template:        boolean
  is_active:          boolean
  created_at:         string
  updated_at:         string | null
}

/* ── Constants ──────────────────────────────────────────────────────────── */

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
  compliance:            'Compliance',
  operations:            'Operations',
}

const DOMAIN_COLORS = [
  '#3ecfcf', '#b392f0', '#e3b341', '#56d364', '#f85149',
  '#60a5fa', '#f472b6', '#a78bfa', '#34d399', '#fb923c',
]

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
}

function formatDomain(domain: string): string {
  return DOMAIN_DISPLAY[domain] ?? domain.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getDomainColor(domain: string, allDomains: string[]): string {
  const idx = allDomains.indexOf(domain)
  return DOMAIN_COLORS[idx % DOMAIN_COLORS.length]
}

/* ── Main component ─────────────────────────────────────────────────────── */

interface Props { initialRules: KBRule[] }

export function KnowledgeBaseClient({ initialRules }: Props) {
  const [rules,           setRules]           = useState<KBRule[]>(initialRules)
  const [searchQuery,     setSearchQuery]     = useState('')
  const [domainFilter,    setDomainFilter]    = useState<Set<string>>(new Set())
  const [severityFilter,  setSeverityFilter]  = useState<Set<string>>(new Set())
  const [activeFilter,    setActiveFilter]    = useState<'all' | 'active' | 'inactive'>('all')
  const [escalationFilter,setEscalationFilter]= useState<Set<string>>(new Set())
  const [selectedRule,    setSelectedRule]    = useState<KBRule | null>(null)
  const [editingRule,     setEditingRule]     = useState<KBRule | 'new' | null>(null)
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [showImport,      setShowImport]      = useState(false)
  const [showHelp,        setShowHelp]        = useState(false)

  /* Expand all domains on first load */
  useEffect(() => {
    const domains = [...new Set(initialRules.map(r => r.domain))]
    setExpandedDomains(new Set(domains))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* Realtime subscription */
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel('kb-rules-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge_base_rules' }, (p) => {
        if (p.eventType === 'INSERT')
          setRules(prev => prev.find(r => r.rule_id === (p.new as KBRule).rule_id) ? prev : [...prev, p.new as KBRule])
        else if (p.eventType === 'UPDATE')
          setRules(prev => prev.map(r => r.rule_id === (p.new as KBRule).rule_id ? p.new as KBRule : r))
        else if (p.eventType === 'DELETE')
          setRules(prev => prev.filter(r => r.rule_id !== (p.old as KBRule).rule_id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  /* CRUD handlers */
  const handleToggleActive = useCallback(async (rule: KBRule) => {
    const supabase = createClient()
    const next = !rule.is_active
    await supabase
      .from('knowledge_base_rules')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('rule_id', rule.rule_id)
    setRules(prev => prev.map(r => r.rule_id === rule.rule_id ? { ...r, is_active: next } : r))
    if (selectedRule?.rule_id === rule.rule_id) setSelectedRule(r => r ? { ...r, is_active: next } : r)
  }, [selectedRule])

  const handleSaveRule = useCallback(async (data: Partial<KBRule>) => {
    const supabase = createClient()
    const payload = { ...data, updated_at: new Date().toISOString() }
    const { data: saved, error } = await supabase
      .from('knowledge_base_rules')
      .upsert(payload, { onConflict: 'rule_id' })
      .select()
      .single()
    if (!error && saved) {
      setRules(prev => {
        const exists = prev.find(r => r.rule_id === saved.rule_id)
        return exists ? prev.map(r => r.rule_id === saved.rule_id ? saved as KBRule : r) : [...prev, saved as KBRule]
      })
      setEditingRule(null)
    }
    return error
  }, [])

  const handleDeleteRule = useCallback(async (ruleId: string) => {
    if (!confirm('Delete this rule? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('knowledge_base_rules').delete().eq('rule_id', ruleId)
    setRules(prev => prev.filter(r => r.rule_id !== ruleId))
    setSelectedRule(null)
  }, [])

  const handleImported = useCallback((imported: KBRule[]) => {
    setRules(prev => {
      const map = new Map(prev.map(r => [r.rule_id, r]))
      for (const r of imported) map.set(r.rule_id, r)
      return [...map.values()]
    })
  }, [])

  /* Derived data */
  const allDomains = useMemo(() => [...new Set(rules.map(r => r.domain))].sort(), [rules])

  const allEscalationDepts = useMemo(() => {
    const depts = new Set<string>()
    rules.forEach(r => r.escalation_path.split('→').forEach(s => depts.add(s.trim())))
    return [...depts].sort()
  }, [rules])

  const filteredRules = useMemo(() => {
    return rules.filter(rule => {
      if (domainFilter.size > 0    && !domainFilter.has(rule.domain))     return false
      if (severityFilter.size > 0  && !severityFilter.has(rule.severity)) return false
      if (activeFilter === 'active'   && !rule.is_active) return false
      if (activeFilter === 'inactive' &&  rule.is_active) return false
      if (escalationFilter.size > 0) {
        const steps = rule.escalation_path.split('→').map(s => s.trim())
        if (!steps.some(s => escalationFilter.has(s))) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const haystack = [
          rule.title, rule.description, rule.violation_criteria,
          ...(rule.detection_signals ?? []),
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [rules, domainFilter, severityFilter, activeFilter, escalationFilter, searchQuery])

  const rulesByDomain = useMemo(() => {
    const map = new Map<string, KBRule[]>()
    const sorted = [...filteredRules].sort((a, b) => {
      if (a.domain !== b.domain) return a.domain.localeCompare(b.domain)
      return (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    })
    for (const rule of sorted) {
      if (!map.has(rule.domain)) map.set(rule.domain, [])
      map.get(rule.domain)!.push(rule)
    }
    return map
  }, [filteredRules])

  /* Stats */
  const totalRules    = rules.length
  const activeRules   = rules.filter(r => r.is_active).length
  const criticalRules = rules.filter(r => r.severity === 'critical').length

  /* Filter pills */
  const hasFilters = domainFilter.size > 0 || severityFilter.size > 0 ||
    activeFilter !== 'all' || escalationFilter.size > 0 || searchQuery.trim()

  function clearAll() {
    setDomainFilter(new Set()); setSeverityFilter(new Set())
    setActiveFilter('all'); setEscalationFilter(new Set()); setSearchQuery('')
  }

  /* Dropdown options */
  const domainOptions = useMemo(() =>
    allDomains.map(d => ({ value: d, label: formatDomain(d), count: rules.filter(r => r.domain === d).length }))
  , [allDomains, rules])

  const severityOptions = useMemo(() =>
    (['critical', 'high', 'medium', 'low'] as AlertSeverity[]).map(s => ({
      value: s, label: s.charAt(0).toUpperCase() + s.slice(1), count: rules.filter(r => r.severity === s).length,
    }))
  , [rules])

  const escalationOptions = useMemo(() =>
    allEscalationDepts.map(d => ({
      value: d, label: d.charAt(0).toUpperCase() + d.slice(1), count: rules.filter(r => r.escalation_path.includes(d)).length,
    }))
  , [allEscalationDepts, rules])

  const existingRuleIds = useMemo(() => new Set(rules.map(r => r.rule_id)), [rules])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Knowledge Base
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              AI-enforced operational rules · Tori monitors for violations across all sources
            </p>
          </div>
          <Tip text="Open the Knowledge Base guide" side="bottom">
            <button
              onClick={() => setShowHelp(true)}
              style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
            >
              <HelpCircle size={13} />
            </button>
          </Tip>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Tip text="Upload a CSV or JSON file to bulk-import rules" side="bottom">
            <button
              onClick={() => setShowImport(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'transparent', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <Upload size={13} /> Import Rules
            </button>
          </Tip>
          <Tip text="Create a new custom rule" side="bottom">
            <button className="btn-accent" onClick={() => setEditingRule('new')}>
              <Plus size={14} /> New Rule
            </button>
          </Tip>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total Rules" value={totalRules} icon={BookOpen} color="var(--accent)"
          tip="All rules in the knowledge base — active and inactive"
        />
        <StatCard
          label="Active Rules" value={activeRules} icon={Activity} color="var(--severity-low)"
          tip="Rules Tori is currently evaluating messages against"
        />
        <StatCard
          label="Critical Rules" value={criticalRules} icon={AlertCircle} color="var(--severity-critical)"
          tip="Rules marked as critical severity — highest operational risk"
        />
        <StatCard
          label="Violations Today" value={0} icon={Shield} color="var(--text-muted)" placeholder
          tip="Number of situations today that triggered any KB rule — coming soon"
        />
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search rules…"
              style={{
                width: '100%', paddingLeft: 30, paddingRight: searchQuery ? 28 : 10,
                paddingTop: 6, paddingBottom: 6,
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', outline: 'none',
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          <MultiSelectDropdown
            label="Domain" options={domainOptions} selected={domainFilter} onChange={setDomainFilter}
            tip="Filter by operational domain"
          />
          <MultiSelectDropdown
            label="Severity" options={severityOptions} selected={severityFilter} onChange={setSeverityFilter}
            tip="Filter by rule severity level"
          />
          <MultiSelectDropdown
            label="Escalation" options={escalationOptions} selected={escalationFilter} onChange={setEscalationFilter}
            tip="Filter by who gets alerted when the rule triggers"
          />

          {/* Active toggle */}
          <div className="flex items-center" style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'visible', flexShrink: 0 }}>
            <Tip text="Show all rules" side="bottom">
              <button onClick={() => setActiveFilter('all')} style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeFilter === 'all' ? 'var(--accent-dim)' : 'var(--bg-card)', color: activeFilter === 'all' ? 'var(--accent)' : 'var(--text-muted)', borderRight: '1px solid var(--border-subtle)', borderRadius: '8px 0 0 8px' }}>
                All
              </button>
            </Tip>
            <Tip text="Show only active rules Tori is currently enforcing" side="bottom">
              <button onClick={() => setActiveFilter('active')} style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeFilter === 'active' ? 'var(--accent-dim)' : 'var(--bg-card)', color: activeFilter === 'active' ? 'var(--accent)' : 'var(--text-muted)', borderRight: '1px solid var(--border-subtle)' }}>
                Active
              </button>
            </Tip>
            <Tip text="Show only deactivated rules" side="bottom">
              <button onClick={() => setActiveFilter('inactive')} style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeFilter === 'inactive' ? 'var(--accent-dim)' : 'var(--bg-card)', color: activeFilter === 'inactive' ? 'var(--accent)' : 'var(--text-muted)', borderRadius: '0 8px 8px 0' }}>
                Inactive
              </button>
            </Tip>
          </div>

          {hasFilters && (
            <button onClick={clearAll} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <X size={11} /> Clear all
            </button>
          )}
        </div>

        {/* Active filter pills */}
        {hasFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            {[...domainFilter].map(d => (
              <FilterPill key={`domain:${d}`} label={formatDomain(d)} onRemove={() => { const n = new Set(domainFilter); n.delete(d); setDomainFilter(n) }} />
            ))}
            {[...severityFilter].map(s => (
              <FilterPill key={`sev:${s}`} label={s.charAt(0).toUpperCase() + s.slice(1)} onRemove={() => { const n = new Set(severityFilter); n.delete(s); setSeverityFilter(n) }} />
            ))}
            {[...escalationFilter].map(e => (
              <FilterPill key={`esc:${e}`} label={e.charAt(0).toUpperCase() + e.slice(1)} onRemove={() => { const n = new Set(escalationFilter); n.delete(e); setEscalationFilter(n) }} />
            ))}
            {activeFilter !== 'all' && (
              <FilterPill label={activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} onRemove={() => setActiveFilter('all')} />
            )}
            {searchQuery.trim() && (
              <FilterPill label={`"${searchQuery}"`} onRemove={() => setSearchQuery('')} />
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
              {filteredRules.length} of {totalRules} rules
            </span>
          </div>
        )}
      </div>

      {/* ── Domain accordion list ── */}
      {rulesByDomain.size === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No rules match the current filters.</p>
          {hasFilters && <button onClick={clearAll} style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filters</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...rulesByDomain.entries()].map(([domain, domainRules]) => (
            <DomainSection
              key={domain}
              domain={domain}
              rules={domainRules}
              allRules={rules}
              allDomains={allDomains}
              expanded={expandedDomains.has(domain)}
              onToggle={() => {
                setExpandedDomains(prev => {
                  const next = new Set(prev)
                  if (next.has(domain)) next.delete(domain); else next.add(domain)
                  return next
                })
              }}
              onView={setSelectedRule}
              onEdit={setEditingRule}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* ── Overlays ── */}
      {selectedRule && (
        <RulePanel
          rule={selectedRule} allRules={rules}
          onClose={() => setSelectedRule(null)}
          onEdit={(r) => { setEditingRule(r); setSelectedRule(null) }}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteRule}
          onViewRelated={(id) => { const r = rules.find(x => x.rule_id === id); if (r) setSelectedRule(r) }}
        />
      )}
      {editingRule !== null && (
        <RuleModal
          rule={editingRule === 'new' ? null : editingRule}
          allDomains={allDomains}
          allRuleIds={rules.map(r => r.rule_id)}
          onSave={handleSaveRule}
          onClose={() => setEditingRule(null)}
        />
      )}
      {showImport && (
        <ImportRulesModal
          existingRuleIds={existingRuleIds}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
      {showHelp && <HelpDrawer onClose={() => setShowHelp(false)} />}
    </div>
  )
}

/* ── Stat card ──────────────────────────────────────────────────────────── */

function StatCard({ label, value, icon: Icon, color, placeholder, tip }: {
  label:        string
  value:        number
  icon:         React.ElementType
  color:        string
  tip:          string
  placeholder?: boolean
}) {
  return (
    <Tip text={tip} side="bottom">
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 12, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: placeholder ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1 }}>
            {placeholder ? '—' : value.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
        </div>
      </div>
    </Tip>
  )
}

/* ── Domain section (accordion) ─────────────────────────────────────────── */

function DomainSection({ domain, rules, allRules, allDomains, expanded, onToggle, onView, onEdit, onToggleActive }: {
  domain:         string; rules: KBRule[]; allRules: KBRule[]; allDomains: string[]
  expanded:       boolean; onToggle: () => void
  onView:         (r: KBRule) => void; onEdit: (r: KBRule) => void; onToggleActive: (r: KBRule) => void
}) {
  const color         = getDomainColor(domain, allDomains)
  const activeCount   = rules.filter(r => r.is_active).length
  const critCount     = rules.filter(r => r.severity === 'critical').length
  const totalInDomain = allRules.filter(r => r.domain === domain).length

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${color}`, borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '11px 16px', gap: 10, background: 'var(--bg-card)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{formatDomain(domain)}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20, background: `${color}22`, color }}>
          {rules.length} rule{rules.length !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeCount} / {totalInDomain} active</span>
        {critCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: 'rgba(248,81,73,0.12)', color: 'var(--severity-critical)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--severity-critical)', display: 'inline-block' }} />
            {critCount} critical
          </span>
        )}
        <div style={{ flex: 1 }} />
        <ChevronDown size={15} style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '88px auto 1fr auto', padding: '5px 16px', background: 'var(--bg-surface)', gap: 12 }}>
            {['Rule ID', 'Severity', 'Title & Description', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>
          {rules.map((rule, i) => (
            <RuleCard key={rule.rule_id} rule={rule} isLast={i === rules.length - 1} onView={onView} onEdit={onEdit} onToggleActive={onToggleActive} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Rule card ──────────────────────────────────────────────────────────── */

function RuleCard({ rule, isLast, onView, onEdit, onToggleActive }: {
  rule: KBRule; isLast: boolean
  onView: (r: KBRule) => void; onEdit: (r: KBRule) => void; onToggleActive: (r: KBRule) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={() => onView(rule)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid', gridTemplateColumns: '88px auto 1fr auto',
        padding: '9px 16px',
        background: hovered ? 'var(--bg-hover)' : rule.is_active ? 'var(--bg-card)' : 'var(--bg-surface)',
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
        cursor: 'pointer', gap: 12, alignItems: 'center',
        transition: 'background 0.12s', opacity: rule.is_active ? 1 : 0.6,
      }}
    >
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
        {rule.rule_id}
      </span>
      <div style={{ flexShrink: 0 }}>
        <SeverityBadge severity={rule.severity} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rule.title}
          </span>
          {!rule.is_active && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-elevated)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              Inactive
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
          {rule.description}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--text-muted)' }}>
          {rule.escalation_path && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {rule.escalation_path.split('→').map((s, i, arr) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--bg-elevated)', fontWeight: 600 }}>{s.trim()}</span>
                  {i < arr.length - 1 && <span style={{ color: 'var(--text-muted)' }}>›</span>}
                </span>
              ))}
            </span>
          )}
          {(rule.related_rules?.length ?? 0) > 0 && <span>{rule.related_rules!.length} related</span>}
          {rule.regulatory_source && (
            <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {rule.regulatory_source.split(';')[0].slice(0, 30)}
            </span>
          )}
        </div>
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <IconBtn icon={Eye}    tip="View full rule details"  onClick={() => onView(rule)} />
        <IconBtn icon={Pencil} tip="Edit this rule"          onClick={() => onEdit(rule)} />
        <IconBtn
          icon={rule.is_active ? ToggleRight : ToggleLeft}
          tip={rule.is_active
            ? 'Deactivate — Tori will stop evaluating this rule'
            : 'Activate — Tori will start evaluating this rule'
          }
          onClick={() => onToggleActive(rule)}
          color={rule.is_active ? 'var(--severity-low)' : 'var(--text-muted)'}
        />
      </div>
    </div>
  )
}

/* ── Multi-select dropdown ──────────────────────────────────────────────── */

function MultiSelectDropdown({ label, options, selected, onChange, tip }: {
  label:    string
  options:  { value: string; label: string; count: number }[]
  selected: Set<string>
  onChange: (v: Set<string>) => void
  tip:      string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const count = selected.size

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <Tip text={tip} side="bottom">
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: count > 0 ? 'var(--accent-dim)' : 'var(--bg-card)',
            border: `1px solid ${count > 0 ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border-subtle)'}`,
            color: count > 0 ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {label}
          {count > 0 && (
            <span style={{ background: 'var(--accent)', color: 'var(--bg-base)', borderRadius: 10, padding: '0px 5px', fontSize: 10, fontWeight: 800 }}>{count}</span>
          )}
          <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
      </Tip>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 10, overflow: 'hidden', minWidth: 220, maxHeight: 280,
          overflowY: 'auto', boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        }}>
          {count > 0 && (
            <button onClick={() => onChange(new Set())} style={{ width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 11, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
              Clear all
            </button>
          )}
          {options.map(opt => {
            const checked = selected.has(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => { const n = new Set(selected); if (checked) n.delete(opt.value); else n.add(opt.value); onChange(n) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 14px', border: 'none', cursor: 'pointer', textAlign: 'left', background: checked ? 'var(--accent-dim)' : 'transparent', color: checked ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: checked ? 600 : 400 }}
                onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--accent)' : 'transparent', border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-default)'}` }}>
                  {checked && <span style={{ color: 'var(--bg-base)', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </span>
                <span style={{ flex: 1 }}>{opt.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{opt.count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Shared helpers ─────────────────────────────────────────────────────── */

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, display: 'flex', lineHeight: 1 }}>
        <X size={10} />
      </button>
    </span>
  )
}

function IconBtn({ icon: Icon, tip, onClick, color }: {
  icon: React.ElementType; tip: string; onClick: () => void; color?: string
}) {
  return (
    <Tip text={tip} side="top">
      <button
        onClick={onClick}
        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer', color: color ?? 'var(--text-secondary)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)' }}
      >
        <Icon size={12} />
      </button>
    </Tip>
  )
}
