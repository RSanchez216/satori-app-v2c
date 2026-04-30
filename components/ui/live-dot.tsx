'use client'

import type { RealtimeStatus } from '@/lib/hooks/use-live-data'

interface LiveDotProps {
  status: RealtimeStatus
  /** Diameter in px. Default 6. */
  size?:  number
}

/**
 * Tiny per-tile freshness indicator. Returns null when realtime is
 * `disabled` (no subscription) so tiles that don't subscribe show nothing
 * rather than a confusing static dot. Hovering reveals the status word.
 */
export function LiveDot({ status, size = 6 }: LiveDotProps) {
  if (status === 'disabled') return null

  const color =
    status === 'connected'    ? 'var(--severity-low)'  :
    status === 'disconnected' ? 'var(--severity-high)' :
                                'var(--text-muted)'    // connecting

  const pulse = status === 'connected'
  const titleText =
    status === 'connected'    ? 'Live — receiving updates' :
    status === 'disconnected' ? 'Reconnecting…'            :
                                'Connecting…'

  return (
    <span
      className="relative inline-flex"
      style={{ width: size, height: size }}
      title={titleText}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: color }}
      />
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: color, opacity: 0.6 }}
        />
      )}
    </span>
  )
}
