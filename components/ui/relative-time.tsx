'use client'

import { useEffect, useState } from 'react'

function format(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 5)    return 'just now'
  if (seconds < 60)   return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

/**
 * Renders a relative-time string ("3m ago") that updates itself every 15s.
 * Lighter than `formatDistanceToNow` for surfaces that need a continuously
 * ticking value — date-fns gives a one-shot string.
 */
export function RelativeTime({ date }: { date: Date }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  return <>{format(date)}</>
}
