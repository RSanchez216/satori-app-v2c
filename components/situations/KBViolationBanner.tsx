'use client'

import { ShieldAlert, ArrowUpRight } from 'lucide-react'

interface Props {
  ruleName: string
  expectedOutcome?: string | null
  overdueText?: string | null
  onEscalate?: () => void
}

export function KBViolationBanner({ ruleName, expectedOutcome, overdueText, onEscalate }: Props) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg"
      style={{
        background: 'var(--kb-purple-dim)',
        border: '1px solid rgba(179,146,240,0.2)',
      }}
    >
      <ShieldAlert
        size={14}
        className="flex-shrink-0 mt-0.5"
        style={{ color: 'var(--kb-purple)' }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] font-semibold"
          style={{ color: 'var(--kb-purple)' }}
        >
          KB Rule Violated:{' '}
          <span className="font-bold">&ldquo;{ruleName}&rdquo;</span>
        </p>
        {expectedOutcome && (
          <p
            className="text-[11px] mt-0.5 leading-relaxed"
            style={{ color: 'rgba(179,146,240,0.75)' }}
          >
            {expectedOutcome}
            {overdueText && (
              <span
                className="ml-1.5 font-semibold"
                style={{ color: 'var(--severity-critical)' }}
              >
                {overdueText}
              </span>
            )}
          </p>
        )}
      </div>
      {onEscalate && (
        <button
          onClick={onEscalate}
          className="btn-purple flex-shrink-0 text-[11px] px-2.5 py-1"
        >
          <ArrowUpRight size={11} />
          Escalate
        </button>
      )}
    </div>
  )
}
