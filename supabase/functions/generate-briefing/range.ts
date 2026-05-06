// @ts-nocheck

/**
 * Resolve the time range for a briefing run.
 *
 * Watchlist v1 = trailing 24h ending at `now()`. The dispatcher
 * already handles per-briefing timezone for `send_time` matching;
 * the handler's range is just (generated_at - 24h, generated_at)
 * with no per-tz alignment — the consumer cares about "what
 * happened in the last day", not "what happened on a calendar day".
 *
 * Caller can override either bound via the request body.
 */
export function resolveRange(
  template: string,
  override: { range_from?: string; range_to?: string },
): { from: string; to: string } {
  const now = new Date()

  if (override.range_from && override.range_to) {
    return { from: override.range_from, to: override.range_to }
  }

  if (template === 'watchlist') {
    const to   = override.range_to   ?? now.toISOString()
    const from = override.range_from ?? new Date(new Date(to).getTime() - 24 * 60 * 60 * 1000).toISOString()
    return { from, to }
  }

  // Generic fallback for future templates without an explicit window.
  const to   = override.range_to   ?? now.toISOString()
  const from = override.range_from ?? new Date(new Date(to).getTime() - 24 * 60 * 60 * 1000).toISOString()
  return { from, to }
}
