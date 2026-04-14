'use client'

import { useState } from 'react'
import { X, Plus, ChevronUp, ChevronDown, Pencil, Trash2, Check, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import type { Department, Source } from '@/types/database'

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#64748b', '#6366f1', '#a78bfa', '#84cc16',
]

const PRESET_ICONS = [
  '🚚','🚛','✈️','🔧','💰','📋','👥','💬',
  '⚠️','🏢','📦','🔔','🎯','💡','📌','🔑',
  '🛡️','📊','🌐','⚡','🚗','🏗️','📞','🖥️',
]

interface Props {
  departments:        Department[]
  sources:            Source[]
  onClose:            () => void
  onDepartmentsChange:(depts: Department[]) => void
  onAssignDept:       (sourceId: string, deptId: string | null) => void
}

export function EditDepartmentsPanel({ departments, sources, onClose, onDepartmentsChange, onAssignDept }: Props) {
  const [depts,    setDepts]    = useState<Department[]>(departments)
  const [editingId,setEditingId]= useState<string | null>(null)
  const [adding,   setAdding]   = useState(false)

  // Draft state for inline editing / new dept form
  const [draftName, setDraftName] = useState('')
  const [draftColor,setDraftColor]= useState(PRESET_COLORS[0])
  const [draftIcon, setDraftIcon] = useState(PRESET_ICONS[0])

  function startEdit(dept: Department) {
    setEditingId(dept.id)
    setDraftName(dept.name)
    setDraftColor(dept.color)
    setDraftIcon(dept.icon)
    setAdding(false)
  }

  function startAdd() {
    setAdding(true)
    setEditingId(null)
    setDraftName('')
    setDraftColor(PRESET_COLORS[depts.length % PRESET_COLORS.length])
    setDraftIcon(PRESET_ICONS[depts.length % PRESET_ICONS.length])
  }

  async function saveEdit(id: string) {
    if (!draftName.trim()) return
    try {
      const res  = await fetch(`/api/departments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName.trim(), color: draftColor, icon: draftIcon }),
      })
      const updated = await res.json()
      const next = depts.map((d) => d.id === id ? updated : d)
      setDepts(next)
      onDepartmentsChange(next)
      setEditingId(null)
    } catch { toast.error('Failed to save') }
  }

  async function saveAdd() {
    if (!draftName.trim()) return
    try {
      const res  = await fetch('/api/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName.trim(), color: draftColor, icon: draftIcon, display_order: depts.length + 1 }),
      })
      const created = await res.json()
      const next = [...depts, created]
      setDepts(next)
      onDepartmentsChange(next)
      setAdding(false)
      toast.success(`Department "${created.name}" created`)
    } catch { toast.error('Failed to create department') }
  }

  async function deleteDept(id: string) {
    const dept    = depts.find((d) => d.id === id)
    const srcCount = sources.filter((s) => s.department_id === id).length
    const msg = srcCount > 0
      ? `Delete "${dept?.name}"? ${srcCount} source${srcCount !== 1 ? 's' : ''} will become Unassigned.`
      : `Delete "${dept?.name}"?`
    if (!confirm(msg)) return
    try {
      await fetch(`/api/departments/${id}`, { method: 'DELETE' })
      const next = depts.filter((d) => d.id !== id)
      setDepts(next)
      onDepartmentsChange(next)
      toast.success('Department deleted')
    } catch { toast.error('Failed to delete') }
  }

  async function moveOrder(id: string, dir: -1 | 1) {
    const idx = depts.findIndex((d) => d.id === id)
    if (idx < 0) return
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= depts.length) return

    const next = [...depts]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    // Reassign display_order
    const withOrder = next.map((d, i) => ({ ...d, display_order: i + 1 }))
    setDepts(withOrder)
    onDepartmentsChange(withOrder)

    // Persist both swapped items
    await Promise.all([
      fetch(`/api/departments/${next[idx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_order: idx + 1 }) }),
      fetch(`/api/departments/${next[swapIdx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_order: swapIdx + 1 }) }),
    ])
  }

  const unassignedSources = sources.filter((s) => !s.department_id)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col"
        style={{
          width: 420,
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Manage Departments</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Organize sources into departments</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Department list */}
          {depts.map((dept, idx) => {
            const srcCount = sources.filter((s) => s.department_id === dept.id).length
            const isEditing = editingId === dept.id

            return (
              <div
                key={dept.id}
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${dept.color}`,
                  background: 'var(--bg-card)',
                  overflow: 'hidden',
                }}
              >
                {/* Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  <GripVertical size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{dept.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{dept.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {srcCount} source{srcCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* Reorder */}
                  <button onClick={() => moveOrder(dept.id, -1)} disabled={idx === 0}
                    style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', padding: 2, opacity: idx === 0 ? 0.3 : 1 }}>
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={() => moveOrder(dept.id, 1)} disabled={idx === depts.length - 1}
                    style={{ background: 'none', border: 'none', cursor: idx === depts.length - 1 ? 'default' : 'pointer', color: idx === depts.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)', padding: 2, opacity: idx === depts.length - 1 ? 0.3 : 1 }}>
                    <ChevronDown size={13} />
                  </button>
                  <button onClick={() => isEditing ? setEditingId(null) : startEdit(dept)}
                    style={{ background: isEditing ? 'var(--accent-dim)' : 'none', border: 'none', cursor: 'pointer', color: isEditing ? 'var(--accent)' : 'var(--text-muted)', padding: '3px 6px', borderRadius: 5 }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => deleteDept(dept.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 6px', borderRadius: 5 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--severity-critical)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <DeptForm
                    name={draftName} color={draftColor} icon={draftIcon}
                    onName={setDraftName} onColor={setDraftColor} onIcon={setDraftIcon}
                    onSave={() => saveEdit(dept.id)}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            )
          })}

          {/* Add new dept form */}
          {adding && (
            <div style={{ borderRadius: 10, border: '1px solid rgba(var(--accent-rgb),0.3)', borderLeft: `3px solid ${draftColor}`, background: 'var(--bg-card)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{draftIcon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>New Department</span>
              </div>
              <DeptForm
                name={draftName} color={draftColor} icon={draftIcon}
                onName={setDraftName} onColor={setDraftColor} onIcon={setDraftIcon}
                onSave={saveAdd}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}

          {/* Add button */}
          {!adding && (
            <button
              onClick={startAdd}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', borderRadius: 10, border: '1px dashed var(--border-default)',
                background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
            >
              <Plus size={14} /> Add Department
            </button>
          )}

          {/* Unassigned sources section */}
          {unassignedSources.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                Unassigned Sources ({unassignedSources.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unassignedSources.map((src) => (
                  <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                      {src.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {src.name}
                    </span>
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) onAssignDept(src.id, e.target.value) }}
                      style={{ fontSize: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', padding: '3px 6px', cursor: 'pointer' }}
                    >
                      <option value="" disabled>Assign…</option>
                      {depts.map((d) => (
                        <option key={d.id} value={d.id}>{d.icon} {d.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Dept Form (shared for edit + add) ──────────────────────────────────── */

function DeptForm({ name, color, icon, onName, onColor, onIcon, onSave, onCancel }: {
  name: string; color: string; icon: string
  onName: (v: string) => void; onColor: (v: string) => void; onIcon: (v: string) => void
  onSave: () => void; onCancel: () => void
}) {
  return (
    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-subtle)' }}>
      {/* Name */}
      <div style={{ paddingTop: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>NAME</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
          placeholder="Department name"
          style={{ width: '100%', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '7px 10px', outline: 'none' }}
        />
      </div>

      {/* Color */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>COLOR</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onColor(c)}
              style={{ width: 24, height: 24, borderRadius: 6, background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 1 }}
            />
          ))}
        </div>
      </div>

      {/* Icon */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ICON</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {PRESET_ICONS.map((em) => (
            <button
              key={em}
              onClick={() => onIcon(em)}
              style={{ fontSize: 18, padding: '3px 5px', borderRadius: 6, border: '1px solid', cursor: 'pointer', background: icon === em ? 'var(--accent-dim)' : 'transparent', borderColor: icon === em ? 'rgba(var(--accent-rgb),0.3)' : 'transparent' }}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!name.trim()}
          style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: name.trim() ? 'var(--accent)' : 'var(--border-subtle)', color: name.trim() ? '#fff' : 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          <Check size={12} /> Save
        </button>
      </div>
    </div>
  )
}
