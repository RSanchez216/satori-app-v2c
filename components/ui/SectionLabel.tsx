interface Props {
  icon?: string
  label: string
  count?: number
}

export function SectionLabel({ icon, label, count }: Props) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      {icon && <span className="text-base leading-none">{icon}</span>}
      <span
        className="text-[11px] font-bold uppercase tracking-[0.12em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
        >
          {count}
        </span>
      )}
      <div
        className="flex-1 h-px ml-1"
        style={{ background: 'var(--border-subtle)' }}
      />
    </div>
  )
}
