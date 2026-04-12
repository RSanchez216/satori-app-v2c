import type { AlertSeverity } from '@/types/database'

const CONFIG: Record<AlertSeverity, { label: string; color: string; bg: string }> = {
  critical: {
    label: 'Critical',
    color: 'var(--severity-critical)',
    bg:    'rgba(var(--severity-critical-rgb, 248,81,73), 0.12)',
  },
  high: {
    label: 'High',
    color: 'var(--severity-high)',
    bg:    'rgba(var(--severity-high-rgb, 227,179,65), 0.12)',
  },
  medium: {
    label: 'Medium',
    color: 'var(--severity-medium)',
    bg:    'var(--accent-dim)',
  },
  low: {
    label: 'Low',
    color: 'var(--severity-low)',
    bg:    'rgba(var(--severity-low-rgb, 86,211,100), 0.12)',
  },
}

interface Props {
  severity: AlertSeverity
  size?: 'sm' | 'md'
}

export function SeverityBadge({ severity, size = 'sm' }: Props) {
  const c = CONFIG[severity]
  const px = size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'
  const text = size === 'md' ? 'text-[12px]' : 'text-[11px]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wide ${px} ${text}`}
      style={{ color: c.color, background: c.bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: c.color }}
      />
      {c.label}
    </span>
  )
}
