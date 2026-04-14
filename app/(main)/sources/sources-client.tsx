'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Send, Zap, BookOpen, Search, Pencil, X, Check,
  ChevronDown, MoreVertical, Volume2, VolumeX, Power,
  CheckCircle2, Trash2, Clock, Layers, Settings2, Radio,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AddSourceModal } from '@/components/sources/AddSourceModal'
import { EditDepartmentsPanel } from '@/components/sources/EditDepartmentsPanel'
import type { Source, Department } from '@/types/database'

interface Props {
  initialSources:     Source[]
  initialDepartments: Department[]
  messageCountMap:    Record<string, number>
  contextCountMap:    Record<string, number>
  lastMessageMap:     Record<string, string>
}

const STORAGE_KEY = 'satori-dept-expanded'

function loadExpanded(depts: Department[]): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored) as string[])
  } catch { /* ignore */ }
  return new Set(depts.map((d) => d.id).concat('__unassigned__'))
}

function saveExpanded(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s))) } catch { /* ignore */ }
}

/* ─── Main client ─────────────────────────────────────────────────────────── */

export function SourcesClient({
  initialSources,
  initialDepartments,
  messageCountMap,
  contextCountMap,
  lastMessageMap,
}: Props) {
  const [sources,     setSources]     = useState<Source[]>(initialSources)
  const [departments, setDepartments] = useState<Department[]>(initialDepartments)
  const [expanded,    setExpanded]    = useState<Set<string>>(() => new Set())
  const [showModal,   setShowModal]   = useState(false)
  const [showPanel,   setShowPanel]   = useState(false)
  const [newSourceId, setNewSourceId] = useState<string | null>(null)
  const router = useRouter()

  // Hydrate expanded from localStorage after mount
  useEffect(() => {
    setExpanded(loadExpanded(departments))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveExpanded(next)
      return next
    })
  }

  /* Realtime */
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel('sources-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sources' }, (p) => {
        if (p.eventType === 'INSERT')
          setSources((prev) => prev.find((s) => s.id === (p.new as Source).id) ? prev : [p.new as Source, ...prev])
        else if (p.eventType === 'UPDATE')
          setSources((prev) => prev.map((s) => s.id === (p.new as Source).id ? p.new as Source : s))
        else if (p.eventType === 'DELETE')
          setSources((prev) => prev.filter((s) => s.id !== (p.old as Source).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  /* CRUD */
  function handleAdded(src: Source) {
    setSources((prev) => [src, ...prev])
    setNewSourceId(src.id)
    setTimeout(() => setNewSourceId(null), 2500)
  }

  async function handleToggleActive(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('sources').update({ is_active: !current }).eq('id', id)
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, is_active: !current } : s))
  }

  async function handleToggleMute(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('sources').update({ muted: !current }).eq('id', id)
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, muted: !current } : s))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this source? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('sources').delete().eq('id', id)
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  async function handleRename(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('sources').update({ name }).eq('id', id)
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, name } : s))
  }

  async function handleAssignDept(sourceId: string, deptId: string | null) {
    const supabase = createClient()
    await supabase.from('sources').update({ department_id: deptId }).eq('id', sourceId)
    setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, department_id: deptId } : s))
  }

  async function handleActivate(src: Source, displayName: string) {
    try {
      const res  = await fetch('/api/sources/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: src.id, display_name: displayName }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSources((prev) => prev.map((s) => s.id === src.id ? { ...s, is_active: true, name: displayName } : s))
      setNewSourceId(src.id)
      setTimeout(() => setNewSourceId(null), 2500)
      toast.success(`Now monitoring ${displayName}`)
      router.refresh()
    } catch { toast.error('Failed to activate source') }
  }

  async function handleDismiss(id: string) {
    try {
      await fetch('/api/sources/dismiss', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: id }),
      })
      setSources((prev) => prev.filter((s) => s.id !== id))
      toast.success('Group dismissed')
    } catch { toast.error('Failed to dismiss group') }
  }

  const activeSources   = sources.filter((s) => s.is_active)
  const detectedSources = sources.filter((s) => !s.is_active && s.auto_detected && !s.dismissed_at)
  const telegramCount   = activeSources.filter((s) => s.type === 'telegram').length
  const totalMessages   = Object.values(messageCountMap).reduce((a, b) => a + b, 0)

  // Group by department (only depts that have ≥1 active source)
  const grouped = departments
    .map((dept) => ({ dept, sources: activeSources.filter((s) => s.department_id === dept.id) }))
    .filter((g) => g.sources.length > 0)
  const unassigned = activeSources.filter((s) => !s.department_id)

  const rowProps = {
    messageCountMap, contextCountMap, lastMessageMap,
    departments, newSourceId,
    onToggleActive: handleToggleActive,
    onToggleMute:   handleToggleMute,
    onDelete:       handleDelete,
    onRename:       handleRename,
    onAssignDept:   handleAssignDept,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Sources
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            Connect Telegram groups, email inboxes, and voice channels for Tori to monitor
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowPanel(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <Settings2 size={13} /> Departments
          </button>
          <button className="btn-accent" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Add Source
          </button>
        </div>
      </div>

      {/* Detected Groups Banner */}
      {detectedSources.length > 0 && (
        <DetectedGroupsBanner
          sources={detectedSources}
          onActivate={handleActivate}
          onDismiss={handleDismiss}
        />
      )}

      {/* Stats bar */}
      {activeSources.length > 0 && (
        <div
          className="flex items-center gap-6 px-5 py-3 rounded-xl flex-wrap"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <SummaryStat label="Active Sources" value={activeSources.length} color="var(--accent)" />
          <Divider />
          <SummaryStat label="Telegram" value={telegramCount} color="var(--accent)" />
          <Divider />
          <SummaryStat label="Messages Ingested" value={totalMessages.toLocaleString()} color="var(--text-secondary)" />
        </div>
      )}

      {/* Source types bar */}
      <div
        className="flex items-center gap-4 px-4 py-3 rounded-xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 12 }}
      >
        <div className="flex items-center gap-2" style={{ color: 'var(--accent)' }}>
          <Send size={13} />
          <span className="font-semibold">Telegram</span>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'rgba(86,211,100,0.15)', color: 'var(--severity-low)', fontWeight: 700 }}>Available</span>
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <BookOpen size={13} />
          <span>Email Inbox</span>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontWeight: 700 }}>Coming Soon</span>
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Zap size={13} />
          <span>Voice / Phone</span>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontWeight: 700 }}>Coming Soon</span>
        </div>
      </div>

      {/* Department Accordion */}
      {activeSources.length === 0 ? (
        detectedSources.length === 0 && <EmptyState onAdd={() => setShowModal(true)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {grouped.map(({ dept, sources: deptSources }) => (
            <DepartmentSection
              key={dept.id}
              dept={dept}
              sources={deptSources}
              expanded={expanded.has(dept.id)}
              onToggle={() => toggleExpanded(dept.id)}
              {...rowProps}
            />
          ))}
          {unassigned.length > 0 && (
            <DepartmentSection
              key="__unassigned__"
              dept={{ id: '__unassigned__', name: 'Unassigned', color: '#64748b', icon: '📌', display_order: 999, created_at: '' }}
              sources={unassigned}
              expanded={expanded.has('__unassigned__')}
              onToggle={() => toggleExpanded('__unassigned__')}
              {...rowProps}
            />
          )}
        </div>
      )}

      {showModal && (
        <AddSourceModal
          departments={departments}
          onClose={() => setShowModal(false)}
          onAdded={(src) => { handleAdded(src as Source); setShowModal(false) }}
        />
      )}

      {showPanel && (
        <EditDepartmentsPanel
          departments={departments}
          sources={activeSources}
          onClose={() => setShowPanel(false)}
          onDepartmentsChange={setDepartments}
          onAssignDept={handleAssignDept}
        />
      )}
    </div>
  )
}

