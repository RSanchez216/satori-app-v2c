import type { AlertSeverity } from '@/types/database'

const CONFIG: Record<AlertSeverity, { label: string; color: string; bg: string; dot: string }> = {
  critical: {
    label: 'Critical',
    color: '#f85149',
    bg:    'rgba(248,81,73,0.12)',
    dot:   '#f85149',
  },
  high: {
    label: 'High',
    color: '#e3b341',
    bg:    'rgba(227,179,65,0.12)',
    dot:   '#e3b341',
  },
  medium: {
    label: 'Medium',
    color: '#3ecfcf',
    bg:    'rgba(62,207,207,0.12)',
    dot:   '#3ecfcf',
  },
  low: {
    label: 'Low',
    color: '#56d364',
    bg:    'rgba(86,211,100,0.12)',
    dot:   '#56d364',
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
        style={{ background: c.dot }}
      />
      {c.label}
    </span>
  )
}
