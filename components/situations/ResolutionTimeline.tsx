'use client'

export type TimelineStep = 'detected' | 'tori_alerted' | 'escalated' | 'response' | 'resolved'

const STEPS: { key: TimelineStep; label: string }[] = [
  { key: 'detected',    label: 'Detected' },
  { key: 'tori_alerted', label: 'Tori Alerted' },
  { key: 'escalated',   label: 'Escalated' },
  { key: 'response',    label: 'Response' },
  { key: 'resolved',    label: 'Resolved' },
]

interface Props {
  /** Index of the currently active step (0-based). Steps before this are complete. */
  activeStep: number
}

export function ResolutionTimeline({ activeStep }: Props) {
  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((step, i) => {
        const done   = i < activeStep
        const active = i === activeStep
        const future = i > activeStep

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1 relative">
              {/* Dot */}
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${active ? 'status-pulse-dot' : ''}`}
                style={{
                  background: done
                    ? 'var(--accent)'
                    : active
                    ? 'var(--accent)'
                    : 'var(--bg-elevated)',
                  border: future
                    ? '1.5px solid var(--border-default)'
                    : done || active
                    ? '1.5px solid var(--accent)'
                    : undefined,
                  boxShadow: active
                    ? '0 0 8px rgba(62,207,207,0.5)'
                    : undefined,
                }}
              />
              {/* Label */}
              <span
                className="text-[9px] font-medium text-center whitespace-nowrap absolute top-4"
                style={{
                  color: done || active ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last) */}
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 h-px mx-0.5"
                style={{
                  background: i < activeStep
                    ? 'var(--accent)'
                    : 'var(--border-default)',
                  opacity: i < activeStep ? 0.6 : 0.4,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
