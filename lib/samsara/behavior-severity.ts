import type { FaultSeverity } from './j1939-codes'

/**
 * Maps Samsara driver-behavior categories to severity levels for display.
 *
 * Aligned with the Driver Watchlist risk-score weights:
 *   distraction × 5            → critical (red)
 *   speeding × 3                → warning  (amber)
 *   harshBrake × 3              → warning  (amber)
 *   def × 3                     → warning  (amber)
 *   idle × 1                    → degraded (cyan)
 *   fuelLow × 1                 → degraded (cyan)
 *
 * The FaultSeverity type and the project's CSS-var-based severity colors
 * are shared with the J1939 fault module — one visual language across
 * mechanical faults and human behaviors.
 *
 * Keys are camelCase to match the existing `DriverRow` field names
 * (`harshBrake`, `fuelLow`) and `ALERT_LABELS` in the report client.
 * `lookupBehavior` normalizes other forms (snake_case, "Harsh Brake")
 * defensively so callers can pass whatever they have.
 */

export const BEHAVIOR_SEVERITY: Record<string, FaultSeverity> = {
  distraction: 'critical',
  speeding:    'warning',
  harshBrake:  'warning',
  def:         'warning',
  idle:        'degraded',
  fuelLow:     'degraded',
}

export const BEHAVIOR_LABEL: Record<string, string> = {
  distraction: 'Distraction',
  speeding:    'Speeding',
  harshBrake:  'Harsh Brake',
  def:         'DEF',
  idle:        'Idle',
  fuelLow:     'Fuel Low',
}

/**
 * Normalize an incoming key to the camelCase canonical form used in the
 * lookup tables. Accepts:
 *   `harshBrake`   → `harshBrake`            (passthrough)
 *   `harsh_brake`  → `harshBrake`            (snake_case)
 *   `harsh-brake`  → `harshBrake`            (kebab-case)
 *   `Harsh Brake`  → `harshBrake`            (display label)
 *   `DEF`          → `def`                   (uppercase shorthand)
 *
 * Anything else falls through unchanged and likely misses the lookup —
 * which is fine, the caller gets the unknown-severity grey-dot path.
 */
function normalize(key: string): string {
  const compact = key.toLowerCase().replace(/[\s_-](.)/g, (_, c) => c.toUpperCase())
  return compact
}

/**
 * Look up a behavior. Always returns a label + severity — unknown
 * behaviors get the raw key as label and 'unknown' severity (grey dot).
 */
export function lookupBehavior(key: string): { label: string; severity: FaultSeverity } {
  // Direct hit on the canonical camelCase key wins; otherwise normalize.
  const k = key in BEHAVIOR_SEVERITY ? key : normalize(key)
  return {
    label:    BEHAVIOR_LABEL[k]    ?? key,
    severity: BEHAVIOR_SEVERITY[k] ?? 'unknown',
  }
}
