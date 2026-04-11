'use client'

export type StatusFilter =
  | 'all'
  | 'open'
  | 'kb_flagged'
  | 'pending'
  | 'resolved'

export type DeptFilter =
  | 'All'
  | 'Dispatch'
  | 'Safety'
  | 'Accounting'
  | 'Compliance'
  | 'Fleet'
  | 'HR'

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'open',      label: 'Open' },
  { id: 'kb_flagged', label: 'KB Flagged' },
  { id: 'pending',   label: 'Pending' },
  { id: 'resolved',  label: 'Resolved' },
]

const DEPT_CHIPS: DeptFilter[] = [
  'All', 'Dispatch', 'Safety', 'Accounting', 'Compliance', 'Fleet', 'HR',
]

interface Props {
  status: StatusFilter
  dept: DeptFilter
  totalCounts: Partial<Record<StatusFilter, number>>
  onStatus: (s: StatusFilter) => void
  onDept: (d: DeptFilter) => void
}

export function SituationFilters({ status, dept, totalCounts, onStatus, onDept }: Props) {
  return (
    <div
      className="flex items-center gap-1 flex-wrap py-2 px-3 rounded-xl"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Status chips */}
      <div className="flex items-center gap-1">
        {STATUS_CHIPS.map((chip) => {
          const active = status === chip.id
          const count = totalCounts[chip.id]
          return (
            <button
              key={chip.id}
              onClick={() => onStatus(chip.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-all duration-150"
              style={{
                borderRadius: 8,
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                border: active ? '1px solid rgba(62,207,207,0.25)' : '1px solid transparent',
              }}
            >
              {chip.id === 'kb_flagged' && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--kb-purple)' }}
                />
              )}
              {chip.label}
              {count !== undefined && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: active ? 'rgba(62,207,207,0.2)' : 'var(--bg-elevated)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div
        className="w-px h-5 mx-1"
        style={{ background: 'var(--border-subtle)' }}
      />

      {/* Dept chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {DEPT_CHIPS.map((d) => {
          const active = dept === d
          return (
            <button
              key={d}
              onClick={() => onDept(d)}
              className="px-2.5 py-1 text-[12px] font-medium transition-all duration-150 rounded"
              style={{
                background: active ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