/* ─── Department Section ──────────────────────────────────────────────────── */

interface SectionProps {
  dept:            Department
  sources:         Source[]
  expanded:        boolean
  onToggle:        () => void
  messageCountMap: Record<string, number>
  contextCountMap: Record<string, number>
  lastMessageMap:  Record<string, string>
  departments:     Department[]
  newSourceId:     string | null
  onToggleActive:  (id: string, current: boolean) => void
  onToggleMute:    (id: string, current: boolean) => void
  onDelete:        (id: string) => void
  onRename:        (id: string, name: string) => void
  onAssignDept:    (sourceId: string, deptId: string | null) => void
}

function DepartmentSection({
  dept, sources, expanded, onToggle,
  messageCountMap, contextCountMap, lastMessageMap,
  departments, newSourceId,
  onToggleActive, onToggleMute, onDelete, onRename, onAssignDept,
}: SectionProps) {
  const totalMsgs = sources.reduce((n, s) => n + (messageCountMap[s.id] ?? 0), 0)
  const totalCtx  = sources.reduce((n, s) => n + (contextCountMap[s.id] ?? 0), 0)
  const liveCount = sources.filter((s) => s.is_active).length

  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderLeft: `3px solid ${dept.color}`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Section header */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', width: '100%',
          padding: '11px 16px', gap: 10,
          background: 'var(--bg-card)', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{dept.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{dept.name}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20,
          background: `${dept.color}22`, color: dept.color,
        }}>
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
        {liveCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
            background: 'rgba(86,211,100,0.12)', color: 'var(--severity-low)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--severity-low)', display: 'inline-block' }} />
            {liveCount} live
          </span>
        )}
        <div style={{ flex: 1 }} />
        {totalMsgs > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{totalMsgs.toLocaleString()}</span> msgs
          </span>
        )}
        {totalCtx > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{totalCtx}</span> ctx
          </span>
        )}
        <ChevronDown
          size={15}
          style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }}
        />
      </button>

      {/* Source rows */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 76px 80px 70px 100px 32px',
            padding: '5px 16px',
            background: 'var(--bg-surface)',
            gap: 8,
            alignItems: 'center',
          }}>
            {['Source', 'Status', 'Messages', 'Contexts', 'Last Active', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {h}
              </span>
            ))}
          </div>
          {sources.map((src, i) => (
            <SourceRow
              key={src.id}
              source={src}
              messageCount={messageCountMap[src.id] ?? 0}
              contextCount={contextCountMap[src.id] ?? 0}
              lastMessageAt={lastMessageMap[src.id] ?? null}
              departments={departments}
              isNew={newSourceId === src.id}
              isLast={i === sources.length - 1}
              onToggleActive={onToggleActive}
              onToggleMute={onToggleMute}
              onDelete={onDelete}
              onRename={onRename}
              onAssignDept={onAssignDept}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Source Row ──────────────────────────────────────────────────────────── */

interface RowProps {
  source:         Source
  messageCount:   number
  contextCount:   number
  lastMessageAt:  string | null
  departments:    Department[]
  isNew:          boolean
  isLast:         boolean
  onToggleActive: (id: string, current: boolean) => void
  onToggleMute:   (id: string, current: boolean) => void
  onDelete:       (id: string) => void
  onRename:       (id: string, name: string) => void
  onAssignDept:   (sourceId: string, deptId: string | null) => void
}

function SourceRow({
  source, messageCount, contextCount, lastMessageAt, departments,
  isNew, isLast,
  onToggleActive, onToggleMute, onDelete, onRename, onAssignDept,
}: RowProps) {
  const [menuOpen,       setMenuOpen]       = useState(false)
  const [showDeptPicker, setShowDeptPicker] = useState(false)
  const [renaming,       setRenaming]       = useState(false)
  const [nameVal,        setNameVal]        = useState(source.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (renaming) inputRef.current?.focus() }, [renaming])

  const lastActive = lastMessageAt ? timeAgo(lastMessageAt) : timeAgo(source.created_at)

  function commitRename() {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== source.name) onRename(source.id, trimmed)
    else setNameVal(source.name)
    setRenaming(false)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 76px 80px 70px 100px 32px',
      padding: '9px 16px',
      background: isNew ? 'rgba(var(--accent-rgb),0.04)' : 'var(--bg-card)',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
      alignItems: 'center',
      gap: 8,
      transition: 'background 0.4s',
    }}>

      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: 'var(--accent-dim)', border: '1px solid rgba(var(--accent-rgb),0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: 'var(--accent)',
        }}>
          {source.name.charAt(0).toUpperCase()}
        </div>
        {renaming ? (
          <input
            ref={inputRef}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameVal(source.name); setRenaming(false) } }}
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.3)',
              borderRadius: 5, padding: '2px 8px', outline: 'none', width: '100%',
            }}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {source.name}
          </span>
        )}
        {source.muted && <VolumeX size={11} style={{ color: 'var(--severity-high)', flexShrink: 0 }} />}
      </div>

      {/* Status */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, width: 'fit-content',
        background: source.is_active ? 'rgba(86,211,100,0.10)' : 'var(--bg-elevated)',
        color: source.is_active ? 'var(--severity-low)' : 'var(--text-muted)',
        border: source.is_active ? '1px solid rgba(86,211,100,0.2)' : '1px solid var(--border-subtle)',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: source.is_active ? 'var(--severity-low)' : 'var(--text-muted)', display: 'inline-block', flexShrink: 0 }} />
        {source.is_active ? 'Live' : 'Offline'}
      </div>

      {/* Messages */}
      <span style={{ fontSize: 13, fontWeight: 700, color: messageCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
        {messageCount.toLocaleString()}
      </span>

      {/* Contexts */}
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {contextCount}
      </span>

      {/* Last active */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Clock size={10} style={{ flexShrink: 0 }} /> {lastActive}
      </span>

      {/* ⋮ Menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 5, display: 'flex', alignItems: 'center' }}
        >
          <MoreVertical size={14} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setMenuOpen(false); setShowDeptPicker(false) }} />
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 20,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, overflow: 'hidden', minWidth: 190, boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
            }}>
              <MenuItem icon={Pencil} label="Rename" onClick={() => { setRenaming(true); setMenuOpen(false) }} />
              <MenuItem
                icon={Layers}
                label="Move to Department"
                onClick={() => setShowDeptPicker((o) => !o)}
                suffix={<ChevronDown size={11} style={{ transform: showDeptPicker ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
              />
              {showDeptPicker && (
                <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', padding: '4px 8px' }}>
                  {departments.map((dept) => (
                    <button
                      key={dept.id}
                      onClick={() => { onAssignDept(source.id, dept.id); setMenuOpen(false); setShowDeptPicker(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                        background: source.department_id === dept.id ? 'var(--accent-dim)' : 'transparent',
                        color: source.department_id === dept.id ? 'var(--accent)' : 'var(--text-secondary)',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dept.color, flexShrink: 0 }} />
                      {dept.icon} {dept.name}
                    </button>
                  ))}
                  <button
                    onClick={() => { onAssignDept(source.id, null); setMenuOpen(false); setShowDeptPicker(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                      background: !source.department_id ? 'var(--accent-dim)' : 'transparent',
                      color: !source.department_id ? 'var(--accent)' : 'var(--text-muted)',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b', flexShrink: 0 }} />
                    📌 Unassigned
                  </button>
                </div>
              )}
              <div style={{ height: 1, margin: '0 10px', background: 'var(--border-subtle)' }} />
              <MenuItem
                icon={source.muted ? Volume2 : VolumeX}
                label={source.muted ? 'Unmute' : 'Mute alerts'}
                onClick={() => { onToggleMute(source.id, source.muted); setMenuOpen(false) }}
              />
              <MenuItem
                icon={source.is_active ? Power : CheckCircle2}
                label={source.is_active ? 'Deactivate' : 'Activate'}
                onClick={() => { onToggleActive(source.id, source.is_active); setMenuOpen(false) }}
              />
              <div style={{ height: 1, margin: '0 10px', background: 'var(--border-subtle)' }} />
              <MenuItem icon={Trash2} label="Delete source" danger onClick={() => { onDelete(source.id); setMenuOpen(false) }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Detected Groups Banner ──────────────────────────────────────────────── */

function DetectedGroupsBanner({
  sources, onActivate, onDismiss,
}: { sources: Source[]; onActivate: (src: Source, name: string) => Promise<void>; onDismiss: (id: string) => Promise<void> }) {
  return (
    <div style={{ background: 'rgba(227,179,65,0.05)', border: '1px solid rgba(227,179,65,0.2)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex items-center gap-2">
        <Search size={14} style={{ color: 'var(--severity-high)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--severity-high)' }}>
          {sources.length} New Group{sources.length !== 1 ? 's' : ''} Detected
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>
          SATORI found new Telegram groups with your bot
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.map((src) => (
          <DetectedSourceRow key={src.id} src={src} onActivate={onActivate} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}

function DetectedSourceRow({ src, onActivate, onDismiss }: { src: Source; onActivate: (src: Source, name: string) => Promise<void>; onDismiss: (id: string) => Promise<void> }) {
  const [name,      setName]      = useState(src.telegram_group_name || src.name || '')
  const [editing,   setEditing]   = useState(false)
  const [confirming,setConfirm]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const timeAgoStr = src.detected_at ? timeAgo(src.detected_at) : 'just now'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(227,179,65,0.1)' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(62,207,207,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Send size={13} style={{ color: 'var(--accent)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditing(false)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false) }}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', background: 'rgba(62,207,207,0.06)', border: '1px solid rgba(62,207,207,0.3)', borderRadius: 6, padding: '2px 8px', outline: 'none', width: '100%', maxWidth: 240 }}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
            <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}>
              <Pencil size={11} />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{src.external_id}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· Detected {timeAgoStr}</span>
        </div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sure?</span>
          <button onClick={async () => { setLoading(true); await onDismiss(src.id); setLoading(false) }} disabled={loading}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--bell-error)', background: 'var(--bell-error-bg)', border: '1px solid var(--bell-error-border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            {loading ? '…' : 'Yes'}
          </button>
          <button onClick={() => setConfirm(false)} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button onClick={async () => { setLoading(true); await onActivate(src, name.trim() || src.name); setLoading(false) }} disabled={loading}
            style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 7, padding: '5px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: loading ? 0.7 : 1, boxShadow: '0 0 10px var(--accent-glow)' }}>
            {loading ? '…' : <><Check size={11} /> Start Monitoring</>}
          </button>
          <button onClick={() => setConfirm(true)}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
            <X size={12} style={{ display: 'inline', marginRight: 3 }} /> Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function MenuItem({
  icon: Icon, label, onClick, danger, suffix,
}: { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean; suffix?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full text-left transition-colors"
      style={{ padding: '9px 14px', fontSize: 12, fontWeight: 500, color: danger ? 'var(--severity-critical)' : 'var(--text-secondary)', justifyContent: 'space-between' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = danger ? 'rgba(248,81,73,0.08)' : 'var(--bg-hover)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <span className="flex items-center gap-2.5"><Icon size={13} />{label}</span>
      {suffix}
    </button>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', alignSelf: 'center' }} />
}

function SummaryStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}</span>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '64px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16 }}>
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <circle cx="36" cy="36" r="34" stroke="var(--border-subtle)" strokeWidth="1.5" />
        <circle cx="36" cy="36" r="22" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="36" cy="36" r="10" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
        <circle cx="36" cy="36" r="16" stroke="var(--accent)" strokeWidth="0.75" opacity="0.2" />
        <circle cx="36" cy="36" r="4" fill="#3ecfcf" opacity="0.5" />
      </svg>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No sources connected</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          Connect your first Telegram group and Tori will start monitoring messages, building context windows, and detecting situations automatically.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button className="btn-accent" onClick={onAdd}><Radio size={14} /> Connect Telegram Source</button>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Or just add your bot to any group — SATORI will detect it automatically</p>
      </div>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins  = Math.floor(diff / 60000)
  if (days > 0)  return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${mins}m ago`
}
